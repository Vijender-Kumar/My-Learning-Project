bodyParser = require("body-parser");
const jwt = require("../util/jwt");
const helper = require("../util/helper");
const AccessLog = require("../util/accessLog");
const moment = require("moment");
const {check, validationResult} = require("express-validator");
let reqUtils = require("../util/req.js");
const middlewares = require("../utils/middlewares");
const BorrowerinfoCommon = require("../models/borrowerinfo-common-schema.js");
const LoanValidityCheck = require("../models/loan-validity-schema.js");
const LoanTransactionSchema = require("../models/loan-transaction-ledger-schema.js");
const {default: axios} = require("axios");
const thirdPartyHelper = require("../util/thirdPartyHelper");

module.exports = (app, connection) => {
  var checkLoanValidity = async clUsageRecord => {
    try {
      const loanIds = clUsageRecord.map(item => {
        return String(item.loan_id);
      });
      const uniqueLoanIds = [...new Set(loanIds)];
      const validityResp = await LoanValidityCheck.findKLIByIds(uniqueLoanIds);
      if (!validityResp) return true;
      if (validityResp) {
        for (let index = 0; index < clUsageRecord.length; index++) {
          let loanValidateRecord = validityResp.filter(
            ele => ele.loan_id === String(clUsageRecord[index].loan_id)
          );
          if (
            loanValidateRecord.length &&
            loanValidateRecord[0].valid_from_date &&
            loanValidateRecord[0].valid_till_date &&
            (clUsageRecord[index].txn_date <
              loanValidateRecord[0].valid_from_date ||
              clUsageRecord[index].txn_date >
                loanValidateRecord[0].valid_till_date)
          )
            return "txn_date should be in between the loan validity date.";
          if (clUsageRecord.length - 1 === index) return true;
        }
      }
    } catch (error) {
      return "Something went wrong.";
    }
  };

  // api to fetch repayment records
  app.get(
    "/api/repayment_record/:loan_id",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      AccessLog.maintainAccessLog
    ],
    async (req, res, next) => {
      try {
        const {loan_id} = req.params;
        const repaymentRecords = await LoanTransactionSchema.findAllTxnWithKlid(
          loan_id,
          "cr"
        );
        if (!repaymentRecords.length)
          throw {
            success: false,
            message: "No repayment records found against provided  loan id"
          };
        if (repaymentRecords)
          return res.status(200).send({
            success: true,
            count: repaymentRecords.length,
            repaymentData: repaymentRecords
          });
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );

  //loan repayment API
  app.post(
    "/api/repayment_record",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      jwt.verifyProduct,
      AccessLog.maintainAccessLog
      //middlewares.injectLoanRequestFromArrayToParseAndEval,
    ],
    async (req, res, next) => {
      try {
        const reqData = req.body;
        const currentDate = moment(Date.now())
          .endOf("day")
          .format("YYYY-MM-DD");
        //request data will be validated according to this data
        const template = [
          {
            field: "loan_id",
            type: "string",
            checked: "TRUE",
            validationmsg: "Please enter valid loan_id."
          },
          {
            field: "borrower_id",
            type: "string",
            checked: "TRUE",
            validationmsg: "Please enter valid borrower_id."
          },
          {
            field: "partner_loan_app_id",
            type: "string",
            checked: "TRUE",
            validationmsg: "Please enter valid partner_loan_app_id."
          },
          {
            field: "partner_borrower_id",
            type: "string",
            checked: "TRUE",
            validationmsg: "Please enter valid partner_borrower_id."
          },
          {
            field: "utr_number",
            type: "string",
            checked: "TRUE",
            validationmsg: "Please enter valid utr_number."
          },
          {
            field: "utr_date_time_stamp",
            type: "date",
            checked: "TRUE",
            validationmsg: "Please enter valid utr_date_time_stamp."
          },
          {
            field: "txn_amount",
            type: "float",
            checked: "TRUE",
            validationmsg: "Please enter transaction amount."
          },
          {
            field: "txn_reference",
            type: "string",
            checked: "TRUE",
            validationmsg: "Please enter valid transaction reference."
          },
          {
            field: "txn_entry",
            type: "string",
            checked: "FALSE",
            validationmsg: "Please enter valid transaction entry type eg dr"
          },
          {
            field: "label",
            type: "string",
            checked: "FALSE",
            validationmsg: "Please enter valid transaction label"
          },
          {
            field: "record_method",
            type: "string",
            checked: "TRUE",
            validationmsg: "Please enter valid record_method."
          },
          {
            field: "note",
            type: "string",
            checked: "FALSE",
            validationmsg: "Please enter valid note."
          }
        ];

        // Validate product type is not loc
        if (req.product.allow_loc) {
          throw {
            success: false,
            message:
              "repayment record is not enabled for this product as product is of type LOC."
          };
        }

        //validate request data with above data
        const result = await helper.nonstrictValidateDataWithTemplate(
          template,
          reqData
        );
        if (!result)
          throw {
            message: "Error while validating data with template."
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

        let negative_amount_records = reqData.filter(item => {
          return item.txn_amount < 1;
        });

        if (negative_amount_records.length)
          return reqUtils.json(req, res, next, 400, {
            message: "txn_amount should be greater than zero.",
            errorCode: "01",
            data: negative_amount_records
          });

        result.validatedRows.forEach(row => {
          row.company_id = req.company._id;
        });

        let futureTxnDates = [];
        result.validatedRows.forEach(item => {
          let txnDate = item.txn_date;
          if (txnDate > currentDate) {
            futureTxnDates.push(txnDate);
          }
        });
        if (futureTxnDates.length)
          throw {
            message:
              "some txn_dates are from future hence we can not add records in transaction ledger.",
            data: futureTxnDates
          };
        //make array off all loan ids
        const loanIds = await result.validatedRows.map(item => {
          return String(item.loan_id);
        });

        const TxnDate = await result.validatedRows.map(item => {
          return String(item.txn_date);
        });

        const utrNumbers = await result.validatedRows.map(item => {
          return String(item.utr_number);
        });
        // Make array of all unique loan ids so that there is no repetition of ids
        const uniqueLoanIds = [...new Set(loanIds)];
        // Check if all the unique loan ids are present in borrowerinfo
        const loanIdsList = await BorrowerinfoCommon.findKLIByIds(
          uniqueLoanIds
        );
        if (!loanIdsList)
          throw {
            message: "Error finding loan ids in borrower info"
          };
        const checkProductAssociated = loanIdsList.filter(
          item => item.product_id !== req.product._id
        );
        if (checkProductAssociated.length)
          throw {
            message:
              "Few loan ids are not asociated with this product. Use appropriate token against that product for loan id",
            data: {
              checkProductAssociated: checkProductAssociated
            }
          };
        const biPresentIds = loanIdsList.map(record => {
          return record.loan_id.toString().replace(/\s/g, "");
        });
        const biMissingIds = uniqueLoanIds
          .filter(loanId => {
            return biPresentIds.indexOf(String(loanId)) <= -1;
          })
          .map(id => {
            return {
              loan_id: id
            };
          });
        if (biMissingIds.length)
          throw {
            message: `Some loan ids do not exist.`,
            data: {
              missingIds: biMissingIds
            }
          };
        const loanIdwithCompany = await BorrowerinfoCommon.findKLIByIdsWithCompanyId(
          uniqueLoanIds,
          req.company._id
        );
        if (!loanIdwithCompany)
          throw {
            message: "Error finding loan ids"
          };
        if (uniqueLoanIds.length != loanIdwithCompany.length)
          throw {
            message: "Some loan ids are not associated with selected company"
          };
        const onlyDisbursedPush = loanIdsList.filter(
          item => item.status === "disbursed"
        );
        if (uniqueLoanIds.length != onlyDisbursedPush.length)
          throw {
            message:
              "Some Loan Ids Loan status is not disbursed.Kindly contact administrator."
          };
        const biPresentId = loanIdwithCompany.map(record => {
          return record.loan_id.toString().replace(/\s/g, "");
        });
        const biMissingId = uniqueLoanIds
          .filter(loanId => {
            return biPresentId.indexOf(String(loanId)) <= -1;
          })
          .map(id => {
            return {
              loan_id: id
            };
          });
        if (biMissingId.length)
          throw {
            message: "Some loan ids are not associated with selected company",
            data: {
              missingIds: biMissingIds
            }
          };
        const validityResp = await checkLoanValidity(result.validatedRows);
        if (!validityResp)
          throw {
            message: validityResp
          };

        const loanIdwithTxn = await LoanTransactionSchema.findKLIByIdsWithUtrNumber(
          utrNumbers
        );
        if (
          utrNumbers.filter((item, index) => utrNumbers.indexOf(item) != index)
            .length != 0
        )
          throw {
            message: "Some utr numbers are duplicate"
          };
        if (loanIdwithTxn.length != 0)
          throw {
            message: "Some utr numbers are duplicate ",
            data: loanIdwithTxn
          };
        const ledgerDataArray = [];
        result.validatedRows.forEach(row => {
          let ledgerObj = {};
          ledgerObj.loan_id = row.loan_id.toString().replace(/\s/g, "");
          ledgerObj.loan_app_id = row.loan_app_id;
          ledgerObj.borrower_id = row.borrower_id;
          ledgerObj.partner_loan_app_id = row.partner_loan_app_id;
          ledgerObj.partner_borrower_id = row.partner_borrower_id;
          ledgerObj.txn_amount = row.txn_amount;
          ledgerObj.txn_entry = "cr";
          ledgerObj.txn_reference = row.txn_reference ? row.txn_reference : "";
          ledgerObj.txn_reference_datetime = row.txn_reference_datetime
            ? row.txn_reference_datetime
            : "";
          ledgerObj.label = row.label;
          ledgerObj.disbursement_status = row.disbursement_status;
          ledgerObj.utr_number = row.utr_number;
          ledgerObj.utr_date_time_stamp =
            row.utr_date_time_stamp || moment().format("YYYY-MM-DD");
          ledgerObj.record_method = row.record_method;
          ledgerObj.note = row.note;
          ledgerObj.company_id = req.company._id;
          ledgerObj.company_name = req.company.name;
          ledgerObj.product_id = req.product_id;
          ledgerObj.product_key = req.product.name;
          ledgerObj.principal_due_amount = row?.principal_due_amount;
          ledgerObj.emi_number = row?.emi_number;
          ledgerObj.emi_type = row?.emi_type;
          ledgerObj.paid_by = row?.paid_by;
          ledgerObj.principal_amount = row?.principal_amount;
          ledgerObj.payment_mode = row?.payment_mode;
          ledgerObj.principal_paid_amount = row?.principal_paid_amount;
          ledgerObj.repayment_tag = row?.repayment_tag;
          ledgerObj.repayment_due_amount = row?.repayment_due_amount;
          ledgerObj.interest_due_amount = row?.interest_due_amount;
          ledgerObj.repayment_due_date = row?.repayment_due_date;
          ledgerObj.interest_paid_amount = row?.interest_paid_amount;
          //ledgerObj.repayment_paid_amount = row?.repayment_paid_amount;
          ledgerObj.additional_charge_paid = row?.additional_charge_paid;
          //ledgerObj.transaction_number = row?.transaction_number;
          //ledgerObj.order_id = row?.order_id;
          ledgerDataArray.push(ledgerObj);
        });

        loanIdsList.forEach(borrower => {
          const elementPos = ledgerDataArray
            .map(function(x) {
              return x.loan_id;
            })
            .indexOf(borrower.loan_id);
          ledgerDataArray[elementPos].product_id = borrower.product_id;
        });

        var addedTransaction = await LoanTransactionSchema.addInBulk;

        const updatLmsRepayment = await thirdPartyHelper.LMSRepaymentApi(
          ledgerDataArray,
          req,
          res
        );
        if (updatLmsRepayment.success) {
          const respUsageAdd = await addedTransaction(ledgerDataArray);
          const count = [respUsageAdd];
          if (!respUsageAdd)
            throw {
              message: "Error while adding bulk repayment data in ledger"
            };
          return res.status(200).send({
            success: true,
            message: `Successfully inserted ${count.length} records in loan  transaction ledger`
          });
        }
        throw {
          message: "Error while adding bulk repayment data in ledger"
        };
      } catch (error) {
        return res.status(400).send(error);
      }
    }
  );
};
