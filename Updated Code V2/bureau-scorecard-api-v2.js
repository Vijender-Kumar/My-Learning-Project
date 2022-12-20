const bodyParser = require("body-parser");
const axios = require("axios");
const BureauScorecards = require("../models/bureau-scorecard-schema");
const PartnerBureauDetails = require("../models/partner-bureau-details-schema");
const BureauScoreWebhookSchema = require("../models/bureau-scorecard-webhook-schema");
const ServiceReqResLog = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
const { CommonBureauMapper_v2 } = require("../util/common-bureau-mapper");
const moment = require('moment');
const getAge = (dob) => {
    let age = moment().diff(dob, 'years');
    return age;
}

const getDate = () => {
    let d = new Date();
    let dateNow = moment(d).format('YYYY-MM-DD');
    return dateNow;
}

const localLogTemplate = {
    company_id: "",
    company_code: "",
    sub_company_code: "",
    vendor_name: "ARTHMATE",
    loan_id: null,
    borrower_id: null,
    loan_app_id: "",
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

async function verifyRequestWithTemplate(templateS3url, s3LogData) {

    // 2. fetch upload template from s3
    const templateResponse = await s3helper.fetchJsonFromS3(
        templateS3url.substring(templateS3url.indexOf("services"))
    );

    if (!templateResponse)
        throw {
            message: "Error while finding template from s3"
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
    if (!templateValidation) throw {
        message: "No records found"
    };
    if (templateValidation.unknownColumns.length)
        throw {
            message: templateValidation.unknownColumns[0]
        };
    if (templateValidation.missingColumns.length)
        throw {
            message: templateValidation.missingColumns[0]
        };
    if (templateValidation.errorRows.length)
        throw {
            message: Object.values(templateValidation.exactErrorColumns[0])[0],
        };
}

function initLocalLogData(req, optionals = {}) {
    let localLogData = { ...localLogTemplate };
    localLogData.company_id = req.company._id;
    localLogData.company_code = req.company.code;
    localLogData.loan_app_id = req.body.loan_app_id;
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
// todo: confirm the implementation approach from Mainak
async function makeCrifCall(requestBody, gen_request_id) {
    try {
        var reqData =
        {
            "borrower_name_1": `${requestBody.first_name} ${requestBody.last_name}`,
            "dob": requestBody.dob,
            "borrower_id_type": "ID07",
            "borrower_id_number": requestBody.pan,
            "gender": requestBody.gender.toUpperCase() === "FEMALE" ? "G01" : requestBody.gender.toUpperCase() === "MALE" ? "G02" : "G03",
            "borrower_telephone_num": requestBody.mobile_number,
            "borrower_telephone_num_type": "P01",
            "borrower_address_type": "D01",
            "borrower_address": requestBody.address,
            "borrower_city": requestBody.city,
            "borrower_state": requestBody.state_code,
            "borrower_pincode": requestBody.pin_code,
            "enquiry_purpose": requestBody.enquiry_purpose,
            "enquiry_stage": requestBody.enquiry_stage,
            "loan_amount": requestBody.enquiry_amount,
            "borrower_age": getAge(requestBody.dob),
            "borrower_age_as_on": getDate(),
            "loan_app_id": requestBody.loan_app_id,
            "consent": requestBody.consent,
            "consent_timestamp": requestBody.consent_timestamp
        }
        var appUrl = process.env.SERVICE_MS_URL + '/api/crif';
        const config = {
            headers: {
                "authorization": process.env.SERVICE_MS_TOKEN,
                "Content-Type": "application/json",
            },
        };
        var responseData = await axios.post(appUrl, reqData, config);
        return responseData;
    } catch (error) {
        return error.response;
    }

}

async function makeCibilCall(requestBody, gen_request_id) {
    try {
        var reqData =
        {
            "enquiry_amount": requestBody.enquiry_amount,
            "enquiry_purpose": requestBody.enquiry_purpose,
            "name_first_name_1": requestBody.first_name,
            "name_middle_name_1": " ",
            "name_last_name_1": requestBody.last_name,
            "name_birth_date_1": moment(requestBody.dob).format('DD') + moment(requestBody.dob).format('MM') + moment(requestBody.dob).format('YYYY'),
            "name_gender_1": requestBody.gender.toUpperCase() === "FEMALE" ? "1" : requestBody.gender.toUpperCase() === "MALE" ? "2" : "3",
            "tele_telephone_number_1": requestBody.mobile_number,
            "tele_telephone_type_1": "01",
            "id_id_number_1": requestBody.pan,
            "id_id_type_1": "01",
            "add_line1_1": requestBody.address,
            "add_line2_1": requestBody.address_line_2,
            "add_line3_1": requestBody.address_line_3,
            "add_line4_1": requestBody.address_line_4,
            "add_line5_1": requestBody.address_line_5,
            "add_state_code_1": requestBody.state_code,
            "add_pin_code_1": requestBody.pin_code,
            "add_address_category_1": "02",
            "add_residence_code_1": "01",
            "en_acc_account_number_1": requestBody.en_acc_account_number_1,
            "loan_app_id": requestBody.loan_app_id,
            "consent": requestBody.consent,
            "consent_timestamp": requestBody.consent_timestamp
        }
        const appUrl = `${process.env.SERVICE_MS_URL}/api/cibil-verify`;
        const config = {
            headers: {
                "authorization": process.env.SERVICE_MS_TOKEN,
                "Content-Type": "application/json",
            },
        };
        var responseData = await axios.post(appUrl, reqData, config);
        return responseData;
    } catch (err) {
        return err.response;
    }
}

async function makeExperianCall(requestBody, gen_request_id) {
    const reqData = {
        "customer_reference_id": requestBody.customer_reference_id,
        "ft_reference_number": requestBody.ft_reference_number,
        "enquiry_reason": requestBody.enquiry_reason,
        "finance_purpose": requestBody.finance_purpose,
        "amount_financed": requestBody.amount_financed,
        "duration_of_agreement": requestBody.duration_of_agreement,
        "score_flag": requestBody.score_flag,
        "psv_flag": requestBody.psv_flag,
        "last_name": requestBody.last_name,
        "first_name": requestBody.first_name,
        "middle_name_1": requestBody.middle_name_1,
        "middle_name_2": requestBody.middle_name_2,
        "middle_name_3": requestBody.middle_name_3,
        "gender_code": requestBody.gender,
        "income_tax_pan": requestBody.income_tax_pan,
        "pan_issue_date": requestBody.pan_issue_date,
        "pan_expiration_date": requestBody.pan_expiration_date,
        "passport_number": requestBody.passport_number,
        "passport_issue_date": requestBody.passport_issue_date,
        "passport_expiration_date": requestBody.passport_expiration_date,
        "voter_identity_card": requestBody.voter_identity_card,
        "voter_id_issue_date": requestBody.voter_id_issue_date,
        "voter_id_expiration_date": requestBody.voter_id_expiration_date,
        "driver_license_number": requestBody.driver_license_number,
        "driver_license_issue_date": requestBody.driver_license_issue_date,
        "driver_license_expiration_date": requestBody.driver_license_expiration_date,
        "ration_card_number": requestBody.ration_card_number,
        "ration_card_issue_date": requestBody.ration_card_issue_date,
        "ration_card_expiration_date": requestBody.ration_card_expiration_date,
        "universal_id_number": requestBody.universal_id_number,
        "universal_id_issue_date": requestBody.universal_id_issue_date,
        "universal_id_expiration_date": requestBody.universal_id_expiration_date,
        "date_of_birth": requestBody.date_of_birth,
        "std_phone_number": requestBody.std_phone_number,
        "phone_number": requestBody.phone_number,
        "telephone_extension": requestBody.telephone_extension,
        "telephone_type": requestBody.telephone_type,
        "mobile_phone": requestBody.mobile_phone,
        "email_id": requestBody.email_id,
        "income": requestBody.income,
        "marital_status": requestBody.marital_status,
        "employ_status": requestBody.employ_status,
        "time_with_employ": requestBody.time_with_employ,
        "number_of_major_credit_card_held": requestBody.number_of_major_credit_card_held,
        "flat_no_plot_no_house_no": requestBody.flat_no_plot_no_house_no,
        "bldg_no_society_name": requestBody.bldg_no_society_name,
        "road_no_name_area_locality": requestBody.road_no_name_area_locality,
        "city": requestBody.city,
        "landmark": requestBody.landmark,
        "state": requestBody.state,
        "pin_code": requestBody.pin_code,
        "flag": requestBody.flag,
        "add_flat_no_plot_no_house_no": requestBody.add_flat_no_plot_no_house_no,
        "add_bldg_no_society_name": requestBody.add_bldg_no_society_name,
        "add_road_no_name_area_locality": requestBody.add_road_no_name_area_locality,
        "add_city": requestBody.add_city,
        "add_landmark": requestBody.add_landmark,
        "add_state": requestBody.add_state,
        "add_pin_code": requestBody.add_pin_code,
        "loan_app_id": requestBody.loan_app_id,
        "consent": requestBody.consent,
        "consent_timestamp": requestBody.consent_timestamp
    };
    //Headers
    const appUrl = process.env.SERVICE_MS_URL + '/api/experian-consumer-cirv2';
    const config = {
        headers: {
            "Content-Type": "application/json",
            "authorization": process.env.SERVICE_MS_TOKEN
        }
    };
    var responseData = await axios.post(appUrl, reqData, config);
    return responseData;
}

async function makeBureauCall(bureauType, requestBody, gen_request_id) {

    switch (bureauType) {
        case 'crif':
            return makeCrifCall(requestBody, gen_request_id);
        case 'cibil':
            return makeCibilCall(requestBody, gen_request_id);
        case 'experian':
            return makeExperianCall(requestBody, gen_request_id);
        default:
            return null;
    }
}

module.exports = (app) => {
    app.use(bodyParser.json());
    // api for bureau-scorecard-v2
    app.post(
        "/api/bureau-scorecard-v2",
        [
            jwt.verifyToken,
            jwt.verifyUser,
            jwt.verifyCompany,
            services.isServiceEnabled(process.env.SERVICE_BUREAU_SCORECARD_V2_ID),
        ],
        async (req, res) => {
            try {
                // validate api-request with service template
                await verifyRequestWithTemplate(req.service.file_s3_path, req.body);
                if (!process.env.PRODUCT_TYPE_CODE.includes(req.body.product_type))
                    throw {
                        message: "Product type not matching!!!",
                    };
                if (req.body.tenure < 0)
                    throw {
                        message: "Tenure should be greater than equal to 0",
                    };
                if (req.body.enquiry_amount < 0)
                    throw {
                        message: "Enquiry amount should be greater than equal to 0",
                    };

                // initialize local-logging object
                const localLogData = initLocalLogData(req, {
                    service_id: process.env.SERVICE_BUREAU_SCORECARD_V2_ID,
                    api_name: "BUREAU-SCORECARD-V2",
                    pan_card: req.body.pan,
                });

                if (req.body.consent === "N") {
                    localLogData.response_type = "error";
                    localLogData.api_response_status = "FAIL";
                }
                const gen_request_id = `${req.company.code}-BUREAU-SCORECARD-V2-${Date.now()}`;

                // log received client data
                const createdLogs = await createLog(
                    {
                        gen_request_id,
                        ...req.body,
                    },
                    localLogData,
                    true
                );

                if (req.body.consent === "N") {
                    return res.status(400).send({
                        request_id: gen_request_id,
                        message: "Consent was not provided",
                    });
                }

                // create schema instance based on the gen_request_id
                const createSchemaResult = await BureauScorecards.add({
                    gen_request_id: gen_request_id,
                    client_data: req.body,
                    company_id: req.company._id,
                    bureau_type: req.body.bureau_type,
                    loan_app_id: req.body.loan_app_id
                });
                await BureauScorecards.updateBureauRequest(gen_request_id, createdLogs.raw_data);

                // invoke one-of-the-bureau apis (CRIF/CIBIL/EXPERIAN)
                const bureauResponse = await makeBureauCall(req.body.bureau_type, req.body, gen_request_id);

                if (bureauResponse && bureauResponse.data) {
                    var resData = req.body.bureau_type == 'cibil' ? bureauResponse.data.result : bureauResponse.data.data;

                    const responseUrl = await createLog(
                        resData,
                        localLogData,
                        false
                    );

                    await BureauScorecards.updateBureauResponse(gen_request_id, responseUrl.raw_data);
                    CommonBureauMapper_v2(req.body.loan_app_id, req.body.bureau_type, req.company._id, resData, req.body.enquiry_amount, req.body.tenure, req.body.product_type, gen_request_id, (err, bureauMapperRes) => {
                        if (err) {
                            BureauScorecards.updateMappedResponse(gen_request_id, err, 'FAILED');
                        } else {
                            BureauScorecards.updateMappedResponse(gen_request_id, bureauMapperRes, 'COMPLETED');
                        }
                    });
                } else {
                    await BureauScorecards.updateBureauResponse(gen_request_id, responseUrl.raw_data);
                }
                // send acknowledgement back to the client
                res.status(200).send({
                    request_id: gen_request_id,
                    message: "Your request is under processing...",
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

    // webhook for bureau-scorecard result
    app.post(
    "/api/bureau-scorecard-webhook",
    async (req, res) => {
        try {
        if(req.headers.authorization===process.env.BUREAU_WEBHOOK_TOKEN ){
            const createSchemaResult = await BureauScoreWebhookSchema.add({
                ...req.body
            });  
            res.status(200)
                .send({ message: "Webhook Data Received" });

            fetchedScoreDetails = await BureauScorecards.findByGenRequestId(req.body.request_id);
            const companyId = fetchedScoreDetails.company_id;
            fetchedPartnerDetails = await PartnerBureauDetails.findByCompanyID(companyId);

            var appUrl = fetchedPartnerDetails.webhook_url;
            const config = {
                headers: {
                    "Authorization": fetchedPartnerDetails.token,
                    "Content-Type": "application/json",
                    },
            };
            var responseData = await axios.post(appUrl, req.body, config);
            const reqData = {
                partner_status_sent:req.body.status,
                partner_status_code_sent:responseData.status
            }
            await BureauScorecards.updateById(req.body.request_id,reqData);
                return;
        }
        else{
            throw { message: "Invalid Token or Score Not Found" };
        }} 
        catch (error) {
            console.log(error);
            return res
                .status(400)
                .send(error.message);
        }},

);
};
