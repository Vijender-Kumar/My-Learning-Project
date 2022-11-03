const bodyParser = require("body-parser");
const s3helper = require("../util/s3helper.js");
const helper = require("../util/helper.js");
const validate = require("../util/validate-req-body.js");
var bureauService = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const axios = require("axios");
const kycdata = require("../models/kyc-data-schema.js");
const AccessLog = require("../util/accessLog");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");

module.exports = (app, connection) => {

  app.use(bodyParser.json());
  app.post(
    "/api/kz_pan_kyc",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabledCached(process.env.SERVICE_PAN_KYC_ID),
      AccessLog.maintainAccessLog,
      verifyloanAppIdValidation,
    ],
    async (req, res) => {
      try {
        const data = req.body;
        //s3 url
        const s3url = req.service.file_s3_path;
        //fetch template from s3
        const jsonS3Response = await s3helper.fetchJsonFromS3(
          s3url.substring(s3url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          message: "Error while finding template from s3"
        };
        //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(jsonS3Response, [
          data,
        ]);

        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!resValDataTemp)
          throw {
            message: "No records found",
          };
        if (resValDataTemp.unknownColumns.length)
          throw {
            message: resValDataTemp.unknownColumns[0],
          };
        if (resValDataTemp.missingColumns.length)
          throw {
            message: resValDataTemp.missingColumns[0],
          };
        if (resValDataTemp.errorRows.length)
          throw {
            message: Object.values(resValDataTemp.exactErrorColumns[0])[0],
          };
        //Karza data
        const karzaData = {
          pan: req.body.pan,
          consent: req.body.consent,
        };
        //Karza url
        const url = process.env.KARZA_URL + "v2/pan";
        //X-karza-key
        const key = process.env.KARZA_API_KEY;
        //Headers
        const config = {
          headers: {
            "x-karza-key": key,
            "Content-Type": "application/json",
          },
        };
        var pandata = {
          company_id: req.company._id,
          company_code: req.company.code,
          vendor_name: "KARZA",
          service_id: process.env.SERVICE_PAN_KYC_ID,
          api_name: "PAN-KYC",
          loan_app_id: req.body.loan_app_id,
          timestamp: Date.now(),
          pan_card: req.body.pan,
          is_cached_response: false,
          consent: req.body.consent,
          consent_timestamp: req.body.consent_timestamp,
          raw_data: "",
          response_type: "",
          request_type: "",
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
        };

        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${pandata.api_name}/${pandata.vendor_name}/${pandata.company_id}/${filename}/${pandata.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (pandata.document_uploaded_s3 = 0), (pandata.response_type = "error");
        } else {
          pandata.document_uploaded_s3 = 1;
          pandata.response_type = "success";
        }
        pandata.api_response_status = "SUCCESS";
        pandata.raw_data = uploadResponse.Location;
        pandata.reqdata = uploadResponse.Location;
        pandata.request_type = "request";

        if (req.body.consent === "N") {
          pandata.response_type = "error";
          pandata.api_response_status = "FAIL";
        }
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(pandata);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        if (req.body.consent === "N") {
          return res
            .status(400)
            .send({
              request_id: req.company.code + "-PAN-KYC-" + Date.now(),
              message: "Consent was not provided",
            });
        };

        // Caching mechanism for getting request data from server.
        var cachedKyc = await kycdata.findIfExists(req.body.loan_app_id, req.body.pan, "PAN-KYC");
        if (cachedKyc[0]) {
          var cachedUrl = cachedKyc[0].res_url;
          const xmlS3Response = await s3helper.fetchJsonFromS3(
            cachedUrl.substring(cachedUrl.indexOf(cachedKyc[0].kyc_type))
          );
          pandata.request_type = 'response';
          pandata.raw_data = cachedUrl;
          pandata.is_cached_response = 'TRUE';
          pandata.kyc_id = `${req.company.code}-PAN-KYC-${Date.now()}`
          //insert request data s3 upload response to database
          const pandataSerResp = await bureauService.addNew(pandata);

          return res.send({
            kyc_id: pandataSerResp.kyc_id,
            data: xmlS3Response,
            success: true
          });
        }
        //call karza api after successfully uploading request data to s3
        axios
          .post(url, JSON.stringify(karzaData), config)
          .then(async (response) => {
            //response data from karza to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            //upload response data from karza on s3
            const resKey = `${pandata.api_name}/${pandata.vendor_name}/${pandata.company_id}/${filename}/${pandata.timestamp}.txt`;
            const uploadResponse = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadResponse) {
              (pandata.document_uploaded_s3 = 0),
                (pandata.response_type = "error");
            }
            pandata.document_uploaded_s3 = 1;
            pandata.response_type = "success";
            pandata.raw_data = uploadResponse.Location;
            pandata.resdata = uploadResponse.Location;
            pandata.request_type = "response";
            if (response.data["status-code"] == 101) {
              (pandata.api_response_status = "SUCCESS"),
                (pandata.kyc_id = `${req.company.code}-PAN-KYC-${Date.now()}`);
            } else {
              pandata.api_response_status = "FAIL";
            }
            //insert call ekyc check
            const data = {
              company_id: req.company._id,
              loan_app_id: req.body.loan_app_id,
              kyc_type: pandata.api_name,
              req_url: pandata.reqdata,
              res_url: pandata.resdata,
              consent: req.body.consent,
              consent_timestamp: req.body.consent_timestamp,
              id_number: req.body.pan,
              created_at: Date.now(),
              created_by: req.company.code,
            };
            const addEkycRes = await kycdata.addNew(data);
            if (!addEkycRes) throw res.send({
              message: "Error while adding ekyc data"
            });

            //insert response data s3 upload response to database
            const panDataResp = await bureauService.addNew(pandata);
            if (!panDataResp) throw {
              message: "Error while adding response data to database"
            };
            // //send final response
            if (pandata.api_response_status == "SUCCESS") {
              return res.send({
                kyc_id: panDataResp.kyc_id,
                data: response.data,
                success: true,
              });
            } else {
              return res.send({
                kyc_id: panDataResp.kyc_id,
                data: response.data,
                success: false,
              });
            }
          })
          .catch((error) => {
            //handle error catched from karza api
            res.status(500).send({
              requestId: `${req.company.code}-PAN-KYC-${Date.now()}`,
              message: "Please contact the administrator",
              status: "fail",
            });
          });
      } catch (error) {
        res.status(500).send({
          requestId: `${req.company.code}-PAN-KYC-${Date.now()}`,
          message: "Please contact the administrator",
          status: "fail",
        });
      }
    }
  );
};