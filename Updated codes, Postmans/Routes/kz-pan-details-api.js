bodyParser = require("body-parser");
const helper = require("../util/helper.js");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
var bureau = require("../models/service-req-res-log-schema.js");
const jwt = require("../util/jwt");
const services = require("../util/service");
const axios = require("axios");
const kycdata = require("../models/kyc-data-schema.js");
const AccessLog = require("../util/accessLog");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");

module.exports = (app, connection) => {
    app.post(
        "/api/pan-profile",
        [
            jwt.verifyToken,
            jwt.verifyUser,
            jwt.verifyCompany,
            services.isServiceEnabledCached(process.env.SERVICE_PAN_PROFILE_DETAILS_KYC_ID),
            AccessLog.maintainAccessLog,
            verifyloanAppIdValidation,
        ],
        async (req, res) => {
            try {
                const data = req.body;
                 
                // code level validation
                let isValidRequest = true;
                let missingKeys = [];
                
            if(req.body.aadhar_last_four){
                const aadhaar = /^\d{4}$/;
                const aadhaarLastFour =  aadhaar.test(req.body.aadhar_last_four);
                if(!aadhaarLastFour){
                  {
                    isValidRequest = false;
                    missingKeys.push(
                    "Please provide only last four digits of aadhar"
                  );
                  }
                }
                if (!isValidRequest) {
                    return res
                    .status(400)
                    .send({ status:"fail" , message: "Invalid request! Please add last four digits of aadhar" });
                }
            }
                //s3 url
                const url = req.service.file_s3_path;
                //fetch template from s3
                const resJson = await s3helper.fetchJsonFromS3(
                    url.substring(url.indexOf("services"))
                );
                if (!resJson)
                    throw {
                        message: "Error while finding temlate from s3",
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
                    };
                if (result.unknownColumns.length)
                    throw {
                        message: result.unknownColumns[0],
                    };
                if (result.missingColumns.length)
                    throw {
                        message: result.missingColumns[0],
                    };
                if (result.errorRows.length)
                    throw {
                        message: Object.values(result.exactErrorColumns[0])[0],
                    };

                //Karza data
                const karzaData = {
                    pan: req.body.pan,
                    aadhaarLastFour: req.body.aadhar_last_four,
                    dob: req.body.dob,
                    name: req.body.name,
                    address: req.body.address,
                    getContactDetails: req.body.get_contact_details,
                    PANStatus: req.body.pan_status,
                    isSalaried: req.body.is_salaried,
                    isDirector: req.body.is_director,
                    isSoleProp: req.body.is_sole_prop,
                    consent: req.body.consent,
                    loan_app_id: req.body.loan_app_id,
                    consent_timestamp: req.body.consent_timestamp,
                };
                //Karza url
                const karzaPanDetailsURL = process.env.KARZA_URL + "v3/pan-profile";
                //X-karza-key
                const key = process.env.KARZA_API_KEY;
                //Headers
                const config = {
                    headers: {
                        "x-karza-key": key,
                        "Content-Type": "application/json",
                    },
                };

                //generic data to be stored in database(request data / response data)
                var panDetailData = {
                    company_id: req.company._id,
                    company_code: req.company.code,
                    vendor_name: "KARZA",
                    service_id: process.env.SERVICE_PAN_PROFILE_DETAILS_KYC_ID,
                    api_name: "PAN-PROFILE-DETAILS-KYC",
                    timestamp: Date.now(),
                    consent: req.body.consent,
                    consent_timestamp: req.body.consent_timestamp,
                    loan_app_id: req.body.loan_app_id,
                    request_id: req.body.request_id,
                    raw_data: "",
                    response_type: "",
                    request_type: "",
                    document_uploaded_s3: "",
                    api_response_type: "JSON",
                    api_response_status: "",
                };

                let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
                const reqKey = `${panDetailData.api_name}/${panDetailData.vendor_name}/${panDetailData.company_id}/${filename}/${panDetailData.timestamp}.txt`;

                //upload request data on s3
                const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
                if (!uploadResponse) {
                    (panDetailData.document_uploaded_s3 = 0), (panDetailData.response_type = "error");
                } else {
                    panDetailData.document_uploaded_s3 = 1;
                    panDetailData.response_type = "success";
                }
                panDetailData.api_response_status = "SUCCESS";
                panDetailData.raw_data = uploadResponse.Location;
                panDetailData.reqdata = uploadResponse.Location;
                panDetailData.request_type = "request";

                if (req.body.consent === "N") {
                    panDetailData.response_type = "error";
                    panDetailData.api_response_status = "FAIL";
                }

                //insert request data s3 upload response to database
                const addServiceBureau = await bureau.addNew(panDetailData);
                if (!addServiceBureau)
                    throw {
                        message: "Error while adding request data",
                        success: false,
                    };
                if (req.body.consent === "N") {
                    return res
                        .status(400)
                        .send({
                            request_id: req.company.code + "-PAN-PROFILE-DETAILS-KYC-" + Date.now(),
                            message: "Consent was not provided",
                        });
                };

                //call karza api after successfully uploading request data to s3
                axios
                    .post(karzaPanDetailsURL, JSON.stringify(karzaData), config)
                    .then(async (response) => {
                        //response data from karza to upload on s3
                        filename = Math.floor(10000 + Math.random() * 99999) + "_res";
                        //upload response data from karza on s3
                        const resKey = `${panDetailData.api_name}/${panDetailData.vendor_name}/${panDetailData.company_id}/${filename}/${panDetailData.timestamp}.txt`;
                        const uploadResponse = await s3helper.uploadFileToS3(
                            response.data,
                            resKey
                        );
                        if (!uploadResponse) {
                            (panDetailData.document_uploaded_s3 = 0),
                                (panDetailData.response_type = "error");
                        }
                        panDetailData.document_uploaded_s3 = 1;
                        panDetailData.response_type = "success";
                        panDetailData.raw_data = uploadResponse.Location;
                        panDetailData.resdata = uploadResponse.Location;
                        panDetailData.request_type = "response";
                        if (response.data["statusCode"] == 101) {
                            (panDetailData.api_response_status = "SUCCESS"),
                                (panDetailData.kyc_id = `${req.company.code}-PAN-PROFILE-DETAILS-${Date.now()}`);
                        } else {
                            panDetailData.api_response_status = "FAIL";
                        }
                        //insert call ekyc check
                        const data = {
                            company_id: req.company._id,
                            loan_app_id: req.body.loan_app_id,
                            kyc_type: panDetailData.api_name,
                            req_url: panDetailData.reqdata,
                            res_url: panDetailData.resdata,
                            consent: req.body.consent,
                            consent_timestamp: req.body.consent_timestamp,
                            id_number: req.body.pan,
                            created_at: Date.now(),
                            created_by: req.company.code,
                        };
                        const addEKYCData = await kycdata.addNew(data);
                        if (!addEKYCData)
                            throw {
                                message: "Error while adding ekyc data",
                                success: false,
                            };
                        //insert response data s3 upload response to database
                        const serviceBureau = await bureau.addNew(panDetailData);
                        if (!serviceBureau)
                            throw {
                                message: "Error while adding response data to database",
                            };
                        // //send final response
                        if (panDetailData.api_response_status == "SUCCESS") {
                            return res.send({
                                kyc_id: serviceBureau.kyc_id,
                                data: response.data,
                                success: true,
                            });
                        } else {
                            return res.send({
                                kyc_id: serviceBureau.kyc_id,
                                data: response.data,
                                success: false,
                            });
                        }
                    })
                    .catch((error) => {
                        //handle error catched from karza api
                     return res.status(500).send({
                            requestId : `${req.company.code}-PAN-PROFILE-${Date.now()}`,
                            message: "Please contact the administrator",
                            status: "fail",
                          });
                    });
            } catch (error) {
               return res.status(500).send({
                    requestId : `${req.company.code}-PAN-PROFILE-${Date.now()}`,
                    message: "Please contact the administrator",
                    status: "fail",
                  });
            }
        }
    );
};