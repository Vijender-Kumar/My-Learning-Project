const bodyParser = require("body-parser");
const jwt = require("../util/jwt");
const helper = require("../util/helper");
const AccessLog = require("../util/accessLog");
const BorrowerinfoCommon = require("../models/borrowerinfo-common-schema.js");
const LoanTransactionSchema = require("../models/loan-transaction-ledger-schema.js");
module.exports = (app) => {
    app.use(bodyParser.json());
    //loan repayment API Version 2
    app.post(
      "/api/repayment-record-v2",
      [
        jwt.verifyToken,
        jwt.verifyUser,
        jwt.verifyCompany,
        jwt.verifyProduct,
        AccessLog.maintainAccessLog,
      ],
      async (req, res, next) => {
        try {
          const reqData = req.body;
          //Custom Validation check
          const template = [{
              field: "loan_id",
              type: "string",
              checked: "TRUE",
              validationmsg: "Please enter valid loan id.",
            },
            {
              field: "partner_loan_id",
              type: "string",
              checked: "TRUE",
              validationmsg: "Please enter valid partner loan id.",
            },
            {
              field: "utr_number",
              type: "string",
              checked: "TRUE",
              validationmsg: "Please enter valid utr number.",
            },
            {
              field: "utr_date_time_stamp",
              type: "dateTime",
              checked: "TRUE",
              validationmsg: "Please enter valid utr date with timestamp(yyyy-mm-dd hh:mm:ss).",
            },
            {
              field: "txn_amount",
              type: "float",
              checked: "TRUE",
              validationmsg: "Please enter transaction amount.",
            },
            {
              field: "txn_reference",
              type: "string",
              checked: "TRUE",
              validationmsg: "Please enter valid transaction reference.",
            },
            {
              field: "txn_reference_datetime",
              type: "dateTime",
              checked: "TRUE",
              validationmsg: "Please enter valid transaction reference date with timestamp(yyyy-mm-dd hh:mm:ss).",
            },
            {
              field: "payment_mode",
              type: "string",
              checked: "TRUE",
              validationmsg: "Please enter valid payment mode(PG-DebitCard/PG-InternetBanking/PG-UPI/E-Nach/Others).",
            },
            {
              field: "created_by",
              type: "string",
              checked: "TRUE",
              validationmsg: "Please enter valid created by detail.",
            },
          ];
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
              },
            };
          if (result.missingColumns.length)
            throw {
              message: "Few columns are missing",
              errorCode: "01",
              data: {
                missingColumns: result.missingColumns
              },
            };
          if (result.errorRows.length)
            throw {
              message: "Few fields have invalid data",
              errorCode: "02",
              data: {
                exactErrorRows: result.exactErrorColumns,
                errorRows: result.errorRows,
              },
            };
  
          //Loan Status validation (Disbursed Status)
          const loanIds = result.validatedRows.map((item) => {
            return String(item.loan_id);
          });
  
          const utrNumbers = result.validatedRows.map((item) => {
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

          const onlyDisbursedPush = loanIdsList.filter(
            (item) => item.stage === 4
          );
          if (uniqueLoanIds.length != onlyDisbursedPush.length)
            throw {
              message: "Some Loan Ids Loan status is not disbursed.Kindly contact administrator.",
            };

        // Unique UTR Check
          const loanIdwithTxn =
            await LoanTransactionSchema.findKLIByIdsWithUtrNumber(utrNumbers);
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
              data: loanIdwithTxn,
            };
          const ledgerDataArray = [];
          result.validatedRows.forEach((row) => {
            let ledgerObj = {};
            ledgerObj.loan_id = row?.loan_id.toString().replace(/\s/g, "");
            ledgerObj.partner_loan_id = row?.partner_loan_id;
            ledgerObj.payment_mode=row?.payment_mode;
            ledgerObj.created_by=row?.created_by;
            ledgerObj.txn_entry = "cr";
            ledgerObj.txn_amount = row?.txn_amount;
            ledgerObj.txn_reference = row?.txn_reference ? row?.txn_reference : "";
            ledgerObj.txn_reference_datetime = row?.txn_reference_datetime;
            ledgerObj.label = row?.label;
            ledgerObj.utr_number = row?.utr_number;
            ledgerObj.utr_date_time_stamp =row?.utr_date_time_stamp;
            ledgerObj.company_id = req.company._id;
            ledgerObj.company_name = req.company.name;
            ledgerObj.product_id = req.product_id;
            ledgerObj.product_key = req.product.name;
            ledgerDataArray.push(ledgerObj);
          });
  
          loanIdsList.forEach((borrower) => {
            const elementPos = ledgerDataArray
              .map(function(x) {
                return x.loan_id;
              })
              .indexOf(borrower.loan_id);
            ledgerDataArray[elementPos].product_id = borrower.product_id;
          });
  
          var addedTransaction = await LoanTransactionSchema.addInBulk;
          const respUsageAdd = await addedTransaction(ledgerDataArray);
          const count = [respUsageAdd];
          if (!respUsageAdd)
            throw {
              message: "Error while adding bulk repayment data in ledger",
            };
          return res.status(200).send({
            success: true,
            message: `Successfully inserted ${ledgerDataArray.length} records in loan  transaction ledger`,
          });
        } catch (error) {
          return res.status(400).send(error);
        }
      }
    );

    //Api to fetch repayment information
    app.get(
        "/api/repayment-record-v2/:loanId",
        [
          jwt.verifyToken,
          jwt.verifyUser,
          jwt.verifyCompany,
          jwt.verifyProduct,
          AccessLog.maintainAccessLog,
        ],
        async (req, res, next) => {
          try {
            const {loanId} = req.params;
            const repaymentRecords = await LoanTransactionSchema.findAllTxnWithKlid(
              loanId,
              "cr"
            );
            if (!repaymentRecords.length)
              throw {
                success: false,
                message: "No repayment records found against provided  loan id",
              };
            if (repaymentRecords)
              return res.status(200).send({
                success: true,
                count: repaymentRecords.length,
                repaymentData: repaymentRecords,
              });
          } catch (error) {
            return res.status(400).send(error);
          }
        }
      );
  };
