const bodyParser = require("body-parser");
const fs = require("fs");
const https = require("https");
const axios = require("axios");
const ServiceReqResLog = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const moment = require("moment");
const AccessLog = require("../util/accessLog");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
const BureauLogSchema = require("../models/bureau-data-schema");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");

const TAG = "cibil-verification-api";
var todayDate = new Date();
let year = todayDate.getFullYear();
let month = ("0" + (todayDate.getMonth() + 1)).slice(-2);
let day = ("0" + todayDate.getDate()).slice(-2);
var formattedTodayDate = month + day + year;
async function createRequest(reqBody) {
  return {
    monitoringDate: formattedTodayDate,
    serviceCode: process.env.CIBIL_SERVICE_CODE_ID,
    consumerInputSubject: {
      tuefHeader: {
        headerType: process.env.CIBIL_TUEF_HEADER_TYPE,
        version: process.env.CIBIL_TUEF_VERSION,
        memberRefNo: process.env.CIBIL_MEMBER_REF_ID,
        gstStateCode: process.env.CIBIL_TUEF_GST_STATE_CODE,
        enquiryMemberUserId: process.env.CIBIL_MEMBER_USER_ID,
        enquiryPassword: process.env.CIBIL_MEMBER_USER_PASSWORD,
        enquiryPurpose: reqBody.enquiry_purpose,
        enquiryAmount: reqBody.enquiry_amount.padStart(9,'0'),
        responseSize: process.env.CIBIL_TUEF_RESPONSE_SIZE,
        ioMedia: process.env.CIBIL_TUEF_IO_MEDIA,
        authenticationMethod: process.env.CIBIL_TUEF_AUTHENTICATION_METHOD,
      },
      names: [
        {
          index: process.env.CIBIL_NAME_INDEX_1_ID,
          firstName: reqBody.name_first_name_1,
          middleName: reqBody.name_middle_name_1,
          lastName: reqBody.name_last_name_1,
          birthDate: reqBody.name_birth_date_1,
          gender: reqBody.name_gender_1,
        },
      ],
      telephones: [
        {
          index: process.env.CIBIL_TELE_INDEX_1_ID,
          telephoneNumber: reqBody.tele_telephone_number_1,
          telephoneType: reqBody.tele_telephone_type_1,
          enquiryEnriched: process.env.CIBIL_TELE_ENQUIRY_ENCRICHED_1_ID,
        },
      ],
      ids: [
        {
          index: process.env.CIBIL_ID_INDEX_1_ID,
          idNumber: reqBody.id_id_number_1,
          idType: reqBody.id_id_type_1,
        },
      ],
      addresses: [
        {
          index: process.env.CIBIL_ADD_INDEX_1_ID,
          line1: reqBody.add_line1_1,
          line2: reqBody.add_line2_1,
          line3: reqBody.add_line3_1,
          line4: reqBody.add_line4_1,
          line5: reqBody.add_line5_1,
          stateCode: reqBody.add_state_code_1,
          pinCode: reqBody.add_pin_code_1,
          addressCategory: reqBody.add_address_category_1,
          residenceCode: reqBody.add_residence_code_1,
        },
      ],
      enquiryAccounts: [
        {
          index: process.env.CIBIL_EN_ACC_INDEX_1,
          accountNumber: reqBody.en_acc_account_number_1,
        },
      ],
    },
  };
}

const localLogTemplate = {
  company_id: "",
  company_code: "",
  sub_company_code: "",
  vendor_name: "CIBIL",
  loan_app_id: "",
  loan_id: null,
  borrower_id: null,
  partner_loan_id: null,
  partner_borrower_id: null,
  service_id: 0,
  api_name: "",
  raw_data: "",
  pan_card:"",
  is_cached_response : 'FALSE',
  request_type: "",
  response_type: "success",
  timestamp: 0,
  consent: "",
  consent_timestamp: "",
  service_code: null,
  document_uploaded_s3: "",
  api_response_type: "JSON",
  api_response_status: "SUCCESS",
  request_id: "",
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
      message: "No records found",
    };
  if (templateValidation.unknownColumns.length)
    throw {
      message: templateValidation.unknownColumns[0],
    };
  if (templateValidation.missingColumns.length)
    throw {
      message: templateValidation.missingColumns[0],
    };
  if (templateValidation.errorRows.length)
    throw {
      message: Object.values(templateValidation.exactErrorColumns[0])[0],
    };
}

function initLocalLogData(req, optionals = {}) {
  let localLogData = {
    ...localLogTemplate,
  };

  localLogData.company_id = req.company._id;
  localLogData.company_code = req.company.code;
  localLogData.loan_app_id = req.body.loan_app_id;
  localLogData.consent = req.body.consent;
  localLogData.pan_card = req.body.id_id_number_1;
  localLogData.consent_timestamp = req.body.consent_timestamp;
  localLogData.sub_company_code = req.headers.company_code;
  localLogData.loan_id = req.body.loan_id ? req.body.loan_id : null;
  localLogData.borrower_id = req.body.borrower_id ? req.body.borrower_id : null;
  localLogData.partner_loan_id = req.body.partner_loan_id
    ? req.body.partner_loan_id
    : null;
  localLogData.partner_borrower_id = req.body.partner_borrower_id
    ? req.body.partner_borrower_id
    : null;
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
    res.status(500).send({
      message: "Please contact the administrator",
      status: "fail",
    });
  }
}

async function createLocalLog(s3LogResponse, localLogData, isRequest) {
  // update localLogData according to the s3 response
  localLogData.request_type = isRequest ? "request" : "response";
  if (s3LogResponse) {
    localLogData.document_uploaded_s3 = 1;
    localLogData.raw_data = s3LogResponse.Location;
  } else {
    localLogData.document_uploaded_s3 = 0;
    localLogData.response_type = "error";
  }

  // create local log of the s3 logging
  const insertResult = await ServiceReqResLog.addNew(localLogData);
  if (!insertResult)
    throw {
      message: "Error while adding service log data",
    };

  // return updated logData
  return localLogData;
}

async function createLog(s3LogData, localLogData, isRequestLog) {
  try {
    localLogData.timestamp = Date.now();
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

  // api for cibil verification
  app.post(
    "/api/cibil-verify",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabled(process.env.SERVICE_CIBIL_VERIFY_ID),
      AccessLog.maintainAccessLog,
      verifyloanAppIdValidation,
    ],
    async (req, res) => {
      const requestID = `${req.company.code}-CIBIL-${Date.now()}`;
      // initialize local-logging object
      const localLogData = initLocalLogData(req, {
        service_id: process.env.SERVICE_CIBIL_VERIFY_ID,
        api_name: "CIBIL-VERIFY",
        service_code: req.body.service_code,
        request_id: requestID,
      });

      if (req.body.consent === "N") {
        localLogData.response_type = "error";
        localLogData.api_response_status = "FAIL";
      }

      // log received client-request
      var requestUrl = await createLog(req.body, localLogData, true);

      if (req.body.consent === "N") {
        return res.status(400).send({
          request_id:requestID,
          message: "Consent was not provided",
        });
      }
      try {
        // validate api-request with service template
        await verifyRequestWithTemplate(req.service.file_s3_path, req.body);

         // Caching mechanism for getting request data from server.
         var cachedBureau = await BureauLogSchema.findIfExists(req.body.loan_app_id,req.body.id_id_number_1,"SUCCESS","CIBIL");
         if(cachedBureau[0]){
         var cachedUrl = cachedBureau[0].res_url;
         const xmlS3Response = await s3helper.fetchJsonFromS3(
           cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
              );

              localLogData.request_type = 'response';
              localLogData.raw_data = cachedUrl;
              localLogData.is_cached_response = 'TRUE';
         //insert request data s3 upload response to database
         const z= await ServiceReqResLog.addNew(localLogData);

         return res.status(200).send({
           request_id:requestID,
           result: xmlS3Response
         });
       }

        // invoke third-party api
        const apiResponse = await axios.request({
          url: `${process.env.CIBIL_BASE_URL}`,
          method: "POST",
          headers: {
            "member-ref-id": process.env.CIBIL_MEMBER_REF_ID,
            "cust-ref-id": localLogData.request_id,
            apikey: process.env.CIBIL_API_KEY,
          },
          data: await createRequest(req.body),
          httpsAgent: new https.Agent({
            passphrase: process.env.CIBIL_CERT_PASSWORD,
            pfx: fs.readFileSync(process.env.CIBIL_CERTIFICATE_PATH),
            rejectUnauthorized: false,
            keepAlive: true,
          }),
        });

        if (apiResponse && apiResponse.data) {
          // log received acknowledgement
          localLogData.response_type = "success";
          localLogData.api_response_status = "SUCCESS";
          const responseUrl = await createLog(
            apiResponse.data,
            localLogData,
            false
          );
          await addBureauData(
            req.body,
            requestUrl.raw_data,
            responseUrl.raw_data,
            req.company._id,
            "SUCCESS",
            req.company.code,
            requestID
          );

          // acknowledge client with the acknowledgement from panAdvKyc provider
          return res.status(200).send({
            request_id: localLogData.request_id,
            result: apiResponse.data,
          });
        } else {
          return res.status(500).send(apiResponse);
        }
      } catch (error) {
        localLogData.response_type = "error";
        localLogData.api_response_status = "FAIL";
        const errorLogUrl = await createLog(error, localLogData, false);

        return res.status(500).send({
          message: "Please contact the administrator",
          status: "fail",
        });
      }
    }
  );

  async function addBureauData(data, reqKey, resKey, company_id,status, company_code,requestID) {
    try {
      var req_data = {
        company_id: company_id,
        loan_app_id: data.loan_app_id,
        bureau_type: "CIBIL",
        req_url: reqKey,
        request_id:requestID,
        res_url: resKey,
        pan:data.id_id_number_1,
        status:status,
        consent: data.consent,
        consent_timestamp: data.consent_timestamp,
        created_by: company_code,
        created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      };
      var res = await BureauLogSchema.addNew(req_data);
      return res;
    } catch (err) {
      throw err;
    }
  }

  // get all cibil verifications
  app.get(
    "/api/cibil-reports",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabled(process.env.SERVICE_DIGITAP_REPORTS_ID),
      AccessLog.maintainAccessLog,
    ],
    async (req, res) => {
      try {
        let offset = 0;
        let limit = 100;

        if (req.query) {
          if (req.query.offset) offset = parseInt(req.query.offset);

          if (req.query.limit) limit = parseInt(req.query.limit);
        }
      } catch (error) {

        res.status(500).send({
          message: "Please contact the administrator",
          status: "fail",
        });
      }
    }
  );
};
