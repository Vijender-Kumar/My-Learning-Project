var SerReqResLog = require("../models/service-req-res-log-schema.js");
const s3helper = require("../util/s3helper.js");

module.exports = {
  logErrorToS3: async function (
    req,
    res,
    requestId,
    apiName,
    vendorName,
    error
  ) {
    const filename = `err_${requestId}`;
    //upload response data from karza on s3
    const resKey = `${apiName}/${vendorName}/${
      req.company._id
    }/${filename}/${Date.now()}.txt`;

    const s3Log = {
      requestId: requestId,
      error: error,
    };
    const logResult = await s3helper.uploadFileToS3(s3Log, resKey);

    const kycId = `${req.company.code}-${apiName}-${Date.now()}`;
    var logData = {
      company_id: req.company._id,
      company_code: req.company.code,
      kyc_id: kycId,
      vendor_name: vendorName,
      api_name: apiName,
      timestamp: Date.now(),
      raw_data: logResult.Location,
      consent: req.body.consent,
      consent_timestamp: req.body.consent_timestamp,
      loan_app_id: req.body.loan_app_id,
      api_response_status: "ERROR",
    };

    await SerReqResLog.addNew(logData);

    //handle error catched from karza api
    return res.status(500).send({
      requestId: kycId,
      status: "fail",
      message: "Please contact the administrator",
    });
  },
};
