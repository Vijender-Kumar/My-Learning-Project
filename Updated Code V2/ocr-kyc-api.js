const bodyParser = require("body-parser");
const axios = require("axios");
const ServiceReqResLog = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const AccessLog = require("../util/accessLog");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
const { logErrorToS3 } = require("../utils/error-logger.js");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");

const TAG = "kyc-ocr-api";

const localLogTemplate = {
  company_id: "",
  company_code: "",
  sub_company_code: "",
  vendor_name: "KARZA",
  service_id: 0,
  api_name: "",
  request_id: "",
  raw_data: "",
  request_type: "",
  response_type: "",
  timestamp: 0,
  document_uploaded_s3: "",
  api_response_type: "JSON",
  api_response_status: "",
};

async function verifyRequestWithTemplate(templateS3url, s3LogData) {
  // 2. fetch upload template from s3
  const templateResponse = await s3helper.fetchJsonFromS3(
    templateS3url.substring(templateS3url.indexOf("services"))
  );
  if (!templateResponse)
    throw {
      message: "Error while finding template from s3",
    };

  // 3. validate the incoming template data with customized template data
  const templateValidation = validate.validateDataWithTemplate(
    templateResponse,
    [s3LogData]
  );

  if (templateValidation.missingColumns.length) {
    templateValidation.missingColumns =
      templateValidation.missingColumns.filter(
        (x) => x.field != "sub_company_code"
      );
  }
  if (!templateValidation)
    throw {
      errorType: 999,
      message: "No records found",
    };
  if (templateValidation.unknownColumns.length)
    throw {
      errorType: 999,
      message: templateValidation.unknownColumns[0],
    };
  if (templateValidation.missingColumns.length)
    throw {
      errorType: 999,
      message: templateValidation.missingColumns[0],
    };
  if (templateValidation.errorRows.length)
    throw {
      errorType: 999,
      message: Object.values(templateValidation.exactErrorColumns[0])[0],
    };
  return true;
}

function initLocalLogData(req, optionals = {}) {
  let localLogData = {
    ...localLogTemplate,
  };

  localLogData.company_id = req.company._id;
  localLogData.company_code = req.company.code;
  localLogData.sub_company_code = req.headers.company_code;
  localLogData.timestamp = Date.now();

  localLogData = {
    ...localLogData,
    ...optionals,
  };

  return localLogData;
}

async function createS3Log(
  s3LogData,
  apiName,
  vendorName,
  companyId,
  timestamp,
  isRequest
) {
  try {
    // save s3LogData into s3
    let filename =
      Math.floor(10000 + Math.random() * 99999) + (isRequest ? "_req" : "_res");
    const uploadResponse = await s3helper.uploadFileToS3(
      s3LogData,
      `${apiName}/${vendorName}/${companyId}/${filename}/${timestamp}.txt`
    );
    return uploadResponse;
  } catch (error) {
    throw error;
  }
}

async function createLocalLog(s3LogResponse, localLogData, isRequest) {
  // update localLogData according to the s3 response
  localLogData.request_type = isRequest ? "request" : "response";
  if (s3LogResponse) {
    localLogData.document_uploaded_s3 = 1;
    localLogData.response_type = "success";
    localLogData.api_response_status = "SUCCESS";
    localLogData.raw_data = s3LogResponse.Location;
  } else {
    localLogData.document_uploaded_s3 = 0;
    localLogData.response_type = "error";
  }

  // create local log of the s3 logging
  const insertResult = await ServiceReqResLog.addNew(localLogData);
  if (!insertResult) throw { message: "Error while adding service log data" };

  // return updated logData
  return localLogData;
}

async function createLog(s3LogData, localLogData, isRequestLog) {
  try {
    // save log file into s3
    const s3LogResponse = await createS3Log(
      s3LogData,
      localLogData.api_name,
      localLogData.vendor_name,
      localLogData.company_id,
      localLogData.timestamp,
      isRequestLog
    );

    // save local log into mongo
    const logData = await createLocalLog(
      s3LogResponse,
      localLogData,
      isRequestLog
    );

    return { ...logData };
  } catch (error) {
    throw error;
  }
}

module.exports = (app) => {
  app.use(bodyParser.json());

  // api for kyc-ocr verification
  app.post(
    "/api/kyc-ocr",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabled(process.env.SERVICE_OCR_KYC_VERIFY_ID),
      verifyloanAppIdValidation,
      AccessLog.maintainAccessLog,
    ],
    async (req, res) => {
      const apiName = "KYC-OCR";
      const requestId = `${req.company.code}-${apiName}-${Date.now()}`;

      try {
        // validate api-request with service template
        const isValidated = await verifyRequestWithTemplate(
          req.service.file_s3_path,
          req.body
        );
        if (!isValidated) {
          return;
        }

        // initialize local-logging object
        const localLogData = initLocalLogData(req, {
          service_id: process.env.SERVICE_OCR_KYC_VERIFY_ID,
          api_name: "KYC-OCR",
          request_id: requestId,
        });

        if (req.body.consent === "N") {
          localLogData.response_type = "error";
          localLogData.api_response_status = "FAIL";
        }

        // log received client-request
        await createLog(req.body, localLogData, true);

        if (req.body.consent === "N") {
          throw {
            errorType: 999,
            message: "Consent was not provided",
          };
        }

        // req.body {file_b64, doc_type, consent, consent_timestamp, loan_app_id
        const postData = {
          fileB64: req.body.file_b64,
          docType: req.body.doc_type,
          maskAadhar: true,
          hideAadhar: true,
          conf: true,
          checkBlur: true,
          checkBlackAndWhite: true,
          checkCutCard: true,
          checkBrightness: true,
        };

        // invoke third-party api
        const apiResponse = await axios.request({
          url: `${process.env.KARZA_URL}/v3/kycocr`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-karza-key": process.env.KARZA_API_KEY,
          },
          data: postData,
        });
        console.log(apiResponse.data);

        localLogData.timestamp = Date.now();
        if (apiResponse && apiResponse.data) {
          // log received acknowledgement
          await createLog(apiResponse.data, localLogData, false);

          // acknowledge client with the acknowledgement from karza provider
          return res.status(200).send({
            request_id: requestId,
            success: true,
            data: apiResponse.data,
          });
        } else {
          // log received acknowledgement
          await createLog(apiResponse, localLogData, false);

          // send back api response to client
          return res.status(500).send(apiResponse);
        }
      } catch (error) {
        console.log(error);
        if (error.errorType)
          return res.status(400).send({
            status: "fail",
            message: error.message,
          });
        logErrorToS3(req, res, requestId, apiName, "KARZA", error);
      }
    }
  );
};
