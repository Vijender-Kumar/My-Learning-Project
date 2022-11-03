const bodyParser = require("body-parser");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
var bureauService = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const axios = require("axios");
const kycdata = require("../models/kyc-data-schema.js");
const AccessLog = require("../util/accessLog");
const {
  verifyloanAppIdValidation,
} = require("../util/loan-app-id-validation.js");

module.exports = (app, connection) => {
  app.use(bodyParser.json());
  app.post(
    "/api/kz-aadhaar-xml-otp",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabledCached(
        process.env.SERVICE_KZ_AADHAAR_XML_OTP_ID
      ),
      AccessLog.maintainAccessLog,
      verifyloanAppIdValidation,
    ],
    async (req, res, next) => {
      try {
        await validateInput(req);

        //Karza data
        const karzaData = {
          aadhaarNo: req.body.aadhaar_no,
          consent: req.body.consent,
        };
        req.body.aadhaar_no = req.body.aadhaar_no.replace(/\d(?=\d{4})/g, "*");
        //Karza url
        const url = process.env.KARZA_URL + "v3/aadhaar-xml/otp";
        //X-karza-key
        const key = process.env.KARZA_API_KEY;
        //Headers
        const config = {
          headers: {
            "x-karza-key": key,
            "Content-Type": "application/json",
          },
        };

        const apiName = "AADHAAR-XML-OTP";
        const serviceid = process.env.SERVICE_KZ_AADHAAR_XML_OTP_ID;

        await invokeAPIAndSendResponse(
          req,
          serviceid,
          apiName,
          url,
          karzaData,
          config,
          res
        );
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  app.post(
    "/api/kz-aadhaar-xml-file",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabledCached(
        process.env.SERVICE_KZ_AADHAAR_XML_FILE_ID
      ),
      AccessLog.maintainAccessLog,
      verifyloanAppIdValidation,
    ],
    async (req, res, next) => {
      try {
        await validateInput(req);

        //Karza data
        const karzaData = {
          requestId: req.body.request_id,
          otp: req.body.otp,
          consent: req.body.consent,
        };
        //Karza url
        const url = process.env.KARZA_URL + "v3/aadhaar-xml/file";
        //X-karza-key
        const key = process.env.KARZA_API_KEY;
        //Headers
        const config = {
          headers: {
            "x-karza-key": key,
            "Content-Type": "application/json",
          },
        };

        const apiName = "AADHAAR-XML-FILE";
        const serviceid = process.env.SERVICE_KZ_AADHAAR_XML_FILE_ID;

        await invokeAPIAndSendResponse(
          req,
          serviceid,
          apiName,
          url,
          karzaData,
          config,
          res
        );
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );
};

async function invokeAPIAndSendResponse(
  req,
  serviceId,
  apiName,
  url,
  karzaData,
  config,
  res
) {
  const requestID = `${req.company.code}-AADHAR-${Date.now()}`;
  var logData = {
    company_id: req.company._id,
    company_code: req.company.code,
    vendor_name: "KARZA",
    service_id: serviceId,
    api_name: apiName,
    timestamp: Date.now(),
    consent: req.body.consent,
    consent_timestamp: req.body.consent_timestamp,
    loan_app_id: req.body.loan_app_id,
    id_number: req.body.aadhaar_no,
    raw_data: "",
    response_type: "",
    request_type: "",
    document_uploaded_s3: "",
    api_response_type: "JSON",
    api_response_status: "",
    request_id: requestID,
  };

  let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
  const reqKey = `${logData.api_name}/${logData.vendor_name}/${logData.company_id}/${filename}/${logData.timestamp}.txt`;
  //upload request data on s3
  const uploadResponse = await s3helper.uploadFileToS3(
    // aadhaarData.company_id,
    req.body,
    reqKey
  );
  if (!uploadResponse) {
    logData.document_uploaded_s3 = 0;
    logData.response_type = "error";
  } else {
    logData.document_uploaded_s3 = 1;
    logData.response_type = "success";
  }
  logData.api_response_status = "SUCCESS";
  logData.raw_data = uploadResponse.Location;
  logData.reqdata = uploadResponse.Location;
  logData.request_type = "request";
  if (req.body.consent === "N") {
    logData.response_type = "error";
    logData.api_response_status = "FAIL";
  }

  //insert request data s3 upload response to database
  const addResult = await bureauService.addNew(logData);
  if (!addResult)
    throw {
      message: "Error while adding request data",
    };
  if (req.body.consent === "N") {
    return res.status(400).send({
      request_id: req.company.code + "-" + apiName + "-" + Date.now(),
      message: "Consent was not provided",
    });
  }

  //call karza api after successfully uploading request data to s3
  axios
    .post(url, JSON.stringify(karzaData), config)
    .then(async (response) => {
      //response data from karza to upload on s3
      filename = Math.floor(10000 + Math.random() * 99999) + "_res";
      const resKey = `${logData.api_name}/${logData.vendor_name}/${logData.company_id}/${filename}/${logData.timestamp}.txt`;
      //upload response data from karza on s3
      const uploadS3FileRes = await s3helper.uploadFileToS3(
        response.data,
        resKey
      );
      if (!uploadS3FileRes) {
        (logData.document_uploaded_s3 = 0), (logData.response_type = "error");
      }
      logData.document_uploaded_s3 = 1;
      logData.response_type = "success";
      logData.raw_data = await uploadS3FileRes.Location;
      logData.resdata = uploadS3FileRes.Location;
      logData.request_type = "response";
      if (response.data["statusCode"] == 101) {
        (logData.api_response_status = "SUCCESS"),
          (logData.kyc_id = `${req.company.code}-${apiName}-${Date.now()}`);
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
        consent: req.body.consent,
        consent_timestamp: req.body.consent_timestamp,
        id_number: req.body.aadhaar_no,
        created_at: Date.now(),
        created_by: req.company.code,
      };
      const addEkycRes = await kycdata.addNew(data);
      if (!addEkycRes)
        throw res.send({
          message: "Error while adding ekyc data",
        });
      //insert response data s3 upload response to database
      const aadhaarDataResp = await bureauService.addNew(logData);
      if (!aadhaarDataResp)
        throw {
          message: "Error while adding response data to database",
        };
      // //send final response
      if (logData.api_response_status == "SUCCESS") {
        return res.send({
          kyc_id: aadhaarDataResp.kyc_id,
          data: response.data,
          success: true,
        });
      } else {
        return res.send({
          kyc_id: aadhaarDataResp.kyc_id,
          data: response.data,
          success: false,
        });
      }
    })
    .catch((error) => {
      //handle error catched from karza api
      res.status(500).send({
        requestId : requestID,
        message: "Please contact the administrator",
        status: "fail",
      });
    });
}

async function validateInput(req) {
  const data = req.body;
  //s3 url
  const s3url = req.service.file_s3_path;
  //fetch template from s3
  const jsonS3Response = await s3helper.fetchJsonFromS3(
    s3url.substring(s3url.indexOf("services"))
  );
  if (!jsonS3Response)
    throw {
      message: "Error while finding template from s3",
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
}
