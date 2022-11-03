bodyParser = require("body-parser");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
var bureau = require("../models/service-req-res-log-schema.js");
const jwt = require("../util/jwt");
const services = require("../util/service");
const axios = require("axios");
const kycdata = require("../models/kyc-data-schema.js");
const AccessLog = require("../util/accessLog");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");

module.exports = (app, connection) => {
  app.post(
    "/api/kz_bank_acc_num",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabledCached(process.env.SERVICE_BANK_ACC_NUMBER_KYC_ID),
      AccessLog.maintainAccessLog,
      verifyloanAppIdValidation,
    ],
    async (req, res) => {
      const apiName = "BANK-ACC-NUM-KYC";
      const requestID = `${req.company.code}-${apiName}-${Date.now()}`;
      try {
        const data = req.body;
        //s3 url
        const url = req.service.file_s3_path;
        //fetch template from s3
        const resJson = await s3helper.fetchJsonFromS3(
          url.substring(url.indexOf("services"))
        );
        if (!resJson)
          throw {
            message: "Error while finding template from s3",
          };
        //validate the incoming template data with customized template data
        const result = validate.validateDataWithTemplate(resJson, [
          data,
        ]);
      
        if (result.missingColumns.length) {
          result.missingColumns = result.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!result)
          throw {
            message: "No records found",
            success: false
          };
        if (result.unknownColumns.length)
          throw {
            message: result.unknownColumns[0],
            success: false
          };
        if (result.missingColumns.length)
          throw {
            message: result.missingColumns[0],
            success: false
          };
        if (result.errorRows.length)
          throw {
            message: Object.values(result.exactErrorColumns[0])[0],
            success: false
          };

        //Karza data
        const karzaData = {
          ifsc: req.body.ifsc,
          accountNumber: req.body.account_number,
          consent: "Y",
        };
        //Karza url
        const karzaURL = process.env.KARZA_URL + "v2/bankacc";
        //X-karza-key
        const key = process.env.KARZA_API_KEY;
        //Headers
        const config = {
          headers: {
            "x-karza-key": key,
            "Content-Type": "application/json",
          },
        };

        //generic data to be stored in database(request data / response data)
        var logData = {
          company_id: req.company._id,
          company_code: req.company.code,
          vendor_name: "KARZA",
          service_id: process.env.SERVICE_BANK_ACC_NUMBER_KYC_ID,
          api_name: apiName,
          timestamp: Date.now(),
          consent: karzaData.consent,
          loan_app_id: req.body.loan_app_id,
          request_id: requestID,
          raw_data: "",
          response_type: "",
          request_type: "",
          id_number: req.body.account_number,
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
        };

        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${logData.api_name}/${logData.vendor_name}/${logData.company_id}/${filename}/${logData.timestamp}.txt`;

        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);

        if (!uploadResponse) {
          (logData.document_uploaded_s3 = 0), (logData.response_type = "error");
        } else {
          logData.document_uploaded_s3 = 1;
          logData.response_type = "success";
        }
        logData.api_response_status = "SUCCESS";
        logData.raw_data = uploadResponse.Location;
        logData.reqdata = uploadResponse.Location;
        logData.request_type = "request";

        //insert request data s3 upload response to database
        const addServiceBureau = await bureau.addNew(logData);
        if (!addServiceBureau)
          throw {
            message: "Error while adding request data",
            success: false,
          };
        //call karza api after successfully uploading request data to s3
        axios
          .post(karzaURL, JSON.stringify(karzaData), config)
          .then(async (response) => {
            //response data from karza to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            //upload response data from karza on s3
            const resKey = `${logData.api_name}/${logData.vendor_name}/${logData.company_id}/${filename}/${logData.timestamp}.txt`;

            const uploadResponse = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadResponse) {
              (logData.document_uploaded_s3 = 0),
                (logData.response_type = "error");
            }
            logData.document_uploaded_s3 = 1;
            logData.response_type = "success";
            logData.raw_data = uploadResponse.Location;
            logData.resdata = uploadResponse.Location;
            logData.request_type = "response";
            if (response.data["status-code"] == 101) {
              (logData.api_response_status = "SUCCESS"),
                (logData.kyc_id = `${req.company.code}-BANK-ACC-NUM-${Date.now()}`);
            } else {
              logData.api_response_status = "FAIL";
            }
            //insert call ekyc check
            const data = {
              company_id: req.company._id,
              loan_app_id: req.body.loan_app_id,
              kyc_type: logData.api_name,
              req_url: logData.reqdata,
              res_url: logData.resdata,
              consent: karzaData.consent,
              id_number: req.body.account_number,
              created_at: Date.now(),
              created_by: req.company.code,
              kyc_id: requestID,
            };
            const addEKYCData = await kycdata.addNew(data);
            if (!addEKYCData)
              throw {
                message: "Error while adding ekyc data",
                success: false,
              };
            //insert response data s3 upload response to database
            const serviceBureau = await bureau.addNew(logData);
            if (!serviceBureau)
              throw {
                message: "Error while adding response data to database",
                success: false,
              };

            // send final response
            if (logData.api_response_status == "SUCCESS") {
              return res.send({
                kyc_id: requestID,
                data: response.data,
                success: true,
              });
            } else {
              return res.send({
                kyc_id: requestID,
                data: response.data,
                success: false,
              });
            }
          })
          .catch(async(error) => {
            //handle error catched from karza api
            res.status(500).send({
              kyc_id : requestID,
              message: "Please contact the administrator",
              status: "fail",
            });
          });
      } catch (error) {
        res.status(500).send({
          kyc_id : requestID,
          message: "Please contact the administrator",
          status: "fail",
        });
      }
    }
  );
};