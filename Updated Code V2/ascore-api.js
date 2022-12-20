const bodyParser = require("body-parser");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
const serReqResLog = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const axios = require("axios");
const { logErrorToS3 } = require("../utils/error-logger.js");

module.exports = (app, connection) => {
    app.use(bodyParser.json());

    app.post(
        "/api/a-score",
        [
            jwt.verifyToken,
            jwt.verifyUser,
            jwt.verifyCompany,
            services.isServiceEnabledCached(process.env.SERVICE_A_SCORE_ID),
        ],
        async (req, res, next) => {
            const apiName = "A-SCORE";
            const requestId = `${req.company.code}-${apiName}-${Date.now()}`;

            try {
                //fetch template from s3
                const s3templateUrl = req.service.file_s3_path;
                //fetch customized template from s3url
                const templateJson = await s3helper.fetchJsonFromS3(
                    s3templateUrl.substring(s3templateUrl.indexOf("services"))
                );
                if (!templateJson)
                    throw {
                        message: "Error while finding template from s3",
                        success: false,
                    };

                // //validate the incoming template data with customized template data
                const validationResult = validate.validateDataWithTemplate(
                    templateJson,
                    [req.body]
                );
                if (validationResult.missingColumns.length) {
                    validationResult.missingColumns =
                        validationResult.missingColumns.filter(
                            (x) => x.field != "sub_company_code"
                        );
                }
                if (!validationResult)
                    throw {
                        errorType: 999,
                        message: "No records found",
                        success: false,
                    };
                if (validationResult.unknownColumns.length)
                    throw {
                        errorType: 999,
                        message: validationResult.unknownColumns[0],
                        success: false,
                    };
                if (validationResult.missingColumns.length)
                    throw {
                        errorType: 999,
                        message: validationResult.missingColumns[0],
                        success: false,
                    };
                if (validationResult.errorRows.length)
                    throw {
                        errorType: 999,
                        message: Object.values(validationResult.exactErrorColumns[0])[0],
                        success: false,
                    };

                var logData = {
                    company_id: req.company && req.company._id ? req.company._id : null,
                    company_code:
                        req.company && req.company.code ? req.company.code : null,
                    vendor_name: "ARTHMATE",
                    service_id: process.env.SERVICE_A_SCORE_ID,
                    api_name: apiName,
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
                const keyRequestLog = `${logData.api_name}/${logData.vendor_name}/${logData.company_id}/${filename}/${logData.timestamp}.txt`;
                //upload request data on s3
                let s3LogResult = await s3helper.uploadFileToS3(
                    req.body,
                    keyRequestLog
                );

                if (!s3LogResult) {
                    (logData.document_uploaded_s3 = 0), (logData.response_type = "error");
                }
                logData.document_uploaded_s3 = 1;
                logData.response_type = "success";
                logData.api_response_status = "SUCCESS";
                logData.raw_data = s3LogResult.Location;
                logData.request_type = "request";

                //insert request data s3 upload response to database
                let localLogResult = await serReqResLog.addNew(logData);

                const apiResponse = await axios.request({
                    url: `${process.env.A_SCORE_URL}/api/get-a-score`,
                    method: "POST",
                    headers: {
                        "access-token": process.env.A_SCORE_KEY,
                        "Content-Type": "application/json",
                    },
                    data: req.body,
                });

                //response data from karza address to upload on s3
                filename = Math.floor(10000 + Math.random() * 99999) + "_res";
                const keyResponseLog = `${logData.api_name}/${logData.vendor_name}/${logData.company_id}/${filename}/${logData.timestamp}.txt`;
                //upload response data from karza address create plan on s3
                s3LogResult = await s3helper.uploadFileToS3(
                    apiResponse.data,
                    keyResponseLog
                );

                if (!s3LogResult) {
                    (logData.document_uploaded_s3 = 0), (logData.response_type = "error");
                } else {
                    logData.document_uploaded_s3 = 1;
                    logData.response_type = "success";
                }
                logData.raw_data = await s3LogResult.Location;
                logData.request_type = "response";
                if (apiResponse.status == 200) {
                    logData.api_response_status = "SUCCESS";
                } else {
                    logData.api_response_status = "FAIL";
                }

                //insert response data s3 upload response to database
                localLogResult = await serReqResLog.addNew(logData);

                return res.status(200).send({
                    requestID: requestId,
                    success: true,
                    data: apiResponse.data,
                });
            } catch (error) {
                if (error.errorType) {
                    return res.status(400).send({
                        message: error.message,
                        status: "fail",
                    });
                }
                if(error.response.status===404){
                    return res.status(404).send({
                        message: "Resource not found",
                        status: "fail",
                    });
                }
                else{
                return logErrorToS3(req, res, requestId, apiName, "ARTHMATE", error);
                }
            }
        }
    );
};
