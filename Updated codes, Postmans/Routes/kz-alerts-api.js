const bodyParser = require("body-parser");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
var SerReqResLog = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const axios = require("axios");
const {
  verifyloanAppIdValidation,
} = require("../util/loan-app-id-validation.js");
const { logErrorToS3 } = require("../utils/error-logger.js");

module.exports = (app) => {
  app.use(bodyParser.json());
  app.post(
    "/api/kz-alerts",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabledCached(process.env.SERVICE_KSCAN_ID),
      verifyloanAppIdValidation,
    ],
    async (req, res) => {
      const apiName = "KSCAN";
      const requestId = `${req.company.code}-${apiName}-${Date.now()}`;
      try {
        // validate api-request with service template
        let templateS3url = req.service.file_s3_path;
        const templateResponse = await s3helper.fetchJsonFromS3(
          templateS3url.substring(templateS3url.indexOf("services"))
        );
        if (!templateResponse)
          throw { message: "Error while finding template from s3" };

        // validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(
          templateResponse,
          [req.body]
        );
        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!resValDataTemp) throw { message: "No records found" };
        if (resValDataTemp.unknownColumns.length)
          throw { message: resValDataTemp.unknownColumns[0] };
        if (resValDataTemp.missingColumns.length)
          throw { message: resValDataTemp.missingColumns[0] };
        if (resValDataTemp.errorRows.length)
          throw {
            message: Object.values(resValDataTemp.exactErrorColumns[0])[0],
          };

        var localLog = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code:
            req.company && req.company.code ? req.company.code : null,
          vendor_name: "KARZA",
          service_id: process.env.SERVICE_KSCAN_ID,
          api_name: "KSCAN",
          raw_data: "",
          response_type: "",
          request_type: "",
          loan_app_id: req.body.loan_app_id,
          consent: req.body.consent,
          consent_timestamp: req.body.consent_timestamp,
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId,
        };

        // upload request data on s3
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${localLog.api_name}/${localLog.vendor_name}/${localLog.company_id}/${filename}/${localLog.timestamp}.txt`;
        let s3LogResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!s3LogResponse) {
          (localLog.document_uploaded_s3 = 0),
            (localLog.response_type = "error");
        }
        localLog.document_uploaded_s3 = 1;
        localLog.response_type = "success";
        localLog.api_response_status = "SUCCESS";
        localLog.raw_data = s3LogResponse.Location;
        localLog.request_type = "request";

        if (req.body.consent === "N") {
          localLog.response_type = "error";
          localLog.api_response_status = "FAIL";
        }

        // insert request data s3 upload response to database
        let localLogResult = await SerReqResLog.addNew(localLog);
        if (!localLogResult)
          throw { message: "Error while adding request data" };

        if (req.body.consent === "N"){
          throw{
              message: "Consent was not provided",
          }
        }

        // call kscan api after successfully uploading request data to s3
        axios
          .post(
            process.env.KSCAN_BASE_URL + "v3/alerts",
            JSON.stringify({
              id: req.body.id,
              loan_app_id: req.body.loan_app_id,
              consent: req.body.consent,
              consent_timestamp: req.body.consent_timestamp,
            }),
            {
              headers: {
                "x-karza-key": process.env.KSCAN_API_KEY,
                "Content-Type": "application/json",
              },
            }
          )
          .then(async (response) => {
            // response data from kscan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${localLog.api_name}/${localLog.vendor_name}/${localLog.company_id}/${filename}/${localLog.timestamp}.txt`;
            // upload response data from karza on s3
            s3LogResponse = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!s3LogResponse) {
              (localLog.document_uploaded_s3 = 0),
                (localLog.response_type = "error");
            } else {
              localLog.document_uploaded_s3 = 1;
              localLog.response_type = "success";
            }
            localLog.raw_data = await s3LogResponse.Location;
            localLog.request_type = "response";
            if (response.data["statusCode"] == 101) {
              localLog.api_response_status = "SUCCESS";
            } else {
              localLog.api_response_status = "FAIL";
            }

            // insert response data s3 upload response to database
            localLogResult = await SerReqResLog.addNew(localLog);
            if (!localLogResult)
              throw { message: "Error while adding response data" };

            // send final response
            if (localLog.api_response_status == "SUCCESS") {
              return res.status(200).send({
                request_id: requestId,
                success: true,
                data: response.data,
              });
            } else {
              throw{
                request_id: requestId,
                success: false,
                data: response.data,
              }
            }
          })
          .catch((error) => {
            logErrorToS3(req, res, requestId, apiName, "KARZA", error);
          });
      } catch (error) {
        if (error.message) return res.status(400).send({
          request_id: requestId,
          success: false,
          error: error,
        });
        logErrorToS3(
          req,
          res,
          requestId,
          apiName,
          "KARZA",
          error.message || error
        );
      }
    }
  );
};
