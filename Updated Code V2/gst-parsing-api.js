const axios = require("axios");
const services = require("../util/service");
const ServiceReqResLog = require("../models/service-req-res-log-schema");
const validate = require("../util/validate-req-body.js");
const KYCSchema = require("../models/kyc-data-schema.js");
const jwt = require("../util/jwt");
const s3helper = require("../util/s3helper.js");
const { logErrorToS3 } = require("../utils/error-logger");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");
const FormData = require("form-data");

const localLogTemplate = {
  company_id: "",
  company_code: "",
  sub_company_code: "",
  vendor_name: "KARZA",
  loan_app_id: "",
  service_id: 0,
  api_name: "",
  raw_data: "",
  request_type: "",
  response_type: "",
  timestamp: 0,
  id_number: "",
  document_uploaded_s3: "",
  api_response_type: "JSON",
  api_response_status: "",
  kyc_id: "",
};

async function verifyRequestWithTemplate(templateS3url, s3LogData) {
  // fetch upload template from s3
  const templateResponse = await s3helper.fetchJsonFromS3(
    templateS3url.substring(templateS3url.indexOf("services"))
  );

  if (!templateResponse || ("" + templateResponse).includes("Error"))
    throw { message: "Error while finding template from s3" };

  // validate the incoming template data with customized template data
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
    throw { errorType: 999, message: "No records found", success: false};
  if (templateValidation.unknownColumns.length)
    throw { errorType: 999, message: templateValidation.unknownColumns[0], success: false };
  if (templateValidation.missingColumns.length)
    throw { errorType: 999, message: templateValidation.missingColumns[0], success: false };
  if (templateValidation.errorRows.length)
    throw {
      errorType: 999,
      message: Object.values(templateValidation.exactErrorColumns[0])[0], 
      success: false
    };
  return true;
}

function initLocalLogData(req, optionals = {}) {
  let localLogData = { ...localLogTemplate };
  localLogData.company_id = req.company._id;
  localLogData.company_code = req.company.code;
  localLogData.loan_app_id = req.body.loan_app_id;
  localLogData.sub_company_code = req.headers.company_code;
  localLogData.id_number = req.body.gstin;
  localLogData.timestamp = Date.now();
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
  if (!insertResult) throw { message: "Error while adding service log data", success: false };

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
  // api for gst pdf parsing
  app.post(
    "/api/gst-parsing",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabled(process.env.SERVICE_GST_PDF_PARSING_ID),
      verifyloanAppIdValidation,
    ],

    async (req, res) => {
      const apiName = "GST-PARSING";
      const request_ID = `${req.company.code}-${apiName}-${Date.now()}`;

      const kycData = {
        company_id: req.company._id,
        loan_app_id: req.body.loan_app_id,
        kyc_type: apiName,
        req_url: "",
        res_url: "",
        consent: req.body.consent,
        consent_timestamp: req.body.consent_timestamp,
        id_number: req.body.gstin,
        created_at: Date.now(),
        created_by: req.company.code,
        request_id: "",
        kyc_id: request_ID,
      };

      try {
        // initialize local-logging object
        const localLogData = initLocalLogData(req, {
          service_id: process.env.SERVICE_GST_PDF_PARSING_ID,
          api_name: apiName,
          gstin: req.body.gstin,
          extended_period: req.body.extended_period,
          kyc_id: request_ID,
        });

        if (!req.body.consent) {
          throw {
            errorType: 999,
            request_id: request_ID,
            message: "Please enter the consent",
            success: false
          };
        }

        if (req.body.consent === "N") {
          localLogData.response_type = "error";
          localLogData.api_response_status = "FAIL";
        }

        // log received client-request
        await createLog(req.body, localLogData, true);
        kycData.req_url = localLogData.raw_data;

        if (req.body.consent === "N") {
          throw {
            errorType: 999,
            request_id: request_ID,
            message: "Consent was not provided",
            success: false
          };
        }
        if (!req.body.gstin) {
          throw {
            errorType: 999,
            request_id: request_ID,
            message: "Please enter the gstin",
            success: false
          };
        }
        if (!req.body.extended_period) {
          throw {
            errorType: 999,
            request_id: request_ID,
            message: "Please enter the extended period",
            success: false
          };
        }
        if (!req.body.consent_timestamp) {
          throw {
            errorType: 999,
            request_id: request_ID,
            message: "Please enter the consent timestamp",
            success: false
          };
        }
        if (!req.body.loan_app_id) {
          throw {
            errorType: 999,
            request_id: request_ID,
            message: "Please enter the loan app id",
            success: false
          };
        }

        const body = JSON.parse(JSON.stringify(req.body));
        const file = req.files[0];

        const outForm = new FormData();
        outForm.append("file", file.buffer, file.originalname);
        outForm.append("gstin", body.gstin);
        outForm.append("consent", "Y");

        // invoke third-party api
        const apiResponse = await axios.post(
          `${process.env.GST_BASE_URL}/v2/docs-upload-advance`,
          outForm,
          {
            headers: {
              ...outForm.getHeaders(),
              "x-karza-key": process.env.KARZA_API_KEY,
              "Content-Length": outForm.getLengthSync(),
            },
          }
        );

        if (apiResponse && apiResponse.data) {
          // log received acknowledgement
          await createLog(apiResponse.data, localLogData, false);

          // acknowledge client with the acknowledgement from karza provider
          if (apiResponse.data.statusCode == 101) {
            kycData.res_url = localLogData.raw_data;
            kycData.request_id = apiResponse.data.requestId;
            const insertResult = await KYCSchema.addNew(kycData);
            return res.status(200).send({
              request_id: request_ID,
              success: true,
              data: apiResponse.data,
            });
          } else {
            return res.status(400).send({
              request_id: request_ID,
              success: false,
              data: apiResponse.data,
            });
          }
        } else {
          // log received acknowledgement
          await createLog(apiResponse, localLogData, false);

          return logErrorToS3(
            req,
            res,
            request_ID,
            apiName,
            "KARZA",
            apiResponse
          );
        }
      } catch (error) {
        if (error.errorType)
          return res.status(400).send({
            request_id: request_ID,
            status: "fail",
            message: error.message,
          });
        logErrorToS3(req, res, request_ID, apiName, "KARZA", error);
      }
    }
  );

  // GST PDF PARSING second API for data saving
  app.post(
    "/api/gst-pdf-parsing-download",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabled(process.env.SERVICE_GST_PDF_PARSING_DOWNLOAD_ID),
      verifyloanAppIdValidation,
    ],

    async (req, res) => {
      const apiName = "GST-PDF-PARSING-DOWNLOAD";
      const request_ID = `${req.company.code}-${apiName}-${Date.now()}`;

      const logData = {
        company_id: req.company._id,
        loan_app_id: req.body.loan_app_id,
        kyc_type: apiName,
        request_id: "",
        req_url: "",
        res_url: "",
        consent: req.body.consent,
        consent_timestamp: req.body.consent_timestamp,
        created_at: Date.now(),
        created_by: req.company.code,
        kyc_id: request_ID,
      };
      try {
        // validate api-request with service template
        const isValidated = await verifyRequestWithTemplate(
          req.service.file_s3_path,
          req.body
        );
        if (!isValidated) {
          throw {
            errorType: 999,
            message: "Invalid request!",
            success: false
          };
        }

        // // initialize local-logging object
        const localLogData = initLocalLogData(req, {
          service_id: process.env.SERVICE_GST_PDF_PARSING_DOWNLOAD_ID,
          api_name: apiName,
          request_id: req.body.request_id,
          kyc_id: request_ID,
        });

        if (req.body.consent === "N") {
          localLogData.response_type = "error";
          localLogData.api_response_status = "FAIL";
        }

        // log received client-request
        await createLog(req.body, localLogData, true);
        logData.req_url = localLogData.raw_data;

        if (req.body.consent === "N") {
          throw {
            errorType: 999,
            request_id: request_ID,
            message: {
              validationmsg: "Consent was not provided",
            },
            success: false
          };
        }

        // invoke third-party api
        //Karza data
        const gstData = {
          requestId: req.body.request_id,
          proceed: true,
          consent: req.body.consent,
          consent_timestamp: req.body.consent_timestamp,
          loan_app_id: req.body.loan_app_id
        };
        //Karza url
        const gstUrl = process.env.GST_BASE_URL + "/v2/docs-upload-advance";
        //X-karza-key
        const key = process.env.KARZA_API_KEY;
        //Headers
        const config = {
          headers: {
            "x-karza-key": key,
            "Content-Type": "application/json",
          },
        };

        axios
          .patch(gstUrl, JSON.stringify(gstData), config)
          .then(async (apiResponse) => {

            if (apiResponse && apiResponse.data) {
              // log received acknowledgement
              await createLog(apiResponse.data, localLogData, false);

              // acknowledge client with the acknowledgement from karza provider
              if (apiResponse.data.statusCode == 101) {
                logData.res_url = localLogData.raw_data;
                logData.request_id = apiResponse.data.requestId;
                const insertResult = await KYCSchema.addNew(logData);
                return res.status(200).send({
                  request_ID: request_ID,
                  success: true,
                  data: apiResponse.data,
                });
              } else {
                return res.status(400).send({
                  request_ID: request_ID,
                  success: false,
                  data: apiResponse.data,
                });
              }
            } else {
              // log received acknowledgement
              await createLog(apiResponse, localLogData, false);

              return logErrorToS3(
                req,
                res,
                request_ID,
                apiName,
                "KARZA",
                apiResponse
              );
            }
          }).catch(async (error) => {
            //handle error catched from karza api
            res.status(500).send({
              requestId: `${req.company.code}-GST-PDF-PARSING-DOWNLOAD-${Date.now()}`,
              message: "Please contact the administrator",
              status: "fail",
            });
          });
      } catch (error) {
        const msgString = error.message.validationmsg ? error.message : `Please contact the administrator`;
        const errorCode = error.message.validationmsg ? 400 : 500;
        if (errorCode == 400) {
          res.status(400).send({
            success: false,
            requestID: request_ID,
            message: msgString
          });
        }
        else {
          logErrorToS3(req, res, request_ID, apiName, "KARZA", error);
        }
      }
    }
  );
};
