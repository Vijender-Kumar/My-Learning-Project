const bodyParser = require("body-parser");
const helper = require("../util/s3helper.js");
const bureaurReqResLogSchema = require("../models/service-req-res-log-schema");
const moment = require("moment");
const jwt = require("../util/jwt");
const axios = require('axios');
const services = require("../util/service");
const AccessLog = require("../util/accessLog");
const bureau_data = require("../models/bureau-data-schema");
const validate = require("../util/validate-req-body.js");
const CrifData = require("../models/crif-soft-pull-schema");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");

module.exports = (app, connection) => {
  app.use(bodyParser.json());

  app.post('/api/crif-soft-pull',
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany, services.isServiceEnabled(process.env.SERVICE_CRIF_SOFT_PULL_ID), AccessLog.maintainAccessLog, verifyloanAppIdValidation],
    async (req, res) => {
      const requestID = `${req.company.code}-CRIF-SOFT-PULL-${Date.now()}`;

      try {
        const data = req.body;
        const s3url = req.service.file_s3_path;

        //fetch template from s3
        const jsonS3Response = await helper.fetchJsonFromS3(
          s3url.substring(s3url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          errorType: 21,
          message: "Error while finding template from s3"
        };

        //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(jsonS3Response, [data]);

        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter((x) => x.field != "sub_company_code");
        }

        if (!resValDataTemp) throw {
          errorType: 21,
          message: "No records found"
        };
        if (resValDataTemp.unknownColumns.length) throw {
          errorType: 21,
          message: resValDataTemp.unknownColumns[0]
        };
        if (resValDataTemp.missingColumns.length) throw {
          errorType: 21,
          message: resValDataTemp.missingColumns[0]
        };
        if (resValDataTemp.errorRows.length) throw {
          errorType: 21,
          message: Object.values(resValDataTemp.exactErrorColumns[0])[0]
        };

        //----------------- Request logging in MongoDatabase and S3 bucket --------------------------//      

        const accesscode = `${process.env.CRIF_SOFT_PULL_USERNAME}|${process.env.CRIF_SOFT_PULL_MERCHANT_ID}|${process.env.CRIF_SOFT_PULL_PRODUCT_ID}|${process.env.CRIF_SOFT_PULL_PASSWORD}|${moment().utcOffset("+05:30").format('DD-MM-YYYY HH:mm:ss')}`
        console.log(moment().utcOffset("+05:30").format('DD-MM-YYYY HH:mm:ss'),"this is necessary time logging");
        var bufferedBase64 = Buffer.from(`${accesscode}`);
        var pureBase64 = bufferedBase64.toString('base64');
        const validDate = req.body.dob.split("-").reverse().join("-");
        const dates = moment().format("YYYY-MM-DD HH:mm:ss");
        const company_id = req.company?._id ? req.company?._id : 0;
        const company_code = req.company?.code ? req.company?.code : "Sample";

        const postData = `${data.first_name}|${data.middle_name}|${data.last_name}|${data.gender}|${validDate}||${data.marital_status}|${data.appl_phone}|||${data.email_id}||${data.appl_pan}|${data.dl}|${data.voter_id}|${data.passport}|||||${data.father_name}|${data.spouse_name}|${data.mother_name}|${data.per_addr_ln1}|${data.per_city}|${data.per_city}|${data.per_state}|${data.per_pincode}|${data.country}|||||||${process.env.CRIF_SOFT_PULL_MERCHANT_ID}|${process.env.CRIF_SOFT_PULL_PRODUCT_ID}|${data.consent}`;
        const url = `${process.env.CRIF_SOFT_PULL_STAGE1_URL}`;
        const postDataJson = {
          downstreamRequest: postData
        }

        const objData = {
          company_id: company_id,
          company_code: company_code,
          request_id: company_code + "-CRIF-SOFT-PULL-" + Date.now(),
          api_name: `CRIF-SOFT-PULL`,
          loan_app_id: req.body.loan_app_id,
          service_id: process.env.SERVICE_CRIF_SOFT_PULL_ID ? process.env.SERVICE_CRIF_SOFT_PULL_ID : "0",
          response_type: "success",
          request_type: "request",
          timestamp: dates,
          pan_card: req.body.appl_pan ? req.body.appl_pan : "Sample",
          document_uploaded_s3: "1",
          is_cached_response: "FALSE",
          api_response_type: "JSON",
          api_response_status: 'SUCCESS',
          consent: req.body.consent,
          consent_timestamp: req.body.consent_timestamp,
        };

        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `CRIF-SOFT-PULL/${company_id}/${filename}/${Date.now()}.txt`;
        const requestBody = { ...postDataJson, ...data };
        const uploadResponse = await helper.uploadFileToS3(requestBody, reqKey);

        if (!uploadResponse) {
          (objData.document_uploaded_s3 = 0), (objData.response_type = "error");
        }
        objData.raw_data = uploadResponse.Location;
        //insert request data s3 upload response to database

        // -------------- Consent provided is NO ---------------------------------------------//         
        if (req.body.consent === "N") {
            objData.request_type = 'request';
            objData.raw_data = uploadResponse.Location;
            objData.response_type = "error";
            objData.api_response_status = "fail";
          const addResult = await bureaurReqResLogSchema.addNew(objData);
          throw {
            errorType: 21,
            request_id: requestID,
            message: "Consent was not provided",
          };

        }
        else {
          const addResult = await bureaurReqResLogSchema.addNew(objData);
          if (!addResult) throw {
            message: "Error while adding request data"
          };
        }

        //-----------------------Cache Implementation-------------------------------------//
        // Caching mechanism for getting request data from server.
        var cachedBureau = await bureau_data.findCachedBureauGeneric(req.body.loan_app_id, req.body.appl_pan, "CRIF-SOFT-PULL");
        if (cachedBureau[0]) {
          var cachedUrl = cachedBureau[0].res_url;
          const jsonS3Response = await helper.fetchJsonFromS3(
            cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
          );

          objData.request_type = 'response';
          objData.api_name = 'CRIF-SOFT-PULL-STAGE3';
          objData.raw_data = cachedUrl;
          objData.is_cached_response = 'TRUE';
          //insert request data s3 upload response to database
          const cachedBureuResp = await bureaurReqResLogSchema.addNew(objData);

          return res.status(200).send({
            request_id: requestID,
            data: jsonS3Response
          });
        }

        // --------------------- Invoke CRIF STAGE 1 API --------------------//

        var crifDataDetails = await CrifData.findLoanIdData(req.body.loan_app_id);
        if (!crifDataDetails[0]) {
          const apiResponse = await axios.request({
            url: url,
            method: "POST",
            headers: {
              orderid: req.body.loan_app_id,
              'Accept': 'text/plain',
              'Content-Type': 'text/plain',
              accesscode: pureBase64,
              appid: `${process.env.CRIF_SOFT_PULL_APP_ID}`,
              merchantid: `${process.env.CRIF_SOFT_PULL_MERCHANT_ID}`,
            },
            data: postData,
          });

          //---------------------------- Service logging for stage 1---------------------------//

          let filename1 = Math.floor(10000 + Math.random() * 99999) + "_res";
          objData.api_name = `CRIF-SOFT-PULL-STAGE1`;
          const resKey1 = `CRIF-SOFT-PULL/${company_id}/STAGE1/${filename1}/${Date.now()}.txt`;
          //upload request data on s3
          const bureaurLogSchemaResponse1 = await helper.uploadFileToS3(apiResponse.data, resKey1);
          objData.request_type = 'response';
          objData.raw_data = bureaurLogSchemaResponse1.Location;
          objData.response_type = "error";
          objData.api_response_status = "SUCCESS";
          //insert request data s3 upload response to database
          const addResult2 = await bureaurReqResLogSchema.addNew(objData);

          //----------------------------------------------------------------------------------------
          const crifRequestData = {
            company_id: company_id,
            report_id: apiResponse.data.reportId,
            loan_app_id: req.body.loan_app_id,
            request_id: requestID,
            appl_pan: req.body.appl_pan,
            status: "SUCCESS",
            consent: req.body.consent,
            consent_timestamp: req.body.consent_timestamp,
            created_at: Date.now(),
          };
          if (apiResponse.data.status === "S06") {
            crifDataDetails = await CrifData.addNew(crifRequestData);
          }
          const response1 = apiResponse.data;
          // Status S06 means either quentionnarie case triggered or report will generate directly from stage 3.
          if (response1.status !== "S06") {
            return res.send({
              request_id: requestID,
              msg: "user not authenticated",
            });
          }
        }

        // --------------------- Invoke CRIF STAGE 2 API --------------------//

        crifDataDetails = await CrifData.findLoanIdData(req.body.loan_app_id);
        if (crifDataDetails[0]) {
          const apiResponse2 = await axios.request({
            url: `${process.env.CRIF_SOFT_PULL_STAGE2_URL}`,
            method: "POST",
            headers: {
              orderid: req.body.loan_app_id,
              requestType: "Authorization",
              'Accept': 'text/plain',
              'Content-Type': 'text/plain',
              accesscode: pureBase64,
              appid: `${process.env.CRIF_SOFT_PULL_APP_ID}`,
              merchantid: `${process.env.CRIF_SOFT_PULL_MERCHANT_ID}`,
              reportid: crifDataDetails[0]?.report_id
            },
            data: `${req.body.loan_app_id}|${crifDataDetails[0]?.report_id}|${pureBase64}|${process.env.CRIF_REDIRECT_URL}|${process.env.CRIF_SOFT_PULL_PAYMENT_FLAG}|${process.env.CRIF_SOFT_PULL_ALERT_FLAG}|${process.env.CRIF_SOFT_PULL_REPORT_FLAG}|${req.body?.user_ans}`,
          });

          //---------------------------- Service logging for Stage 2---------------------------//

          let filename2 = Math.floor(10000 + Math.random() * 99999) + "_res";
          objData.api_name = `CRIF-SOFT-PULL-STAGE2`;
          const resKey2 = `CRIF-SOFT-PULL/${company_id}/STAGE2/${filename2}/${Date.now()}.txt`;
          //upload request data on s3
          const bureaurLogSchemaResponse2 = await helper.uploadFileToS3(apiResponse2.data, resKey2);
          objData.request_type = 'response';
          objData.response_type = "error";
          objData.raw_data = bureaurLogSchemaResponse2.Location;
          objData.api_response_status = "SUCCESS";
          //insert request data s3 upload response to database
          const addResult2 = await bureaurReqResLogSchema.addNew(objData);

          //-------------------------------------------------------------------------------//
          if (apiResponse2.data.status === "S11") {
            return res.status(200).send({
              request_id: requestID,
              data: apiResponse2.data
            });
          }
          if (apiResponse2.data.status === "S02") {
            return res.status(400).send({
              request_id: requestID,
              data: apiResponse2.data
            });
          }

          // --------------------- Invoke CRIF STAGE 3 API --------------------//
          const apiResponse3 = await axios.request({
            url: `${process.env.CRIF_SOFT_PULL_STAGE3_URL}`,
            method: "POST",
            headers: {
              orderid: req.body.loan_app_id,
              'Accept': 'text/plain',
              'Content-Type': 'text/plain',
              accesscode: pureBase64,
              appid: `${process.env.CRIF_SOFT_PULL_APP_ID}`,
              merchantid: `${process.env.CRIF_SOFT_PULL_MERCHANT_ID}`,
              reportid: crifDataDetails[0]?.report_id
            },
            data: `${req.body.loan_app_id}|${crifDataDetails[0]?.report_id}|${pureBase64}|${process.env.CRIF_REDIRECT_URL}|${process.env.CRIF_SOFT_PULL_PAYMENT_FLAG}|${process.env.CRIF_SOFT_PULL_ALERT_FLAG}|${process.env.CRIF_SOFT_PULL_REPORT_FLAG}|Y`,
          });
          //---------------------------- Service logging for stage 3 ---------------------------//

          let filename3 = Math.floor(10000 + Math.random() * 99999) + "_res";
          objData.api_name = `CRIF-SOFT-PULL-STAGE3`;
          const resKey3 = `CRIF-SOFT-PULL/${company_id}/STAGE3/${filename3}/${Date.now()}.txt`;
          //upload request data on s3
          const bureaurLogSchemaResponse3 = await helper.uploadFileToS3(apiResponse3.data, resKey3);
          objData.request_type = 'response';
          objData.response_type = "success";
          objData.raw_data = bureaurLogSchemaResponse3.Location;
          objData.api_response_status = "SUCCESS";
          //insert request data s3 upload response to database
          const addResult = await bureaurReqResLogSchema.addNew(objData);

          //---------------------------- Burea logging after successfull response----------  //
          var req_data = {
            company_id: company_id,
            loan_app_id: req.body.loan_app_id,
            bureau_type: "CRIF-SOFT-PULL",
            req_url: uploadResponse.Location,
            request_id: requestID,
            res_url: bureaurLogSchemaResponse3.Location,
            pan: data.appl_pan,
            status: "SUCCESS",
            consent: data.consent,
            consent_timestamp: data.consent_timestamp,
            created_by: company_code,
            created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
          };
          var serviceRes = await bureau_data.addNew(req_data);

          return res.status(200).send(
            {
              request_id: requestID,
              data: apiResponse3.data,
            });
        }
      } catch (error) {
        let filename3 = Math.floor(10000 + Math.random() * 99999) + "_res";
          const resKey4 = `CRIF-SOFT-PULL/${req.company?._id}/ERROR/${filename3}/${Date.now()}.txt`;
          //upload request data on s3
          const bureaurLogSchemaResponse3 = await helper.uploadFileToS3(error, resKey4);
          const objData = {
            company_id: req.company?._id,
            company_code: req.company?.code,
            request_id: req.company?.code + "-CRIF-SOFT-PULL-" + Date.now(),
            api_name: `CRIF-SOFT-PULL`,
            loan_app_id: req.body.loan_app_id,
            service_id: process.env.SERVICE_CRIF_SOFT_PULL_ID ? process.env.SERVICE_CRIF_SOFT_PULL_ID : "0",
            request_type : 'response',
            response_type : "error",
            timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
            pan_card: req.body.appl_pan ? req.body.appl_pan : "Sample",
            document_uploaded_s3: "1",
            is_cached_response: "FALSE",
            api_response_type: "JSON",
            api_response_status : "FAIL",
            consent: req.body.consent,
            consent_timestamp: req.body.consent_timestamp,
          };
          
          objData.raw_data = bureaurLogSchemaResponse3.Location;
          //insert request data s3 upload response to database
          const addResult = await bureaurReqResLogSchema.addNew(objData);
        if (error.errorType)
          return res.status(400).send({
            requestID: requestID,
            status: "fail",
            message: error.message,
          });
        return res.status(400).send({
          requestID: requestID,
          status: "fail",
          message: "Please contact the administrator",
        });
      }
    }
  );
};