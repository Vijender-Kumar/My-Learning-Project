const bodyParser = require("body-parser");
const validate = require("../util/validate-req-body.js");
const ServiceReqResLog = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const bureau_data = require("../models/bureau-data-schema");
const s3helper = require("../util/s3helper.js");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");

const localLogTemplate = {
  company_id: "",
  company_code: "",
  sub_company_code: "",
  vendor_name: "CIBIL",
  service_id: 0,
  api_name: "",
  raw_data: "",
  request_type: "",
  response_type: "",
  timestamp: 0,
  pan_card: null,
  document_uploaded_s3: "",
  api_response_type: "JSON",
  api_response_status: "",
  kyc_id: "",
};

function initLocalLogData(req, optionals = {}) {
  let localLogData = { ...localLogTemplate };
  localLogData.company_id = req.company._id;
  localLogData.company_code = req.company.code;
  localLogData.loan_app_id = req.body.loan_app_id;
  localLogData.sub_company_code = req.headers.company_code;
  localLogData.timestamp = Date.now();
  localLogData.kyc_id = `${req.company.code}-CIBIL-CACHE-${Date.now()}`;
  localLogData = { ...localLogData, ...optionals };
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

    return logData;
  } catch (error) {
    throw error;
  }
}

module.exports = (app) => {
  app.use(bodyParser.json());
  // api for cibil-cache
  app.post(
    "/api/cibil-verify-cache",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabled(process.env.SERVICE_CIBIL_VERIFY_CACHE_ID),
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
        // initialize local-logging object
        const localLogData = initLocalLogData(req, {
          service_id: process.env.SERVICE_CIBIL_VERIFY_CACHE_ID,
          api_name: "CIBIL-CACHE",
          pan_card: req.body.pan,
        });
        const gen_request_id = `${req.company.code}-CIBIL-CACHE-${Date.now()}`;
        //   log received client data
        const createdLogs = await createLog(
          {
            gen_request_id,
            ...req.body,
          },
          localLogData,
          true
        );

        // Caching mechanism for getting request data from server.
        var bureauResponse = "";
        var cachedBureau = await bureau_data.findCachedBureauCIBIL(req.body.loan_app_id, req.body.pan, "CIBIL");
        if (cachedBureau[0]) {
          var cachedUrl = cachedBureau[0].res_url;

          bureauResponse = await s3helper.fetchJsonFromS3(
            cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
          );
        }
        if (bureauResponse) {
          var resData = bureauResponse;
          const responseUrl = await createLog(
            resData,
            localLogData,
            false
          );
          //send acknowledgement back to the client
          res.status(200).send({
            request_id: gen_request_id,
            success: true,
            data: bureauResponse.result,
          });
        } else {
          throw {
            message: "Data not found!!!!!",
          }
        }
      } catch (error) {
        if (error.message) {
          return res.status(400).send({
            requestID: `${req.company.code}-CIBIL-CACHE-${Date.now()}`,
            status: "fail",
            message: error.message.validationmsg || error.message,
          });
        }
        else {
          return res.status(404).send({
            requestID: `${req.company.code}-CIBIL-CACHE-${Date.now()}`,
            status: "fail",
            message: "Data not found!!!!!",
          });
        }
      }
    }
  );
};
