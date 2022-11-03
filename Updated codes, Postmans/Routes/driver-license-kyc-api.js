const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
var bureau = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const axios = require("axios");
const services = require("../util/service");
const kycdata = require("../models/kyc-data-schema.js");
const AccessLog = require("../util/accessLog");
const moment = require("moment");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");

module.exports = (app, connection) => {
  app.post(
    "/api/kz_driving_licence_kyc",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabled(process.env.SERVICE_DL_KYC_ID),
      AccessLog.maintainAccessLog,
      verifyloanAppIdValidation,
    ],
    async (req, res) => {
      try {
        const data = req.body;
        //s3 url
        const url = req.service.file_s3_path;
        //fetch template from s3
        const resJson = await s3helper.fetchJsonFromS3(
          url.substring(url.indexOf("services"))
        );
        if (!resJson) throw {
          message: "Error while finding temlate from s3"
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
          };
        if (result.unknownColumns.length)
          throw {
            message: result.unknownColumns[0],
          };
        if (result.missingColumns.length)
          throw {
            message: result.missingColumns[0],
          };
        if (result.errorRows.length)
          throw {
            message: Object.values(result.exactErrorColumns[0])[0],
          };
        //Karza data
        const karzaData = JSON.stringify({
          dlNo: req.body.dl_no,
          dob: moment(req.body.dob).format("DD-MM-YYYY"),
          additionalDetails: true,
          consent: req.body.consent,
        });
        //Karza url
        const karzaDrivingLicURL = process.env.KARZA_URL + "v3/dl";
        //X-karza-key
        const key = process.env.KARZA_API_KEY;
        //Headers
        var config = {
          headers: {
            "Content-Type": "application/json",
            "x-karza-key": key,
          }
        };
        //generic data to be stored in database(request data / response data)
        var dldata = {
          company_id: req.company._id,
          company_code: req.company.code,
          vendor_name: "KARZA",
          service_id: process.env.SERVICE_DL_KYC_ID,
          api_name: "DL-KYC",
          raw_data: "",
          response_type: "",
          request_type: "",
          loan_app_id: req.body.loan_app_id,
          timestamp: Date.now(),
          consent: req.body.consent,
          consent_timestamp: req.body.consent_timestamp,
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${dldata.api_name}/${dldata.vendor_name}/${dldata.company_id}/${filename}/${dldata.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (dldata.document_uploaded_s3 = 0), (dldata.response_type = "error");
        } else {
          dldata.document_uploaded_s3 = 1;
          dldata.response_type = "success";
        }
        dldata.api_response_status = "SUCCESS";
        dldata.raw_data = uploadResponse.Location;
        dldata.reqdata = uploadResponse.Location;
        dldata.request_type = "request";
        if (req.body.consent === "N") {
          dldata.response_type = "error";
          dldata.api_response_status = "FAIL";
        }
        //insert request data s3 upload response to database
        const addServiceBureau = bureau.addNew(dldata);
        if (!addServiceBureau)
          throw {
            message: "Error while adding request data",
            success: false,
          };
        if (req.body.consent === "N") {
          return res
            .status(400)
            .send({
              request_id: req.company.code+"-DL-KYC-"+Date.now(),
              message: "Consent was not provided",
            });
          };
        
        //call karza api after successfully uploading request data to s3
        axios
          .post(karzaDrivingLicURL, karzaData, config)
          .then(async (requestResp) => {
            //response data from karza to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            //upload response data from karza on s3
            const resKey = `${dldata.api_name}/${dldata.vendor_name}/${dldata.company_id}/${filename}/${dldata.timestamp}.txt`;
            const uploadS3Response = await s3helper.uploadFileToS3(
              requestResp.data,
              resKey
            );
            if (!uploadS3Response) {
              (dldata.document_uploaded_s3 = 0), (dldata.response_type = "error");
            }
            dldata.document_uploaded_s3 = 1;
            dldata.response_type = "success";
            dldata.raw_data = uploadS3Response.Location;
            dldata.resdata = uploadResponse.Location;
            dldata.request_type = "response";
            if (requestResp.data["statusCode"] == 101) {
              (dldata.api_response_status = "SUCCESS"),
              (dldata.kyc_id = `${req.company.code}-DL-KYC-${Date.now()}`);
            } else {
              dldata.api_response_status = "FAIL";
            }
            //insert call ekyc check
            const ekycInsertData = {
              company_id: req.company._id,
              loan_app_id: req.body.loan_app_id,
              kyc_type: dldata.api_name,
              req_url: dldata.reqdata,
              res_url: dldata.resdata,
              consent: req.body.consent,
              consent_timestamp: req.body.consent_timestamp,
              id_number: req.body.dl_no,
              created_at: Date.now(),
              created_by: req.company.code,
            };
            const addkycdata = await kycdata.addNew(ekycInsertData);
            if (!addkycdata) throw {
              message: "Error while adding ekyc data",
              success: false,
            };
            //insert response data s3 upload response to database
            const serviceBureau = await bureau.addNew(dldata);
            if (!serviceBureau)
              throw {
                message: "Error while adding response data to database",
              };
            // //send final response
            if (dldata.api_response_status == "SUCCESS") {
              return res.send({
                kyc_id: serviceBureau.kyc_id,
                data: requestResp.data,
                success: true,
              });
            } else {
              return res.send({
                kyc_id: serviceBureau.kyc_id,
                data: requestResp.data,
                success: false,
              });
            }
          })
          .catch((error) => {
            //handle error catched from karza api
            res.status(500).send({
              requestId : `${req.company.code}-DL-${Date.now()}`,
              message: "Please contact the administrator",
              status: "fail",
            });
          });
      } catch (error) {
        res.status(500).send({
          requestId : `${req.company.code}-DL-${Date.now()}`,
          message: "Please contact the administrator",
          status: "fail",
        });
      }
    }
  );
};