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
const {
  verifyloanAppIdValidation
} = require("../util/loan-app-id-validation.js");
const errorLogger = require("../utils/error-logger.js");

var logger = function(label) {
  return function(req, res, next) {
    next();
  };
};

module.exports = (app, connection) => {
  app.use(bodyParser.json());
  app.post(
    "/api/ckyc-download-v2",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabledCached(process.env.SERVICE_CKYC_DOWNLOAD_V2_JSON_ID),
      AccessLog.maintainAccessLog,
      verifyloanAppIdValidation
    ],
    async (req, res, next) => {
      try {
        await validateInput(req);
        //Karza data
        const ckycDownloadData = {
          ckycno: req.body.ckyc_no,
          authfactortyp: req.body.auth_factor_type,
          authfactor: req.body.auth_factor
        };
        //Karza url
        const url = process.env.CKYC_API_URL_V2 + "/api/ckyc-download/v2";
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json"
          }
        };
        const apiName = "CKYC-DOWNLOAD-JSON";
        const serviceid = process.env.SERVICE_CKYC_DOWNLOAD_V2_JSON_ID;
        await invokeAPIAndSendResponse(
          req,
          serviceid,
          apiName,
          url,
          ckycDownloadData,
          config,
          res,
          2
        );
      } catch (error) {
        return res.status(400).send({
          message: "Please contact the administrator",
          status: "fail",
          error: error.message
        });
      }
    }
  );

  app.post(
    "/api/ckyc-xml",
    [
      jwt.verifyToken,
      jwt.verifyUser,
      jwt.verifyCompany,
      services.isServiceEnabledCached(process.env.SERVICE_CKYC_DOWNLOAD_V2_XML_ID),
      AccessLog.maintainAccessLog,
      verifyloanAppIdValidation
    ],
    async (req, res, next) => {
      try {
        await validateInput(req);
        //Karza data
        const ckycDownloadData = {
            ckycno: req.body.ckyc_no,
            authfactortyp: req.body.auth_factor_type,
            authfactor: req.body.auth_factor
        };
        //Karza url
        const url = process.env.CKYC_API_URL_V2 + "/api/ckyc-xml";
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json"
          }
        };
        const apiName = "CKYC-DOWNLOAD-XML";
        const serviceid = process.env.SERVICE_CKYC_DOWNLOAD_V2_XML_ID;
        await invokeAPIAndSendResponse(
          req,
          serviceid,
          apiName,
          url,
          ckycDownloadData,
          config,
          res,
          2
        );
      } catch (error) {
        return res.status(400).send({
          message: "Please contact the administrator",
          status: "fail",
          error:error.message
        });
      }
    }
  );
};

async function invokeAPIAndSendResponse(
  req,
  serviceid,
  apiName,
  url,
  ckycAPIData,
  config,
  res,
  apitype
) {
  var ckycData = {
    company_id: req.company._id,
    company_code: req.company.code,
    vendor_name: "CERSAI",
    service_id: serviceid,
    api_name: apiName,
    raw_data: "",
    response_type: "",
    request_type: "",
    id_number:req.body.ckyc_no,
    timestamp: Date.now(),
    is_cached_response: false,
    consent: req.body.consent,
    consent_timestamp: req.body.consent_timestamp,
    loan_app_id: req.body.loan_app_id,
    request_id: req.body.request_id,
    document_uploaded_s3: "",
    api_response_type: "JSON",
    api_response_status: ""
  };

  let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
  const reqKey = `${ckycData.api_name}/${ckycData.vendor_name}/${ckycData.company_id}/${filename}/${ckycData.timestamp}.txt`;
  //upload request data on s3
  const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);

  if (!uploadResponse) {
    ckycData.document_uploaded_s3 = 0;
    ckycData.response_type = "error";
  } else {
    ckycData.document_uploaded_s3 = 1;
    ckycData.response_type = "success";
  }
  ckycData.api_response_status = "SUCCESS";
  ckycData.raw_data = uploadResponse.Location;
  ckycData.reqdata = uploadResponse.Location;
  ckycData.request_type = "request";
  if (req.body.consent === "N") {
    ckycData.response_type = "error";
    ckycData.api_response_status = "FAIL";
  }
  //insert request data s3 upload response to database
  const addResult = await bureauService.addNew(ckycData);
  if (!addResult)
    throw {
      message: "Error while adding request data"
    };
  if (req.body.consent === "N")
    throw {
      message: "Consent was not provided"
    }

   // Caching mechanism for getting request data from server.
    
  if(apiName === "CKYC-DOWNLOAD-XML"){
    var cachedKyc = await kycdata.findIfExists(req.body.loan_app_id,req.body.ckyc_no,apiName);
    if(cachedKyc[0]){
    var cachedUrl = cachedKyc[0].res_url;

    const xmlS3Response = await s3helper.fetchDataFromS3(
      cachedUrl.substring(cachedUrl.indexOf(cachedKyc[0].kyc_type)));
        var contents = xmlS3Response.toString("utf-8");
        const xmlContentss = contents.replace(/[\\"]/gm, "");

    const slicedFront = xmlContentss.slice(9);
    const finalResp=slicedFront.slice(0,-16);
    ckycData.request_type = 'response';
    ckycData.raw_data = cachedUrl;
    ckycData.api_response_type="XML";
    ckycData.kyc_id =`${req.company.code}-${apiName}-${Date.now()}`;
    ckycData.is_cached_response = 'TRUE';
    //insert request data s3 upload response to database
    const ckycDataSerResp = await bureauService.addNew(ckycData);
    return res.send({
      kyc_id: ckycDataSerResp.kyc_id,
      data: finalResp,
      success: true
    });
  }
}    

  if(apiName === "CKYC-DOWNLOAD-JSON"){
    var cachedKyc = await kycdata.findIfExists(req.body.loan_app_id,req.body.ckyc_no,apiName);
    if(cachedKyc[0]){
    var cachedUrl = cachedKyc[0].res_url;

    const xmlS3Response = await s3helper.fetchJsonFromS3(
    cachedUrl.substring(cachedUrl.indexOf(cachedKyc[0].kyc_type)));
    ckycData.request_type = 'response';
    ckycData.raw_data = cachedUrl;
    ckycData.kyc_id =`${req.company.code}-${apiName}-${Date.now()}`;
    ckycData.is_cached_response = 'TRUE';
    //insert request data s3 upload response to database
    const ckycDataSerResp = await bureauService.addNew(ckycData);
    return res.send({
      kyc_id: ckycDataSerResp.kyc_id,
      data: xmlS3Response.message,
      success: true
    });
  } 
}

  //call ckyc api after successfully uploading request data to s3
  axios
    .post(url, JSON.stringify(ckycAPIData), config)
    .then(async response => {
      //response data from ckyc to upload on s3
      filename = Math.floor(10000 + Math.random() * 99999) + "_res";
      const resKey = `${ckycData.api_name}/${ckycData.vendor_name}/${ckycData.company_id}/${filename}/${ckycData.timestamp}.txt`;
      //upload response data from karza on s3
      const uploadS3FileRes = await s3helper.uploadFileToS3(
        response.data,
        resKey
      );
      if (!uploadS3FileRes) {
        (ckycData.document_uploaded_s3 = 0), (ckycData.response_type = "error");
      } else {
        ckycData.document_uploaded_s3 = 1;
        ckycData.response_type = "success";
      }
      ckycData.raw_data = await uploadS3FileRes.Location;
      ckycData.resdata = uploadS3FileRes.Location;
      ckycData.request_type = "response";
      if (apitype == 2 || response.data.status == "success") {
        (ckycData.api_response_status = "SUCCESS"),
          (ckycData.kyc_id = `${req.company.code}-${apiName}-${Date.now()}`);
      } else {
        ckycData.api_response_status = "FAIL";
      }

      //insert call ekyc check
      const data = {
        company_id: req.company._id,
        loan_app_id: req.body.loan_app_id,
        kyc_type: ckycData.api_name,
        req_url: ckycData.reqdata,
        res_url: ckycData.resdata,
        consent: req.body.consent,
        consent_timestamp: req.body.consent_timestamp,
        id_number: req.body.id_no || req.body.ckyc_no,
        created_at: Date.now(),
        created_by: req.company.code
      };
      const addEkycRes = await kycdata.addNew(data);
      if (!addEkycRes)
        throw {
          message: "Error while adding ekyc data"
        };
      //insert response data s3 upload response to database
      const ckycDataResp = await bureauService.addNew(ckycData);
      if (!ckycDataResp)
        throw {
          message: "Error while adding response data to database"
        };
       //send final response
      if (ckycData.api_response_status == "SUCCESS") {
        return res.send({
          kyc_id: ckycDataResp.kyc_id,
          data: response.data.message,
          success: true
        });
      } else {
        return res.send({
          kyc_id: ckycDataResp.kyc_id,
          data: response.data.message,
          success: false
        });
      }
    })
    .catch(error => {
      //handle error catched from karza api
      res.status(400).send({
        requestId: `${req.company.code}-CKYC-${Date.now()}`,
        message: "Please contact the administrator",
        status: "fail",
        error: error.message
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
      message: "Error while finding template from s3"
    };
  //validate the incoming template data with customized template data
  const resValDataTemp = validate.validateDataWithTemplate(jsonS3Response, [
    data
  ]);
  if (resValDataTemp.missingColumns.length) {
    resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
      x => x.field != "sub_company_code"
    );
  }
  if (!resValDataTemp)
    throw {
      message: "No records found"
    };
  if (resValDataTemp.unknownColumns.length)
    throw {
      message: resValDataTemp.unknownColumns[0]
    };
  if (resValDataTemp.missingColumns.length)
    throw {
      message: resValDataTemp.missingColumns[0]
    };
  if (resValDataTemp.errorRows.length)
    throw {
      message: Object.values(resValDataTemp.exactErrorColumns[0])[0]
    };
}
