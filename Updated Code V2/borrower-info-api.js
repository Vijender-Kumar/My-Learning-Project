bodyParser = require("body-parser");
const BorrowerinfoCommon = require("../models/borrowerinfo-common-schema.js");
const LoanRequestSchema = require("../models/loan-request-schema.js");
const Company = require("../models/company-schema");
const LoanTemplatesSchema = require("../models/loan-templates-schema.js");
const DefaultServices = require("../models/services-schema");
const helper = require("../util/helper");
const s3helper = require("../util/s3helper");
const jwt = require("../util/jwt");
const leadHelper = require("../util/lead");
const validate = require("../util/validate-req-body.js");
const AccessLog = require("../util/accessLog");
let reqUtils = require("../util/req.js");
const asyncLib = require("async");
const service = require("../services/mail/mail.js");
const moment = require("moment");
const {check, validationResult} = require("express-validator");
const loanStatus = require("../util/loan-status");
const services = require("../util/service");
const middlewares = require("../utils/middlewares.js");
const intrestDpdConfigRevision = require("../models/intrest-dpd-config-revision-schema.js");
const mails = require("../services/mail/genericMails.js");
const CreditlimitSchema = require("../models/credit-limit-schema");
const thirdPartyHelper = require("../util/thirdPartyHelper");
const calculation = require("../util/calculation");
const repayment = require("../util/repayment");
const kycServices = require("../utils/kyc-services.js");
const BureauDetailsSchema = require("../models/bureau-data-schema");
const broadcastEvent = require("../util/disbursalApprovedEvent.js");
const borrowerHelper = require("../util/borrower-helper");
const BureauScorecards = require("../models/bureau-scorecard-schema");
const insuranceHelper = require("../util/insurance-policy-helper.js");

module.exports = (app, connection) => {
  app.use(bodyParser.json());

  const verifyLoanPayload = async (req, res, next) => {
    try {
      var biReqData = req.body;
      biReqData = reqUtils.cleanBody(biReqData);
      if (!Array.isArray(biReqData)) {
        biReqData = [biReqData];
      }
      //find the custom template path of requested template type
      const loanTemplate = await LoanTemplatesSchema.findByNameTmplId(
        req.loanSchema.loan_custom_templates_id,
        "loan"
      );
      if (!loanTemplate)
        throw {
          message: "No records found for template"
        };
      //fetch the custom template json data from s3 by path
      const resultJson = await s3helper.fetchJsonFromS3(
        loanTemplate.path.substring(loanTemplate.path.indexOf("templates")),
        {
          method: "Get"
        }
      );
      //validate the incoming template data with customized template data
      const result = await validate.validateDataWithTemplate(
        resultJson,
        biReqData
      );
      if (!result)
        throw {
          message: "loanTemplate path not found"
        };
      if (result.unknownColumns.length)
        throw {
          message: "Few columns are unknown",
          errorCode: "03",
          data: {
            unknownColumns: result.unknownColumns
          }
        };
      if (result.missingColumns.length)
        throw {
          message: "Few columns are missing",
          errorCode: "01",
          data: {
            missingColumns: result.missingColumns
          }
        };
      if (result.errorRows.length)
        throw {
          message: "Few fields have invalid data",
          errorCode: "02",
          data: {
            exactErrorRows: result.exactErrorColumns,
            errorRows: result.errorRows
          }
        };
      if (result.exactEnumErrorColumns.length)
        return reqUtils.json(req, res, next, 400, {
          success: false,
          message: `${result.exactEnumErrorColumns[0]}`,
          errorCode: "02",
          data: {
            exactEnumErrorColumns: result.exactEnumErrorColumns
          }
        });
      req.result = result;
      req.biReqData = biReqData;
      next();
    } catch (error) {
      return res.status(400).send(error);
    }
  };

  app.get(
    "/api/loan/:libi",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany, jwt.verifyProduct],
    async (req, res) => {
      try {
        const borrowerInfoData = await BorrowerinfoCommon.findOneWithKBIORKLI(
          req.params.libi
        );
        if (!borrowerInfoData)
          throw {
            message: "No records found for loan id or borrower id"
          };
        if (req.company._id !== borrowerInfoData.company_id)
          throw {
            message: "Loan id is not associated with selected company"
          };
        if (req.product._id !== borrowerInfoData.product_id)
          throw {
            message: "Loan id is not associated with selected  product"
          };
        return res.send({
          loanDetails: borrowerInfoData
        });
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.post(
    "/api/borrowerrecords",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany, jwt.verifyProduct],
    async (req, res) => {
      try {
        const data = req.body;
        if (String(req.company._id) !== String(data.company_id))
          throw {
            message: "Loan id is not associated with company"
          };
        if (String(req.product._id) !== String(data.product_id))
          throw {
            message: "Loan id is not associated with product"
          };
        const isPagination = data.hasOwnProperty("pagination");

        const records = await BorrowerinfoCommon.getAllByFilter(data);

        if (isPagination && (!records?.rows || !records?.rows.length))
          throw {
            message: "No records found for loan id or borrower id"
          };
        if (!isPagination && (!records || !records.length))
          throw {
            message: "No records found for loan id or borrower id"
          };
        return res.send(records);
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.post(
    "/api/loan",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      jwt.verifyLoanSchema,
      verifyLoanPayload
    ],
    async (req, res, next) => {
      try {
        let subventionFeesExclGST;
        let gstOnConvFees;
        let gstOnApplicationFees;
        let processInsurance = {};

        // check for few hardcoded data fields should not cross the data recorded in product
        for (var i = 0; i < req.biReqData.length; i++) {
          if (Number(req.biReqData[i].tenure) > Number(req.product.loan_tenure))
            throw {
              message: `Loan tenure cannot be greater than ${req.product.loan_tenure}`
            };
          if (
            Number(req.biReqData[i].sanction_amount) >
            Number(req.product.max_loan_amount)
          )
            throw {
              message: `Sanction amount cannot be greater than ${req.product.max_loan_amount}`
            };
        }

        if (req.result.validatedRows.length == req.biReqData.length) {
          const validateDataAsPerFlag = await validate.validateProductconfigWithRequestData(
            req,
            res,
            req.product,
            req.result.validatedRows[0]
          );
          if (validateDataAsPerFlag.success === false)
            throw {validateDataAsPerFlag};
          // Validate sanction amount if allow_loc flag is true in product
          if (
            req.product.allow_loc === 1 &&
            req.result.validatedRows[0].sanction_amount
          ) {
            const minLimit = req.product.min_loan_amount;
            const maxLimit = Number(req.product.max_loan_amount);
            if (
              req.result.validatedRows[0].sanction_amount < minLimit ||
              req.result.validatedRows[0].sanction_amount > maxLimit
            ) {
              throw {
                success: false,
                message:
                  "sanction amount needs to be in min and max limit amount range set in product"
              };
            }
          }
          const loanIds = req.biReqData.map(item => {
            return item.loan_app_id;
          });
          //find in DB whether all  loan id exists in loanrequest table
          const lead = await LoanRequestSchema.findExistingKLIByIds(loanIds);
          if (lead[0] == null || !lead.length) {
            throw {
              message: "No record found in loanrequest for loan id"
            };
          }
          if (lead.length !== loanIds.length) {
            throw {
              message: `Only ${lead.length} rows are in loanrequest record`
            };
          }

          const panNumbers = await lead.map(item => {
            return item.appl_pan;
          });
          const panAlreadyExist = await LoanRequestSchema.findByPan(
            panNumbers,
            req.company._id
          );
          if (panAlreadyExist) {
            const panData =
              panNumbers.length === 1 ? [panAlreadyExist] : panAlreadyExist;
            const LoanAppIds = await panData.map(item => {
              return item.loan_app_id;
            });

            //Check loan_app_id already exist in borrower info table
            const loanAppIdAlreadyExist = await BorrowerinfoCommon.findByLoanAppIds(
              LoanAppIds
            );
            if (
              loanAppIdAlreadyExist.length &&
              loanAppIdAlreadyExist[0] !== null
            )
              throw {success: false, message: "loan_app_id already exist"};
          }
          const existingBorrowerIds = await BorrowerinfoCommon.fastFindExistingKLIByIds(
            loanIds
          );
          if (existingBorrowerIds[0] !== null && existingBorrowerIds.length)
            throw {
              success: false,
              message:
                "Few loans already exists in borrowerinfo with open status",
              data: {
                existingBorrowerIds
              }
            };

          // add bulk bifurcated data in borrowerinfo common table
          req.result.validatedRows.forEach(async item => {
            // Calculate subvention fees excusive of gst
            if (item.subvention_fees) {
              subventionFeesExclGST = await calculation.calculateSubventionFeesExcGST(
                item,
                req.product
              );
            }
            var leadRecord = lead.find(
              record => record.loan_app_id === item.loan_app_id
            );
            if (item.conv_fees) {
              gstOnConvFees = await calculation.calculateGSTOnConvFees(
                item,
                leadRecord,
                req.product
              );
            }
            if (item.application_fees) {
              gstOnApplicationFees = await calculation.calculateGSTOnApplicationFees(
                item,
                leadRecord,
                req.product
              );
            }
            item.first_name = leadRecord?.first_name;
            item.middle_name = leadRecord?.middle_name;
            item.last_name = leadRecord?.last_name;
            item.age = leadRecord?.age;
            item.applied_amount = leadRecord?.applied_amount;
            item.company_id = req.company._id;
            item.product_id = req.product._id;
            item.product_key = req.product.name;
            item.status = "open";
            item.tenure = item.tenure ? item.tenure : req.product.loan_tenure;
            item.tenure_type = item.tenure_type
              ? item.tenure_type
              : req.product.loan_tenure_type;
            item.int_type = item.int_type
              ? item.int_type
              : req.product.interest_rate_type
              ? req.product.interest_rate_type.charAt(0).toUpperCase() +
                req.product.interest_rate_type.slice(1)
              : "";
            item.loan_int_rate = item.loan_int_rate
              ? item.loan_int_rate
              : req.product.int_value.replace(/[a-zA-Z]+/g, "") * 1;
            item.interest_type = req.product.interest_type
              ? req.product.interest_type
              : "";
            item.processing_fees_amt = item.processing_fees_amt
              ? Math.round(
                  (item.processing_fees_amt * 1 + Number.EPSILON) * 100
                ) / 100
              : req.product.processing_fees.indexOf("A") > -1
              ? Math.round(
                  (req.product.processing_fees.replace(/[a-zA-Z]+/g, "") * 1 +
                    Number.EPSILON) *
                    100
                ) / 100
              : req.product.processing_fees.indexOf("P") > -1
              ? (
                  ((req.product.processing_fees.replace(/[a-zA-Z]+/g, "") * 1) /
                    100) *
                  Number(item.sanction_amount ? item.sanction_amount : 0)
                ).toFixed(2)
              : 0;
            item.subvention_fees_amount = item.subvention_fees
              ? subventionFeesExclGST.subventionFeesExcludingGst
              : "";
            item.gst_on_subvention_fees = item.subvention_fees
              ? subventionFeesExclGST.gstOnSubventionFees
              : "";
            item.cgst_on_subvention_fees = item.subvention_fees
              ? subventionFeesExclGST.cgstOnSubventionFees
              : "";
            item.sgst_on_subvention_fees = item.subvention_fees
              ? subventionFeesExclGST.sgstOnSubventionFees
              : "";
            item.igst_on_subvention_fees = item.subvention_fees
              ? subventionFeesExclGST.igstOnSubventionFees
              : "";
            item.penal_interest =
              Number(
                req?.product?.penal_interest
                  .toString()
                  .replace(/[a-zA-Z]+/g, "")
              ) || 0;
            item.bounce_charges =
              Number(
                req?.product?.bounce_charges
                  .toString()
                  .replace(/[a-zA-Z]+/g, "")
              ) || 0;

            //record gst on conv_fees
            item.gst_on_conv_fees = item.conv_fees
              ? gstOnConvFees.calculatedGstAmt
              : "";
            item.conv_fees_excluding_gst = item.conv_fees
              ? gstOnConvFees.convFeesExcludingGst
              : "";
            item.cgst_on_conv_fees = item.conv_fees
              ? gstOnConvFees.calculatedCgst
              : "";
            item.sgst_on_conv_fees = item.conv_fees
              ? gstOnConvFees.calculatedSgst
              : "";
            item.igst_on_conv_fees = item.conv_fees
              ? gstOnConvFees.calculatedIgst
              : "";
            //record gst on application_fees
            item.gst_on_application_fees = item.application_fees
              ? gstOnApplicationFees?.calculatedGstAmt
              : "";
            item.application_fees_excluding_gst = item.application_fees
              ? gstOnApplicationFees.applFeesExcludingGst
              : "";
            item.cgst_on_application_fees = item.application_fees
              ? gstOnApplicationFees.calculatedCgst
              : "";
            item.sgst_on_application_fees = item.application_fees
              ? gstOnApplicationFees.calculatedSgst
              : "";
            item.igst_on_application_fees = item.application_fees
              ? gstOnApplicationFees.calculatedIgst
              : "";
          });

          const leadData = await leadHelper.fetchLead(
            req.biReqData[0].loan_app_id,
            req,
            res
          );
          let leadsData = JSON.parse(JSON.stringify(req.lead));
          let borrowerData = JSON.parse(
            JSON.stringify(req.result.validatedRows[0])
          );
          const lmsPostData = await Object.assign(leadsData, borrowerData);
          let brokenInterest = 0;
          let gstAmount = 0;

          // Process insurance amount passed in loan payload
          if (lmsPostData.insurance_amount) {
            processInsurance = await insuranceHelper.loanInsuranceValidations(
              req,
              res,
              lmsPostData
            );
            if (!processInsurance.success) {
              throw {success: false, message: processInsurance.message};
            }
          }
          req.result.validatedRows.forEach(item => {
            item.insurance_amount = req.insuranceResponse
              ? req.insuranceResponse.policyPremiumIncGST
              : 0;
          });

          // Check if calculateGstForProduct flag is active and lms_version is origin_lms
          if (req.company.lms_version === "origin_lms") {
            const gstCalculation = await calculation.calculateGST(
              lmsPostData,
              req.product
            );
            if (!gstCalculation.success) {
              throw {
                ...gstCalculation
              };
            }
            gstAmount = gstCalculation?.calculatedGstAmt;
            req.result.validatedRows.forEach(item => {
              item.cgst_amount = gstCalculation?.calculatedCgst;
              item.sgst_amount = gstCalculation?.calculatedSgst;
              item.igst_amount = gstCalculation?.calculatedIgst;
              item.gst_on_pf_amt = gstCalculation?.calculatedGstAmt;
            });
          }
          // Check if calculate_broken_interest flag is active and lms_version is origin_lms
          if (
            req.product.calculate_broken_interest &&
            req.company.lms_version === "origin_lms"
          ) {
            brokenInterestResp = await calculation.calculateBrokenInterest(
              lmsPostData,
              req.product
            );
            if (!brokenInterestResp.success) {
              throw {
                ...brokenInterestResp
              };
            }
            brokenInterest = brokenInterestResp.brokenInterestAmount;
          }
          req.result.validatedRows.forEach(item => {
            item.broken_interest = brokenInterest;
          });
          if (req.company.lms_version === "origin_lms") {
            const netDisbursementAmount = await calculation.calculateNetDisbursementAmount(
              brokenInterest,
              gstAmount,
              lmsPostData,
              req.product
            );
            if (!netDisbursementAmount.success) {
              throw {
                ...netDisbursementAmount
              };
            }
            req.result.validatedRows.forEach(item => {
              item.net_disbur_amt =
                netDisbursementAmount?.netDisbursementAmount;
            });
          }

          //--------------------CKYC AND PAN VALIDATION INTEGRATION------------------------

          const loanReqData = {
            ...lmsPostData
          };
          var ckycDownload = "";
          var panKYCResp = "";
          //check for the perform_kyc flag in the product
          if (req.product.ckyc_search) {
            //check for mandatory dob and pan in payload
            if (!loanReqData.appl_pan || !loanReqData.dob)
              throw {success: false, message: "appl_pan and dob in mandatory."};
            //Make call to ckyc search helper function
            const ckycSearchResponse = await kycServices.CKYCSearch(
              req,
              res,
              loanReqData
            );
            if (ckycSearchResponse.success) {
              //make call to the ckyc_download api
              loanReqData.ckyc_id = ckycSearchResponse.ckyc_id;
              ckycDownload = await kycServices.CKYCDownload(
                req,
                res,
                loanReqData
              );
            } else {
              //make call to the pan kyc api
              panKYCResp = await kycServices.PanKYC(req, res, loanReqData);
            }
          }

          // --------------------NAME MATCHING ---------------------------------------//
          // name matching api call with ckyc
          var nameMatchResValue = {
            name_match_conf: 0
          };
          const ckycFullName =
            ckycDownload.data?.data?.PID_DATA?.PERSONAL_DETAILS?.FULLNAME;
          if (ckycFullName) {
            nameMatchResValue = await kycServices.NameMatchWithCKYC(
              req,
              ckycFullName,
              loanReqData
            );
          }

          // name matching api call with pan kyc api
          const panName = panKYCResp.data?.data?.result?.name;
          if (nameMatchResValue.name_match_conf < 0.6 && panName) {
            nameMatchResValue = await kycServices.NameMatchWithPAN(
              req,
              panName,
              loanReqData
            );
          }

          //------------------  PIN CODE MATCHING -------------------------------//

          const corresPin =
            ckycDownload.data?.data?.PID_DATA?.PERSONAL_DETAILS?.CORRES_PIN;
          const permPin =
            ckycDownload.data?.data?.PID_DATA?.PERSONAL_DETAILS?.PERM_PIN;
          if (ckycDownload.data) {
            pinMatchRes = await kycServices.PinMatchWithCKYC(
              req,
              corresPin,
              permPin,
              loanReqData
            );
          }
          //---------------- OKYC INTEGRATION ----------------------------------//

          if (
            !ckycDownload.data?.success === true ||
            nameMatchResValue.success === false
          ) {
            OKYCResp = await kycServices.OKYC(loanReqData, req.company.name);
            // Fetch Details from webhook for this loan_app_id
          }

          //---------------     BUREAU VALIDATION--------------------------------//

          //validate if bureau and partner_name is configured in product
          if (req.product.bureau_partner_name && req.product.bureau_check) {
            // Check required scenarios and make call to the bureau api
            const burauServiceCallResp = await kycServices.BurauServiceCall(
              req,
              res,
              lmsPostData
            );
          }

          //----------------- A-SCORE INTEGRATION --------------------------------//
          let leanLoanData = lmsPostData;
          if(req.product.ascore_flag){
           if(!req.body[0].ascore_request_id){
            throw {
              status:"fail",
              message:"Request ID is required."
            }
           }
           const scoreData= await kycServices.AScoreData(lmsPostData,req.body[0].ascore_request_id);
           const score = scoreData?.score;
           if(scoreData.status === "success"){
            leanLoanData ={
              ...lmsPostData,
              ...score
             }
           }
           else{
            throw {
            status:"fail",
            message: scoreData.message
          }}
          }

          //Make call to LMS loan api.
          const validateAndMakeLoan = await thirdPartyHelper.BREValidation(
            req,
            leanLoanData
          );
          if (validateAndMakeLoan) {
            if (!validateAndMakeLoan.success) {
              throw {
                success: false,
                message: validateAndMakeLoan.errorData
                  ? validateAndMakeLoan.errorData.errorData.message
                  : "Error while creating loan",
                data: validateAndMakeLoan.errorData.errorData.data
              };
            }
          }
          req.result.validatedRows.forEach(item => {
            item.loan_id = validateAndMakeLoan.makeLoanData["loan_id"];
          });
          if (
            !req.product.allow_loc &&
            req.product.repayment_schedule === "custom"
          ) {
            const repaymentScheduleData = {
              repayment_type: req.result.validatedRows[0].repayment_type,
              int_type: req.result.validatedRows[0].int_type
                ? req.result.validatedRows[0].int_type
                : req.product.interest_rate_type,
              emi_count: req.result.validatedRows[0].emi_count,
              sanction_amount: req.result.validatedRows[0].sanction_amount,
              intr_rate: req.result.validatedRows[0].loan_int_rate
                ? Number(req.result.validatedRows[0].loan_int_rate)
                : String(req.product.int_value).replace(/[a-zA-Z]+/g, "") * 1,
              first_inst_date: req.result.validatedRows[0].first_inst_date
            };

            const repaymentSchedule = await calculation.generateRepaySch(
              repaymentScheduleData,
              req.product
            );
            if (!repaymentSchedule.success) {
              throw {
                ...repaymentSchedule
              };
            }
            if (repaymentSchedule) {
              const uploadRepaymentSchedule = await repayment.storeRepaymentSchedule(
                req,
                req.result.validatedRows[0],
                repaymentSchedule.repaymentScheduleGenerated,
                res
              );
              if (!uploadRepaymentSchedule)
                throw {
                  uploadRepaymentSchedule
                };
            }
          }
          const newLoans = await BorrowerinfoCommon.addInBulk(
            req.result.validatedRows
          );
          const updateLeadStatus = await LoanRequestSchema.updateStatus(
            req.result.validatedRows,
            "open",
            "logged"
          );
          const updateLoanIdsInLoanRequest = await LoanRequestSchema.updateLoanIdsBulk(
            req.result?.validatedRows?.map(({loan_app_id, loan_id}) => {
              return {
                loan_app_id,
                loan_id
              };
            })
          );
          if (req.company.auto_loan_status_change === 1) {
            //change loan status to kyc_data_approved
            const updateStatusKycDataApproved = await loanStatus.updateStatusToKycDataApproved(
              req,
              req.result.validatedRows[0]
            );
            //Change the loan status to credit_approved
            const updateStatusCreditApproved = await loanStatus.updateStatusToCreditApproved(
              req,
              req.result.validatedRows[0]
            );
          }
          // Record borrower insurance details

          const borrowerInsuranceData = await insuranceHelper.recordBorrowerInsuranceDetails(
            req,
            req.result.validatedRows[0],
            req.insuranceResponse
          );
          if (!borrowerInsuranceData.success) {
            throw borrowerInsuranceData;
          }
          //Send updated loan status and loan stage in response
          const loanData = await BorrowerinfoCommon.findOneWithKLID(
            newLoans[0].loan_id
          );
          newLoans[0].status = loanData.status;
          newLoans[0].stage = loanData.stage;
          return reqUtils.json(req, res, next, 200, {
            success: true,
            message: "Loan details added successfully",
            data: newLoans
          });
        } else {
          return reqUtils.json(req, res, next, 400, {
            success: false,
            data: result
          });
        }
      } catch (error) {
        console.log(error);
        if (typeof error.errors === "object") {
          let msg = "";
          Object.keys(error?.errors).forEach(item => {
            msg = msg + "  " + error.errors[item].properties?.message;
          });
          return res.status(400).send({
            success: false,
            message: msg,
            data: ""
          });
        }
        return res.status(400).send(error);
      }
    }
  );

  app.put(
    "/api/loan/:_id",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      jwt.verifyLoanSchema
    ],
    async (req, res, next) => {
      try {
        const reqData = req.body;
        var data = {
          partner_loan_app_id: reqData.partner_loan_app_id,
          partner_borrower_id: reqData.partner_borrower_id,
          loan_id: reqData.loan_id,
          borrower_id: reqData.borrower_id,
          status: reqData.status,
          final_approve_date:
            reqData.final_approve_date || moment().format("YYYY-MM-DD"),
          sanction_amount: reqData.sanction_amount
        };
        const sendMail = async (type, data) => {
          var companyId = req.company._id;
          if (!req.user)
            throw {
              message: "Error while finding company users"
            };
          data.user_name = req.user.username;
          const htmlcontent = mails.genericMails(type, data);
          const subject = `Loan has been moved to ${data.status} for below customer.`;
          var toEmail = process.env.FORCE_TO_EMAIL || req.user.email;
          service.sendMail(
            toEmail,
            subject,
            htmlcontent,
            (mailerr, mailres) => {
              if (mailerr)
                throw {
                  message: "Error while sending email"
                };
              return true;
            }
          );
        };
        const mailRes = await sendMail(data.status, reqData);
        if (!mailRes)
          throw {
            message: "error while sending mail"
          };
        const updateLoanStatus = await validate.updateStatus(
          req.company,
          req.product,
          req.user,
          req.loanSchema,
          data
        );
        return res.send(updateLoanStatus);
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.put(
    "/api/borrowerinfostatusupdate/:_id",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      jwt.verifyLoanSchema
    ],
    async (req, res, next) => {
      try {
        const reqData = req.body;
        var data = {
          partner_loan_app_id: reqData.partner_loan_app_id,
          partner_borrower_id: reqData.partner_borrower_id,
          loan_id: reqData.loan_id,
          loan_app_id: reqData.loan_app_id,
          borrower_id: reqData.borrower_id,
          status: reqData.status,
          final_approve_date:
            reqData.final_approve_date || moment().format("YYYY-MM-DD"),
          sanction_amount: reqData.sanction_amount
        };
        req.broadcastEventData = reqData;

        const updateLoanStatus = await loanStatus.updateStatus(req, data);
        if (updateLoanStatus.success === false) {
          throw {
            message: updateLoanStatus.message
          };
        }
        next();
        return res.send(updateLoanStatus);
      } catch (error) {
        return res.status(400).send(error);
      }
    },
    broadcastEvent.fireDisbursalApprovedStatusEvent
  );

  app.post(
    "/api/borrowerinfo/update_disbursement_dates",
    [AccessLog.maintainAccessLog],
    async (req, res, next) => {
      try {
        //cw.track(req);
        const reqData = req.body;
        const template = [
          {
            field: "loan_id",
            type: "string",
            checked: "TRUE",
            validationmsg: "Please enter valid loan id"
          },
          {
            field: "disbursement_date",
            type: "date",
            checked: "TRUE",
            validationmsg:
              "Please enter valid disbursement date in YYYY-MM-DD format"
          }
        ];
        //validate request data with above data
        const result = await validate.validateDataWithTemplate(
          template,
          reqData
        );
        if (!result)
          throw {
            message: "Error while validating data with template"
          };
        if (result.unknownColumns.length)
          throw {
            message: "Few columns are unknown",
            data: {
              unknownColumns: result.unknownColumns
            }
          };
        if (result.missingColumns.length)
          throw {
            message: "Few columns are missing",
            data: {
              missingColumns: result.missingColumns
            }
          };
        if (result.errorRows.length)
          throw {
            message: "Few fields have invalid data",
            data: {
              exactErrorRows: result.exactErrorColumns,
              errorRows: result.errorRows
            }
          };
        //making array off all loan ids
        const bookkingLoanIds = result.validatedRows.map(item => {
          return item.loan_id;
        });
        // Make array of all unique loan ids so that there is no repetition of ids
        const uniqueLoanIds = [...new Set(bookkingLoanIds)];
        // Check if all the unique loan ids are present in borrower info
        const biFindResp = await BorrowerinfoCommon.fastFindExistingKLIByIds(
          uniqueLoanIds
        );
        const biFindRes = [biFindResp];
        if (!biFindRes)
          throw {
            message: "Error while finding loan ids."
          };
        if (biFindRes.length !== uniqueLoanIds.length) {
          let missingIds = [];
          const presentIds = biFindRes.map(record => {
            return record.loan_id;
          });
          uniqueLoanIds.forEach(loanId => {
            if (presentIds.indexOf(loanId) <= -1)
              missingIds.push({
                loan_id: loanId
              });
          });
          throw {
            message: `Some loan ids don't exist in borrower info`,
            data: {
              missingIds: missingIds
            }
          };
        }
        // Check if any loans are closed in borrower info and return error
        let closedLoans = [];
        biFindRes.forEach(record => {
          if (record.status === "closed")
            closedLoans.push({
              loan_id: record.loan_id
            });
        });
        if (closedLoans.length)
          throw {
            message: "Few loans are already closed",
            closedLoanIds: closedLoans
          };
        const updateRes = await BorrowerinfoCommon.updateDisburseDates(
          result.validatedRows
        );
        if (!updateRes)
          throw {
            message: "Error while updating disbursement dates."
          };
        return reqUtils.json(req, res, next, 200, {
          message: "Disbursement dates updated successfully."
        });
      } catch (error) {
        return res.status(400).send({
          error
        });
      }
    }
  );

  app.post(
    "/api/update_insurance_details",
    [
      check("loan_id")
        .notEmpty()
        .withMessage("Bookking loan id is required"),
      check("insurance_amt")
        .notEmpty()
        .withMessage("Insurance amount is required")
    ],
    //[jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany, services.isServiceEnabled(process.env.SERVICE_INSURANCE_ID), AccessLog.maintainAccessLog],
    async (req, res, next) => {
      try {
        //cw.track(req);
        const errors = validationResult(req);
        if (!errors.isEmpty())
          return res.status(422).json({
            message: errors.errors[0]["msg"]
          });
        const data = req.body;
        const biFindRes = await BorrowerinfoCommon.findOneWithKLID(
          data.loan_id
        );
        if (!biFindRes)
          throw {
            message: "Error while finding loan id in borrower info."
          };
        if (
          biFindRes.status !== "credit_approved" &&
          biFindRes.status !== "kyc_data_approved" &&
          biFindRes.status !== "disbursal_approved"
        )
          throw {
            message: `Loan status is '${biFindRes.status}'. Cannot update insurance details.`
          };
        if (biFindRes.insurance_details === 1)
          throw {
            message: "Insurance details already present for this loan."
          };
        if (biFindRes.insured === 1)
          throw {
            message: "Insurance already taken for this loan."
          };
        biFindRes.insurance_amt = data.insurance_amt;
        biFindRes.insurance_details = 1;
        biFindRes.total_charges = (
          +biFindRes.total_charges + +data.insurance_amt
        ).toFixed(2);
        biFindRes.net_disbur_amt = (
          +biFindRes.net_disbur_amt - +data.insurance_amt
        ).toFixed(2);
        const updtRes = await BorrowerinfoCommon.updateBI(biFindRes);
        if (!updtRes)
          throw {
            message: "Error while updating borrower info."
          };
        return reqUtils.json(req, res, next, 200, {
          message: "Insurance details updated successfully",
          loan_id: biFindRes.loan_id,
          insurance_amt: biFindRes.insurance_amt,
          updated_disbursement_amt: biFindRes.net_disbur_amt,
          updated_total_charges: biFindRes.total_charges
        });
      } catch (error) {
        return res.send({
          error
        });
      }
    }
  );

  //update borrowerinfo common table and and loan type related table by loan_id and borrower_id
  app.put(
    "/api/loan",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      jwt.verifyLoanSchema
    ],
    async (req, res, next) => {
      try {
        const biReqData = req.body;
        const reqData = Array.isArray(biReqData) ? biReqData : [biReqData];
        //find the custom template path of requested template type
        const loanTemplate = await LoanTemplatesSchema.findByNameTmplId(
          req.loanSchema.loan_custom_templates_id,
          "loan"
        );
        if (!loanTemplate)
          throw {
            success: false,
            message: "No records found"
          };
        //fetch the custom template json data from s3 by path
        const resultJson = await s3helper.fetchJsonFromS3(
          loanTemplate.path.substring(loanTemplate.path.indexOf("templates"))
        );
        if (!resultJson)
          throw {
            success: false,
            message: "Error fetching json from s3"
          };
        //validate the incoming template data with customized template data
        const result = await validate.validateDataWithTemplate(
          resultJson,
          reqData
        );
        if (!result)
          throw {
            success: false,
            message: "Error while validating data with template"
          };
        if (result.unknownColumns.length)
          throw {
            success: false,
            message: "Few columns are unknown",
            data: {
              unknownColumns: result.unknownColumns
            }
          };
        if (result.missingColumns.length)
          throw {
            success: false,
            message: "Few columns are missing",
            data: {
              missingColumns: result.missingColumns
            }
          };
        if (result.errorRows.length)
          throw {
            success: false,
            message: "Few fields have invalid data",
            data: {
              exactErrorRows: result.exactErrorColumns,
              errorRows: result.errorRows
            }
          };
        if (result.exactEnumErrorColumns.length)
          return reqUtils.json(req, res, next, 400, {
            success: false,
            message: `${result.exactEnumErrorColumns[0]}`,
            errorCode: "02",
            data: {
              exactEnumErrorColumns: result.exactEnumErrorColumns
            }
          });
        if (result.validatedRows.length == reqData.length) {
          const loanAppIds = reqData.map(item => {
            return item.loan_app_id;
          });
          //find whether data exists in borrowerinfo table by loan_app_id
          const liIdsList = await BorrowerinfoCommon.findByLoanAppIds(
            loanAppIds
          );
          if (!liIdsList)
            throw {
              success: false,
              message: "Error while fetching data from borrower info"
            };
          if (!liIdsList.length)
            throw {
              success: false,
              message: "Loan ids does not exists in borrower info"
            };

          if (liIdsList.length !== loanAppIds.length) {
            throw {
              success: false,
              message: "Some loan ids does not exists in borrower info"
            };
          }
          const alreadyApproved = liIdsList.filter(row => {
            row.stage >= 4;
          });
          if (alreadyApproved.length) {
            throw {
              success: false,
              message:
                "loans are already in disbursed stage. Cannot update them",
              data: {
                alreadyApproved: alreadyApproved
              }
            };
          }

          for (var i = 0; i < reqData.length; i++) {
            if (reqData[i].tenure && req.product.loan_tenure) {
              if (Number(reqData[i].tenure) > Number(req.product.loan_tenure))
                throw {
                  message: `Loan tenure cannot be greater than ${req.product.loan_tenure}`
                };
            }
            if (reqData[i].sanction_amount && req.product.max_loan_amount) {
              if (
                Number(reqData[i].sanction_amount) >
                Number(req.product.max_loan_amount)
              )
                throw {
                  message: `Sanction amount cannot be greater than ${req.product.max_loan_amount}`
                };
            }
          }

          await leadHelper.fetchLead(reqData[0].loan_app_id, req, res);

          let leadsData = JSON.parse(JSON.stringify(req.lead));
          let borrowerData = JSON.parse(
            JSON.stringify(result.validatedRows[0])
          );
          const lmsPostData = await Object.assign(leadsData, borrowerData);
          let brokenInterest = 0;
          let gstAmount = 0;
          // Check if calculateGstForProduct flag is active and lms_version is origin_lms
          if (
            req.product.calculateGstForProduct &&
            req.company.lms_version === "origin_lms"
          ) {
            const gstCalculation = await calculation.calculateGST(
              lmsPostData,
              req.product
            );
            if (!gstCalculation.success) {
              throw {
                ...gstCalculation
              };
            }
            gstAmount = gstCalculation?.calculatedGstAmt;
            result.validatedRows.forEach(item => {
              item.cgst_amount = gstCalculation?.calculatedCgst;
              item.sgst_amount = gstCalculation?.calculatedSgst;
              item.igst_amount = gstCalculation?.calculatedIgst;
              item.gst_on_pf_amt = gstCalculation?.calculatedGstAmt;
            });
          }
          // Check if calculate_broken_interest flag is active and lms_version is origin_lms
          if (
            req.product.calculate_broken_interest &&
            req.company.lms_version === "origin_lms"
          ) {
            brokenInterestResp = await calculation.calculateBrokenInterest(
              lmsPostData,
              req.product
            );
            if (!brokenInterestResp.success) {
              throw {
                ...brokenInterestResp
              };
            }
            brokenInterest = brokenInterestResp.brokenInterestAmount;
          }
          result.validatedRows.forEach(item => {
            item.broken_interest = brokenInterest;
          });
          if (req.company.lms_version === "origin_lms") {
            const netDisbursementAmount = await calculation.calculateNetDisbursementAmount(
              brokenInterest,
              gstAmount,
              lmsPostData,
              req.product
            );
            if (!netDisbursementAmount.success) {
              throw {
                ...netDisbursementAmount
              };
            }
            result.validatedRows.forEach(item => {
              item.net_disbur_amt =
                netDisbursementAmount?.netDisbursementAmount;
            });
          }

          const validateBRE = await thirdPartyHelper.LMSBREValidation(
            req,
            reqData[0]
          );
          if (validateBRE.success) {
            result.validatedRows.forEach((item, index) => {
              item.stage = 0;
              item.status = "open";
            });
            if (
              req.company.lms_version !== "origin_lms" ||
              req.company.lms_version === "legacy_lms"
            ) {
              const LMS_BORROWER_INFO_DATA = {
                product_key: req.product.name,
                ...result.validatedRows[0],
                loan_id: liIdsList.find(
                  lids =>
                    lids.loan_app_id === result.validatedRows[0]?.loan_app_id
                )?.loan_id
              };
              const lmsUpdateLoan = await thirdPartyHelper.LMSUpdateLOAN(
                req,
                LMS_BORROWER_INFO_DATA
              );
              if (!lmsUpdateLoan?.success && !lmsUpdateLoan?.flag) {
                return res.status(400).json(lmsUpdateLoan);
              }
              if (lmsUpdateLoan?.flag) {
                return reqUtils.json(req, res, next, 200, {
                  message: "Loan info updated successfully",
                  updatedLoan: updatedLoans
                });
              }
            } else {
              const updateLeadStatus = await LoanRequestSchema.updateStatus(
                result.validatedRows,
                "open"
              );
              const updatedLoans = await BorrowerinfoCommon.updateBulk(
                result.validatedRows
              );
              if (!updatedLoans) {
                throw {
                  success: false,
                  message: "Error while updating borrower info"
                };
              }
              return reqUtils.json(req, res, next, 200, {
                message: "Loan info updated successfully",
                updatedLoan: updatedLoans
              });
            }
          } else {
            throw {
              success: false,
              message: "Error while valudating BRE data",
              data: validateBRE
            };
          }
        }
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.post(
    "/api/borrowerinfo/get_loan_list",
    async (req, res, next) => {
      try {
        //cw.track(req);
        const data = req.body.data;
        const paginate = req.body.paginate || {};
        var startTime, endTime;
        startTime = new Date();
        if (!data.loan_id) delete data.loan_id;
        if (!data.status) delete data.status;
        if (!data.company_id) delete data.company_id;
        if (!data.product_id) delete data.product_id;
        if (data.from_date || data.to_date) {
          let created_at = {};
          let fromDate;
          let toDate;
          const currDate = new Date().setUTCHours(23, 59, 59);
          if (data.from_date) {
            fromDate = new Date(data.from_date).setUTCHours(0, 0, 0);
            if (fromDate > currDate)
              throw {
                message: "From Date should be less than current date."
              };
            delete data.from_date;
            Object.assign(created_at, {
              $gte: fromDate
            });
          }
          if (data.to_date) {
            toDate = new Date(data.to_date).setUTCHours(23, 59, 59);
            if (fromDate && fromDate > toDate)
              return res.status(400).json({
                message: "From date should be less than to date"
              });
            delete data.to_date;
            Object.assign(created_at, {
              $lte: toDate
            });
          }
          data.created_at = created_at;
        }
        const response = await BorrowerinfoCommon.getLoanList(data, paginate);
        if (response.count == 0)
          throw {
            message: "No records found"
          };
        if (!response)
          throw {
            message: "Error while getting borrower info data."
          };
        const bookkingLoanIds = response.rows.map(item => {
          return item.loan_id;
        });
        const lrfindresp = await LoanRequestSchema.fastFindExistingKLIByIds(
          bookkingLoanIds
        );
        const lrfindres = [lrfindresp];
        if (!lrfindres)
          throw {
            Message: "Error while getting loan request data"
          };
        var totalSum = response.rows;
        let total_loan_amount = 0;
        let total_disbur_amt = 0;
        totalSum.forEach((item, index) => {
          total_loan_amount +=
            item.sanction_amount !== null
              ? parseFloat(item.sanction_amount)
              : 0;
          total_disbur_amt +=
            item.net_disbur_amt !== null ? parseFloat(item.net_disbur_amt) : 0;
        });
        total_loan_amount = parseFloat(total_loan_amount).toFixed(2);
        total_disbur_amt = parseFloat(total_disbur_amt).toFixed(2);
        let resData = [];
        if (response && lrfindres.length) {
          response.rows.forEach(birow => {
            lrfindres.forEach(lrrow => {
              if (birow.loan_id === lrrow.loan_id) {
                Object.assign(birow, lrrow);
                resData.push(birow);
              }
            });
          });
        }
        return reqUtils.json(req, res, next, 200, {
          rows: response,
          count: response.count,
          total_loan_amount,
          total_disbur_amt,
          success: true
        });
        //in case of any errors in ekyc, send loan bucket without it
        var defaultItems = () => {
          reqUtils.json(req, res, next, 200, {
            rows: resData,
            count: response.count
          });
        };
        if (process.env.DISABLE_EKYC_STORE) {
          return defaultItems();
        }
      } catch (error) {
        return res.status(400).send(error);
      }
    },
    AccessLog.maintainAccessLog
  );

  app.put(
    "/api/dues_and_intrest_configuration",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany, jwt.verifyProduct],
    [
      check("fees")
        .notEmpty()
        .withMessage("fees is required")
        .matches(/^(\d{1,8})(.\d{1,4})?(UP|UA|RA|RP)$/)
        .withMessage("Please enter valid fees"),
      check("subvention_fees")
        .notEmpty()
        .withMessage("subvention_fees is required")
        .matches(/^(\d{1,8})(.\d{1,4})?(UP|UA|RA|RP)$/)
        .withMessage("Please enter valid subvention_fees"),
      check("processing_fees")
        .notEmpty()
        .withMessage("processing_fees is required")
        .matches(/^(\d{1,8})(.\d{1,4})?(UP|UA|RA|RP)$/)
        .withMessage("Please enter valid processing_fees"),
      check("usage_fee")
        .notEmpty()
        .withMessage("usage_fee is required")
        .matches(/^(\d{1,8})(.\d{1,4})?(UP|UA|RA|RP)$/)
        .withMessage("Please enter valid usage_fee"),
      check("upfront_interest")
        .notEmpty()
        .withMessage("upfront_interest is required")
        .matches(/^(\d{1,8})(.\d{1,4})?(UP|UA)$/)
        .withMessage("Please enter valid upfront_interest"),
      check("int_value")
        .notEmpty()
        .withMessage("int_value is required")
        .matches(/^(\d{1,8})(.\d{1,4})?(A|P)$/)
        .withMessage("Please enter valid int_value"),
      check("interest_free_days")
        .notEmpty()
        .withMessage("interest_free_days is required")
        .isLength({
          min: 1,
          max: 30
        })
        .withMessage("Please enter valid interest_free_days")
        .isNumeric()
        .withMessage("interest_free_days should be numeric"),
      check("exclude_interest_till_grace_period")
        .notEmpty()
        .withMessage("exclude_interest_till_grace_period is required"),
      check("tenure_in_days")
        .notEmpty()
        .withMessage("tenure_in_days is required")
        .isLength({
          min: 1,
          max: 30
        })
        .withMessage("Please enter valid tenure_in_days")
        .isNumeric()
        .withMessage("tenure_in_days should be numeric"),
      check("grace_period")
        .notEmpty()
        .withMessage("grace_period is required")
        .isLength({
          min: 1,
          max: 30
        })
        .withMessage("Please enter valid grace_period")
        .isNumeric()
        .withMessage("grace_period should be numeric"),
      check("overdue_charges_per_day")
        .notEmpty()
        .withMessage("overdue_charges_per_day is required")
        .matches(/^(\d{1,8})(.\d{1,4})?(RA|RP)$/)
        .withMessage("Please enter valid overdue_charges_per_day"),
      check("penal_interest")
        .notEmpty()
        .withMessage("penal_interest is required")
        .matches(/^(\d{1,8})(.\d{1,4})?(RA|RP)$/)
        .withMessage("Please enter valid penal_interest"),
      check("overdue_days")
        .notEmpty()
        .withMessage("overdue_days is required")
        .isLength({
          min: 1,
          max: 30
        })
        .withMessage("Please enter valid overdue_days")
        .isNumeric()
        .withMessage("overdue_days should be numeric"),
      check("penal_interest_days")
        .notEmpty()
        .withMessage("penal_interest_days is required")
        .isLength({
          min: 1,
          max: 30
        })
        .withMessage("Please enter valid penal_interest_days")
        .isNumeric()
        .withMessage("penal_interest_days should be numeric"),
      check("upfront_interest_days")
        .notEmpty()
        .withMessage("upfront_interest_days is required")
        .isLength({
          min: 1,
          max: 30
        })
        .withMessage("Please enter valid upfront_interest_days")
        .isNumeric()
        .withMessage("upfront_interest_days should be numeric"),
      check("loan_id")
        .notEmpty()
        .withMessage("loan id is required")
    ],
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty())
          return res.status(422).json({
            message: errors.errors[0]["msg"],
            success: false
          });
        let intrestDpdLogData = {
          user_id: req.user._id,
          user_name: req.user.username,
          added_date: moment().toLocaleString(),
          company_id: req.company._id,
          product_id: req.product._id,
          destination: "borrower",
          fees: req.body.fees,
          subvention_fees: req.body.subvention_fees,
          processing_fees: req.body.processing_fees,
          usage_fee: req.body.usage_fee,
          upfront_interest: req.body.upfront_interest,
          int_value: req.body.int_value,
          interest_free_days: req.body.interest_free_days,
          exclude_interest_till_grace_period:
            req.body.exclude_interest_till_grace_period,
          tenure_in_days: req.body.tenure_in_days,
          grace_period: req.body.grace_period,
          overdue_charges_per_day: req.body.overdue_charges_per_day,
          penal_interest: req.body.penal_interest,
          overdue_days: req.body.overdue_days,
          penal_interest_days: req.body.penal_interest_days
        };
        const logres = await intrestDpdConfigRevision.addLog(intrestDpdLogData);
        if (!logres)
          throw {
            message: "Error while adding revision log",
            success: false
          };
        const borrowerDuesResp = await BorrowerinfoCommon.updateDuesAndIntrestConfiguration(
          req.body,
          req.body.loan_id
        );
        if (!borrowerDuesResp)
          throw {
            message: "something went wrong while updating dues and intrest",
            success: false
          };
        return reqUtils.json(req, res, next, 200, {
          message: "Borrower dues data updated Successfully",
          success: true
        });
      } catch (error) {
        return res.status(400).send({
          error
        });
      }
    }
  );

  app.post("/api/get_borrowerinfo_dues", async (req, res) => {
    try {
      const borrowerResp = await BorrowerinfoCommon.findOneWithKLID(
        req.body.loan_id
      );
      if (!borrowerResp)
        throw {
          message: "No Record found in borrower info"
        };
      return res.send(borrowerResp);
    } catch (error) {
      return res.status(400).send({
        error
      });
    }
  });

  app.put(
    "/api/update_borrowerinfo",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      jwt.verifyLoanSchema,
      AccessLog.maintainAccessLog
    ],
    async (req, res, next) => {
      try {
        const biReqData = req.body;
        const reqData = [biReqData];
        //find the custom template path of requested template type
        const loanTemplate = await LoanTemplatesSchema.findByNameTmplId(
          req.loanSchema.loan_custom_templates_id,
          "loan"
        );
        if (!loanTemplate)
          throw {
            message: "No records found for loan template"
          };
        //fetch the custom template json data from s3 by path
        const resultJson = await s3helper.fetchJsonFromS3(
          loanTemplate.path.substring(loanTemplate.path.indexOf("templates"))
        );
        if (!resultJson)
          throw {
            message: "Error fetching json from s3"
          };
        //validate the incoming template data with customized template data
        const result = await validate.validateDataWithTemplate(
          resultJson,
          reqData
        );
        if (!result)
          throw {
            message: "Error while validating data with template"
          };
        if (result.unknownColumns.length)
          throw {
            message: "Few columns are unknown",
            data: {
              unknownColumns: result.unknownColumns
            }
          };
        if (result.missingColumns.length)
          throw {
            message: "Few columns are missing",
            data: {
              missingColumns: result.missingColumns
            }
          };
        if (result.errorRows.length)
          throw {
            message: "Few fields have invalid data",
            data: {
              exactErrorRows: result.exactErrorColumns,
              errorRows: result.errorRows
            }
          };
        if (result.validatedRows.length == reqData.length) {
          const Objkeys = resultJson
            .filter(item => {
              return item.checked;
            })
            .map(obj => {
              return obj.field;
            });
          // Fetch the same borrower info to be updated from BI schema
          const response = await BorrowerinfoCommon.findOneWithKBI(
            biReqData.borrower_id
          );
          if (!response)
            throw {
              message: "Error while finding Borrower Info."
            };
          if (response) {
            const borrowerInfo = JSON.parse(JSON.stringify(response));
            Objkeys.forEach(key => {
              if (borrowerInfo[key]) {
                borrowerInfo[key] = biReqData[key];
              }
            });

            const loanId = borrowerInfo?.loan_id;
            const loan_app_id = (borrowerInfo.updated_at = moment().format(
              "YYYY-MM-DD HH:mm:ss"
            ));
            delete borrowerInfo._id;
            delete borrowerInfo.created_at;
            delete borrowerInfo.loan_id;
            delete borrowerInfo.loan_app_id;
            delete borrowerInfo.partner_loan_app_id;
            delete borrowerInfo.borrower_id;
            delete borrowerInfo.company_id;
            delete borrowerInfo.product_id;
            delete borrowerInfo.partner_loan_id;
            delete borrowerInfo.partner_borrower_id;

            updateResp = await BorrowerinfoCommon.updateBI(
              borrowerInfo,
              loanId
            );

            if (!updateResp) throw {message: "Error while updating BI data."};
            if (updateResp) {
              return res.json({
                message: "Borrower info updated successfully",
                borrowerInfo
              });
            }
          }
        }
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.patch(
    "/api/loan_nach/:loan_id",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany, jwt.verifyProduct],
    borrowerHelper.validateLoanPatchData,
    async (req, res) => {
      try {
        const {loan_id} = req.params;
        const data = req.body;
        const errors = validationResult(req);
        if (!errors.isEmpty())
          return res.status(422).json({
            message: errors.errors[0]["msg"]
          });
        const borrowerInfo = await BorrowerinfoCommon.updateBI(data, loan_id);
        if (borrowerInfo)
          res.send({
            success: true,
            message: "Loan updated successfully"
          });
        else
          throw {
            success: false,
            message: "Failed to update loan details"
          };
      } catch (error) {
        console.log(error);
        return res.status(400).send(error);
      }
    }
  );
};
