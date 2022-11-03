const bodyParser = require("body-parser");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
var bureauService = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const axios = require("axios");

module.exports = (app, connection) => {
  app.use(bodyParser.json());

  app.post(
    "/api/kz-address",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_ADDRESS_MATCH_ID
      ),
    ],
    async (req, res, next) => {
      const apiName = "KZ-ADDRESS";
      const requestId = `${req.company.code}-${apiName}-${Date.now()}`;
      try {
        var address1;
        var address2;
        if(req.body.input_address){
            address1 = req.body.input_address;
        } else {
            if(req.body.input_add_ln1){
                address1 = req.body.input_add_ln1;
            } else {
                throw {
                    message: "Please enter address line 1",
                    success: false
                };
            }
            if(req.body.input_add_ln2){
                address1 = address1 + req.body.input_add_ln2;
            }
            if(req.body.input_city){
                address1 = address1 + req.body.input_city;
            } else {
                throw {
                    message: "Please enter city",
                    success: false
                };
            }
            if(req.body.input_state){
                address1 = address1 + req.body.input_state;
            } else {
                throw {
                    message: "Please enter state",
                    success: false
                };
            }
            if(req.body.input_pin){
                address1 = address1 + req.body.input_pin;
            } else {
                throw {
                    message: "Please enter pincode",
                    success: false
                };
            }
        }

        if(req.body.kyc_address){
            address2 = req.body.kyc_address;
        } else {
            if(req.body.kyc_add_ln1){
                address2 = req.body.kyc_add_ln1;
            } else {
                throw {
                    message: "Please enter kyc address line 1",
                    success: false
                };
            }
            if(req.body.kyc_add_ln2){
                address2 = address2 + req.body.kyc_add_ln2;
            }
            if(req.body.kyc_city){
                address2 = address2 + req.body.kyc_city;
            } else {
                throw {
                    message: "Please enter kyc city",
                    success: false
                };
            }
            if(req.body.kyc_state){
                address2 = address2 + req.body.kyc_state;
            } else {
                throw {
                    message: "Please enter kyc state",
                    success: false
                };
            }
            if(req.body.kyc_pin){
                address2 = address2 + req.body.kyc_pin;
            } else {
                throw {
                    message: "Please enter kyc pincode",
                    success: false
                };
            }
        }
        //fetch template from s3
        const s3url = req.service.file_s3_path;
        //fetch customized template from s3url
        const jsonS3Response = await s3helper.fetchJsonFromS3(
          s3url.substring(s3url.indexOf("services"))
        );
        if (!jsonS3Response)
          throw {
            message: "Error while finding template from s3",
            success: false
          };

        //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(
          jsonS3Response,
          [req.body]
        );
        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!resValDataTemp) throw {
          message: "No records found",
          success: false
        };
        if (resValDataTemp.unknownColumns.length)
          throw {
            message: resValDataTemp.unknownColumns[0],
            success: false
          };
        if (resValDataTemp.missingColumns.length)
          throw {
            message: resValDataTemp.missingColumns[0],
            success: false
          };
        if (resValDataTemp.errorRows.length)
          throw {
            message: Object.values(resValDataTemp.exactErrorColumns[0])[0],
            success: false
          };
        //Headers
        const url = process.env.KARZA_URL + "v2/address";
        //X-karza-key
        const key = process.env.KARZA_API_KEY;
        const config = {
          headers: {
            "Content-Type": "application/json",
            "x-karza-key": key,
          },
        };
        var karzaAddressApiData = {
            address1: address1,
            address2: address2
        };
        var karzaAddressData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "KARZA",
          service_id: process.env.SERVICE_ADDRESS_MATCH_ID,
          api_name: "KZ-ADDRESS",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          request_id: requestId,
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${karzaAddressData.api_name}/${karzaAddressData.vendor_name}/${karzaAddressData.company_id}/${filename}/${karzaAddressData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (karzaAddressData.document_uploaded_s3 = 0),
          (karzaAddressData.response_type = "error");
        }
        karzaAddressData.document_uploaded_s3 = 1;
        karzaAddressData.response_type = "success";
        karzaAddressData.api_response_status = "SUCCESS";
        karzaAddressData.raw_data = uploadResponse.Location;
        karzaAddressData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(karzaAddressData);
        if (!addResult) throw {
          message: "Error while adding request data",
          success: false
        };
        //call karza address api after successfully uploading request data to s3
        axios
          .post(url, JSON.stringify(karzaAddressApiData), config)
          .then(async (response) => {
            //response data from karza address to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${karzaAddressData.api_name}/${karzaAddressData.vendor_name}/${karzaAddressData.company_id}/${filename}/${karzaAddressData.timestamp}.txt`;
            //upload response data from karza address create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (karzaAddressData.document_uploaded_s3 = 0),
              (karzaAddressData.response_type = "error");
            } else {
                karzaAddressData.document_uploaded_s3 = 1;
                karzaAddressData.response_type = "success";
            }
            karzaAddressData.raw_data = await uploadS3FileRes.Location;
            karzaAddressData.request_type = "response";
            if (response.data["status-code"] == 101) {
                karzaAddressData.api_response_status = "SUCCESS";
            } else {
                karzaAddressData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const karzaAddressDataResp = await bureauService.addNew(
                karzaAddressData
            );
            if (!karzaAddressDataResp)
              throw {
                message: "Error while adding response data to database",
                success: false
              };
            if (karzaAddressData.api_response_status == "SUCCESS") {
              return res.status(200).send({
                requestID: requestId,
                success: true,
                data: response.data,
              });
            }
          })
          .catch((error) => {
            if (error.response) {
              if (error.response.data){
                return res.status(422).send({
                  requestID: requestId,
                  success: false,
                  message: "Something went wrong!!! Contact Admin!",
                });
              } else {
                return res.status(422).send({
                  requestID: requestId,
                  success: false,
                  message: "Something went wrong!!! Contact Admin!",
                });
              }
            }else {
              return res.status(422).send({
                requestID: requestId,
                success: false,
                message: "Something went wrong!!! Contact Admin!",
              });
            };
          });
      } catch (error) {
        return res.status(400).send({
          requestID: requestId,
          data: error,
        });
      }
    }
  );
};