const bodyParser = require("body-parser");
const axios = require("axios");
const BureauScorecards = require("../models/bureau-scorecard-schema");
const ServiceReqResLog = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const AccessLog = require("../util/accessLog");
const s3helper = require("../util/s3helper.js");
const helper = require("../util/helper.js");
const validate = require("../util/validate-req-body.js");
const bureau_data = require("../models/bureau-data-schema");
const {CommonBureauMapper} = require("../util/common-bureau-mapper");
const moment = require('moment');
const TAG = "bureau-scorecard-cache-api";

const localLogTemplate = {
  company_id: "",
  company_code: "",
  sub_company_code: "",
  vendor_name: "ARTHMATE",
  loan_id: null,
  borrower_id: null,
  loan_app_id:"",
  partner_loan_id: null,
  partner_borrower_id: null,
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
  localLogData.loan_app_id=req.body.loan_app_id;
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
  // api for bureau-scorecard-cache
  app.post(
    "/api/bureau-scorecard-cache",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabled(process.env.SERVICE_BUREAU_SCORECARD_CACHE_ID),
    ],
    async (req, res) => {
      try {

       // initialize local-logging object
        const localLogData = initLocalLogData(req, {
          service_id: process.env.SERVICE_BUREAU_SCORECARD_CACHE_ID,
          api_name: "BUREAU-SCORECARD-CACHE",
          pan_card: req.body.pan,
        });

        const gen_request_id = `${req.company.code}-BUREAU-SCORECARD-CACHE-${Date.now()}`;

        //   log received client data
        const createdLogs =  await createLog(
          {
            gen_request_id,
            ...req.body,
          },
          localLogData,
          true
        );  
        // invoke one-of-the-bureau apis (CRIF/CIBIL/EXPERIAN)
        
      // Caching mechanism for getting request data from server.
      var bureauResponse ="";    
      var cachedBureau = await bureau_data.findCachedBureau(req.body.loan_app_id,req.body.pan);
      if(cachedBureau[0]){
      var cachedUrl = cachedBureau[0].res_url;
      var bureauType =  cachedBureau[0].bureau_type;

        if(bureauType === "CRIF"){
        bureauResponse = await s3helper.fetchXMLFromS3(
        cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
            );
        }
        else if(bureauType === "CIBIL"){
        bureauResponse = await s3helper.fetchJsonFromS3(
            cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
                );
        } 
        else if(bureauType === "EXPERIAN"){
        const rawXmlS3Response = await s3helper.fetchJsonFromS3(
            cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
                );
        const regXmlS3Response = rawXmlS3Response.replace(/[\n]/gm, '');
        const find = ["&lt;", "&gt;"];
                    const replace = ["<", ">"];
                    bureauResponse = regXmlS3Response.replace(
                        new RegExp(
                            "(" +
                            find
                                .map(function (i) {
                                    return i.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
                                })
                                .join("|") +
                            ")",
                            "g"
                        ),
                        function (s) {
                            return replace[find.indexOf(s)];
                        }
                    );
        }    
    }else{
        throw{
            message:"Bureau details not found",
        }
    }       
    if(bureauResponse){  
        // create schema instance based on the gen_request_id
        const createSchemaResult = await BureauScorecards.add({
            gen_request_id: gen_request_id,
            client_data: req.body,
            partner_id: req.body.partner_id,
            loan_app_id:req.body.loan_app_id
          });
        await BureauScorecards.updateBureauRequest(gen_request_id, createdLogs.raw_data);

        var resData = bureauResponse;
        const responseUrl = await createLog(
        resData,
        localLogData,
        false
        );
        await BureauScorecards.updateBureauResponse(gen_request_id, responseUrl.raw_data);
        CommonBureauMapper(req.body.loan_app_id, bureauType, req.body.partner_id, bureauResponse, (err, bureauMapperRes)=>{
        if(err){
            BureauScorecards.updateMappedResponse(gen_request_id, err, 'FAILED');
        } else {
            BureauScorecards.updateMappedResponse(gen_request_id, bureauMapperRes, 'COMPLETED');
        }
        });
    } 
    else {
        await BureauScorecards.updateBureauResponse(gen_request_id, responseUrl.raw_data);
    }
    //send acknowledgement back to the client
    res.status(200).send({
        request_id: gen_request_id,
        message: "Your request is under process...",
        status_code: 200,
      });
        
      } catch (error) {
        return res.status(400).send({
          data: null,
          message: error
            ? error.message
              ? error.message
              : "Something went wrong!"
            : "Something went wrong",
        });
      }
    }
  );
};
