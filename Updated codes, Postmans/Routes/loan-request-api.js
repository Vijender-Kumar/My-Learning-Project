bodyParser = require("body-parser");
const LoanRequestSchema = require("../models/loan-request-schema.js");
const LoanTemplatesSchema = require("../models/loan-templates-schema.js");
const BorrowerinfoCommon = require("../models/borrowerinfo-common-schema.js");
const helper = require("../util/helper");
const s3helper = require("../util/s3helper");
const validate = require("../util/validate-req-body");
const jwt = require("../util/jwt");
const AccessLog = require("../util/accessLog");
const cacheUtils = require("../util/cache");
let reqUtils = require("../util/req.js");
const { check, validationResult } = require("express-validator");
const moment = require("moment");
const middlewares = require("../utils/middlewares.js");
const LoanActivities = require("../models/loan-activities-schema.js");
const thirdPartyHelper = require("../util/thirdPartyHelper");
const kycServices = require("../utils/kyc-services.js");
const { generateCustomerId } = require("../util/customLoanIdHelper");

module.exports = (app, connection) => {
  app.use(bodyParser.json());

  //get loan request template
  app.get(
    "/api/loanrequest/get_loan_request_template",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      jwt.verifyLoanSchema
    ],
    async (req, res, next) => {
      try {
        const loanTemplates = await LoanTemplatesSchema.findByNameTmplId(
          req.loanSchema.loan_custom_templates_id,
          "lead"
        );
        if (!loanTemplates)
          throw {
            message: "No records found"
          };
        const loanTemplateJson = await s3helper.fetchJsonFromS3(
          loanTemplates.path.substring(loanTemplates.path.indexOf("templates"))
        );
        if (!loanTemplateJson)
          throw {
            message: "Error while fetching template from s3"
          };
        const loanRequest = helper.generateLrTemplate(loanTemplateJson);
        res.send(loanRequest);
        next();
      } catch (error) {
        return res.status(400).send(error);
      }
    },
    AccessLog.maintainAccessLog
  );

  app.get(
    "/api/lead/:company_id/:product_id/:from_date/:to_date/:page/:limit/:str/:status",
    [jwt.verifyToken, jwt.verifyCompany, jwt.verifyProduct],
    async (req, res) => {
      try {
        const {
          company_id,
          product_id,
          from_date,
          to_date,
          str,
          book_entity_id,
          page,
          limit,
          status
        } = req.params;
        const lrList = await LoanRequestSchema.getAllByFilter({
          company_id,
          product_id,
          from_date,
          to_date,
          str,
          book_entity_id,
          page,
          limit: Number(limit),
          status
        });
        // const activityLog = await LoanRequestSchema.getLeadActivity();
        const leadData = await Promise.all(
          lrList?.rows.map(async lr => {
            let lead;
            lead = JSON.parse(JSON.stringify(lr));
            lead.product_name = req.product.name;
            lead.partner_name = `${req.company.name}  (${req.company.code})`;
            return lead;
          })
        );
        return res.send({
          rows: leadData,
          count: lrList.count
        });
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  //create lead
  app.post(
    "/api/lead",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      jwt.verifyLoanSchema,
      middlewares.parseAndEvaluateArray
    ],
    async (req, res, next) => {
      try {
        var loanReqData = req.body;
        loanReqData = reqUtils.cleanBody(loanReqData);
        const loanRequestTemplates = await LoanTemplatesSchema.findByNameTmplId(
          req.loanSchema.loan_custom_templates_id,
          "lead"
        );
        if (!loanRequestTemplates)
          throw {
            message: "No records found for loan request templates"
          };

        const resultLoanReqJson = await s3helper.fetchJsonFromS3(
          loanRequestTemplates.path.substring(
            loanRequestTemplates.path.indexOf("templates")
          ),
          {
            method: "Get"
          }
        );

        if (!resultLoanReqJson)
          throw {
            message: "Error fetching json from s3"
          };
        const validData = validate.validateDataWithTemplate(
          resultLoanReqJson,
          loanReqData
        );
        if (!validData)
          throw {
            message: "Error while validating data"
          };
        if (validData.unknownColumns.length)
          return reqUtils.json(req, res, next, 400, {
            message: "Few columns are unknown",
            errorCode: "03",
            data: {
              unknownColumns: validData.unknownColumns
            }
          });
        if (validData.missingColumns.length)
          return reqUtils.json(req, res, next, 400, {
            success: false,
            message: "Few columns are missing",
            errorCode: "01",
            data: {
              missingColumns: validData.missingColumns
            }
          });
        if (validData.errorRows.length)
          return reqUtils.json(req, res, next, 400, {
            success: false,
            message: "Few fields have invalid data",
            errorCode: "02",
            data: {
              exactErrorRows: validData.exactErrorColumns,
              errorRows: validData.errorRows
            }
          });
        if (validData.exactEnumErrorColumns.length)
          return reqUtils.json(req, res, next, 400, {
            success: false,
            message: `${validData.exactEnumErrorColumns[0]}`,
            errorCode: "02",
            data: {
              exactEnumErrorColumns: validData.exactEnumErrorColumns
            }
          });
        const checkState = resultLoanReqJson.filter(column => {
          return column["field"] === "state" && column.checked === "TRUE";
        });

        // Check if state field is manadatory for this product
        if (checkState.length || loanReqData[0].hasOwnProperty("state")) {
          const validateState = await helper.handleValidateStateName(
            req,
            res,
            loanReqData
          );
          if (validateState?.invalidData) {
            throw {
              message: "Invalid state names for this partner_loan_app_ids",
              data: validateState
            };
          }
        }

        const preparedLoanReq = helper.appendLoanIdBwId(
          validData.validatedRows,
          loanReqData,
          req,
          res
        );
        const partnerLoanIds = preparedLoanReq.map(item => {
          return item.partner_loan_app_id;
        });

        const panNumbers = await preparedLoanReq.map(item => {
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
          if (loanAppIdAlreadyExist.length)
            throw {
              success: false,
              message: "lead with provided pan number already exist"
            };
        }
        const loanAlreadyExist = await LoanRequestSchema.findKPartnerLoanIds(
          req.company._id,
          partnerLoanIds
        );
        if (loanAlreadyExist.length)
          throw {
            message: "Few loans already exists with this partner_loan_app_id.",
            data: loanAlreadyExist
          };
        if (req.query.validate) {
          return reqUtils.json(req, res, next, 200, {
            success: true,
            validated: true,
            message: "Fields have valid data",
            data: preparedLoanReq
          });
        }
        validData.validatedRows.forEach((value, index) => {
          if (moment(value.dob, "YYYY-MM-DD", true).isValid()) {
            validData.validatedRows[index].dob = moment(value.dob).format(
              "YYYY-MM-DD"
            );
          } else if (moment(value.dob, "DD-MM-YYYY", true).isValid()) {
            validData.validatedRows[index].dob = value.dob
              .split("-")
              .reverse()
              .join("-");
          }
        });
        /*Create customer ID*/
        const generateCustomerIds = await generateCustomerId(preparedLoanReq);
        if (!panAlreadyExist) {
          const addBulkLoanRequest = await LoanRequestSchema.addInBulk(
            preparedLoanReq
          );
          if (!addBulkLoanRequest)
            throw {
              message:
                "Error adding new loans with unique loan_app_id, Please retry"
            };
          const borrowerInfoTemplates = await LoanTemplatesSchema.findByNameTmplId(
            req.loanSchema.loan_custom_templates_id,
            "loan"
          );
          if (!borrowerInfoTemplates)
            throw {
              message: "No records found for borrower info template"
            };
          const resultBorroInfoJson = await s3helper.fetchJsonFromS3(
            borrowerInfoTemplates.path.substring(
              borrowerInfoTemplates.path.indexOf("templates")
            ),
            {
              method: "Get"
            }
          );
          const preparedbiTmpl = await helper.generatebiTmpl(
            [addBulkLoanRequest],
            resultBorroInfoJson
          );

          return reqUtils.json(req, res, next, 200, {
            success: true,
            message: "Lead generated successfully",
            data: {
              preparedbiTmpl
            }
          });
        }
      } catch (error) {
        console.log("Lead catch section", error);
        return res.status(400).send(error);
      }
    },
    AccessLog.maintainAccessLog
  );

  //update loanrequest
  app.put(
    "/api/lead",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      jwt.verifyLoanSchema
    ],
    async (req, res, next) => {
      try {
        var loanReqData = req.body;
        const loanTemplate = await LoanTemplatesSchema.findByNameTmplId(
          req.loanSchema.loan_custom_templates_id,
          "lead"
        );
        if (!loanTemplate)
          throw {
            message: "No records found for lead templates"
          };

        const loanReqJson = await s3helper.fetchJsonFromS3(
          loanTemplate.path.substring(loanTemplate.path.indexOf("templates"))
        );
        if (!loanReqJson)
          throw {
            success: false,
            message: "Error fetching json from s3"
          };
        loanReqData = reqUtils.cleanBody(loanReqData);
        const result = await validate.validateDataWithTemplate(
          loanReqJson,
          loanReqData
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
        if (result.validatedRows.length == loanReqData.length) {
          const partnerLoanAppIds = result.validatedRows.map(item => {
            return item.partner_loan_app_id;
          });

          const loanAlreadyExist = await BorrowerinfoCommon.findByPartnerLoanAppIds(
            partnerLoanAppIds
          );
          if (loanAlreadyExist.length && loanAlreadyExist[0] !== null) {
            throw {
              message: "As loan already exist can't edit lead.",
              data: loanAlreadyExist
            };
          }

          result.validatedRows.forEach((value, index) => {
            if (moment(value.dob, "YYYY-MM-DD", true).isValid()) {
              result.validatedRows[index].dob = moment(value.dob).format(
                "YYYY-MM-DD"
              );
            } else if (moment(value.dob, "DD-MM-YYYY", true).isValid()) {
              result.validatedRows[index].dob = value.dob
                .split("-")
                .reverse()
                .join("-");
            }
            result.validatedRows[index].aadhar_card_num = result.validatedRows[
              index
            ].hasOwnProperty("aadhar_card_num")
              ? result.validatedRows[index].aadhar_card_num.replace(
                /.(?=.{4,}$)/g,
                "*"
              )
              : "";
            result.validatedRows[index].addr_id_num =
              result.validatedRows[index].hasOwnProperty("addr_id_num") &&
                result.validatedRows[index].addr_id_num.match(/^\d{12}$/)
                ? result.validatedRows[index].addr_id_num.replace(
                  /.(?=.{4,}$)/g,
                  "*"
                )
                : result.validatedRows[index].hasOwnProperty("addr_id_num")
                  ? result.validatedRows[index].addr_id_num
                  : "";
          });

          const updateLoanReq = await LoanRequestSchema.updateBulk(
            result.validatedRows
          );
          if (!updateLoanReq)
            throw {
              message: "Error while updating lead data"
            };
          result.validatedRows.forEach(async (item, index) => {
            if (index === result.validatedRows.length - 1) {
              res.send({
                message: `Successfully updated ${result.validatedRows.length} rows`
              });
              next();
            }
          });
        }
      } catch (error) {
        return res.status(400).send(error);
      }
    },
    AccessLog.maintainAccessLog
  );

  // app.post("/api/get_loanrequest_details", async (req, res) => {
  //   try {
  //     const loanRequestDetails = await LoanRequestSchema.checkloanId(
  //       req.body.loan_app_id
  //     );
  //     if (!loanRequestDetails)
  //       throw { message: "No record found in loan request" };
  //     return res.send(loanRequestDetails);
  //   } catch (error) {
  //     return res.status(400).send(error);
  //   }
  // });

  app.get(
    "/api/lead/:loan_app_id",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany, jwt.verifyProduct],
    async (req, res) => {
      try {
        const leadDetails = await LoanRequestSchema.findByLId(
          req.params.loan_app_id
        );
        if (!leadDetails)
          throw {
            success: false,
            message: "No record found in lead table aginst provoded loan_app_id"
          };
        return res.send(leadDetails);
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.post(
    "/api/find_duplicate_cases",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyProduct, jwt.verifyCompany],
    [
      check("loan_app_id")
        .notEmpty()
        .withMessage("loan id is required")
        .isNumeric()
        .withMessage("loan id accept only number.")
    ],
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty())
          throw {
            message: errors.errors[0]["msg"]
          };
        const reqData = req.body;
        const RespBorro = await BorrowerinfoCommon.findOneWithKLID(
          reqData.loan_app_id
        );
        if (!RespBorro)
          throw {
            message: "This loan id does not exist."
          };
        if (RespBorro.company_id !== req.company.id)
          throw {
            message: "Loan id is not associated with this company."
          };
        if (RespBorro.product_id !== req.product.id)
          throw {
            message: "loan id is not associated with this product."
          };
        const appl_pan =
          typeof reqData.pan_id !== "undefined" ? reqData.pan_id : "";
        const appl_phone =
          typeof reqData.mobile_number !== "undefined"
            ? reqData.mobile_number
            : "";
        if (appl_pan === "" && appl_phone === "")
          throw {
            message: "please send pan id or mobile no"
          };
        const condition =
          appl_pan !== "" && appl_phone !== ""
            ? {
              appl_pan: appl_pan,
              appl_phone: appl_phone
            }
            : appl_pan !== ""
              ? {
                appl_pan: appl_pan
              }
              : appl_phone !== ""
                ? {
                  appl_phone: appl_phone
                }
                : {};
        const loanReqResp = await LoanRequestSchema.findByPanandMobile(
          condition
        );
        if (!loanReqResp)
          throw {
            message: "No record found in loan request"
          };
        const bookingLoanIds = loanReqResp.map(item => {
          return String(item.loan_app_id);
        });
        const borrowerResponse = await BorrowerinfoCommon.findKLIByIds(
          bookingLoanIds
        );
        borrowerResponse.forEach(items => {
          const index = loanReqResp.findIndex(
            ele => ele.loan_app_id == items.loan_app_id
          );
          loanReqResp[index].status = items.status;
          loanReqResp[index].product_name = items.product_name;
          loanReqResp[index].company_name = items.company_name;
        });
        return reqUtils.json(req, res, next, 200, response);
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.post(
    "/api/filter_by_pan",
    [jwt.verifyToken, jwt.verifyUser],
    [
      check("pan_id")
        .notEmpty()
        .withMessage("Pan id is required")
        .isLength({
          min: 10,
          max: 10
        })
        .withMessage("Please enter valid Pan id")
        .matches(/^([a-zA-Z]){5}([0-9]){4}([a-zA-Z]){1}?$/)
        .withMessage("Please enter valid pan id")
    ],
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty())
          throw {
            message: errors.errors[0]["msg"]
          };
        const reqData = req.body;
        const where = {};
        where.appl_pan = reqData.pan_id;
        const loanReqByPan = await LoanRequestSchema.findByPanandMobile(where);
        if (!loanReqByPan)
          throw {
            message: "No record found in loan request"
          };
        const loanIds = loanReqByPan.map(item => {
          return String(item.booking_loan_app_id);
        });
        const borrowInfo = await BorrowerinfoCommon.findKLIByIds(loanIds);
        if (!borrowInfo)
          throw {
            message:
              "something went wrong while fetching data from borrower info"
          };
        let resData = [];
        borrowInfo.forEach(birow => {
          loanReqByPan.forEach(lrrow => {
            if (birow.loan_app_id === lrrow.loan_app_id) {
              Object.assign(birow, lrrow);
              resData.push(birow);
            }
          });
          return reqUtils.json(req, res, next, 200, resData);
        });
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.get(
    "/api/lead/activity-log/:loan_app_id",
    [jwt.verifyToken, jwt.verifyCompany, jwt.verifyProduct],
    async (req, res) => {
      try {
        const result = await LoanActivities.findByLAPId(req.params.loan_app_id);
        let activityJson = {};
        let iteration = 0;
        let count = 0;
        const getJsonsFromS3 = await result.map(async record => {
          if (
            record?.api_type === "BRE" &&
            record?.request_type === "response"
          ) {
            const getJson = await s3helper.fetchJsonFromS3(
              record?.url.substring(record.url.indexOf("BRE"))
            );
            activityJson.breJson = getJson;
            count = count + 1;
          }
          if (
            record?.api_type === "LMS_LEAD" &&
            record?.request_type === "response"
          ) {
            const getJson = await s3helper.fetchJsonFromS3(
              record?.url.substring(record.url.indexOf("LMS_LEAD"))
            );
            activityJson.leadJson = getJson;
            count = count + 1;
          }
          if (
            record?.api_type === "LMS_LOAN" &&
            record?.request_type === "response"
          ) {
            const getJson = await s3helper.fetchJsonFromS3(
              record?.url.substring(record.url.indexOf("LMS_LOAN"))
            );
            activityJson.loanJson = getJson;
            count = count + 1;
          }
          if (
            record?.api_type === "send_enhanced_review" &&
            record?.request_type === "request"
          ) {
            const getJson = await s3helper.fetchJsonFromS3(
              record?.url.substring(record.url.indexOf("send_enhanced_review"))
            );
            activityJson.reviewJson = getJson;
            count = count + 1;
          }
          iteration = iteration + 1;
          if (count === 4 || iteration === result.length) {
            return res.send(activityJson);
          }
        });
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  app.get(
    "/api/lead/details/:loan_app_id",
    [jwt.verifyToken, jwt.verifyCompany, jwt.verifyProduct],
    async (req, res) => {
      try {
        const responseData = await LoanRequestSchema.findIfExists(
          req.params.loan_app_id
        );
        if (!responseData)
          throw {
            message: "No records found"
          };
        if (req.company._id !== responseData.company_id)
          throw {
            message: "loan_app_id is not associated with company"
          };
        if (req.product._id !== responseData.product_id)
          throw {
            message: "loan_app_id is not associated with product"
          };
        const loanTemplate = await LoanTemplatesSchema.findByNameTmplId(
          req.loanSchema.loan_custom_templates_id,
          "lead"
        );
        if (!loanTemplate)
          throw {
            message: "No records found"
          };
        //fetch the custom template json data from s3 by path
        const resultJson = await s3helper.fetchJsonFromS3(
          loanTemplate.path.substring(loanTemplate.path.indexOf("templates"))
        );
        let fieldDepartmentMapper = {};
        resultJson
          .filter(i => i.checked === "TRUE")
          .forEach(item => {
            if (!fieldDepartmentMapper[item.dept]) {
              fieldDepartmentMapper[item.dept] = {};
              fieldDepartmentMapper[item.dept]["fields"] = [];
            }
            fieldDepartmentMapper[item.dept].fields.push(item.field);
          });
        return res.send({
          data: responseData,
          resultJson,
          fieldDepartmentMapper
        });
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );
};
