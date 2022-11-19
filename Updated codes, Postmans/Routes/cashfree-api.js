const bodyParser = require("body-parser");
const s3helper = require("../util/s3helper.js");
const validate = require("../util/validate-req-body.js");
var bureauService = require("../models/service-req-res-log-schema");
const jwt = require("../util/jwt");
const services = require("../util/service");
const axios = require("axios");

var genRequestId = (req)=>{
  const RequestId = `${req.company.code}-CASHFREE-${Date.now()}`;
  return RequestId;
}

module.exports = (app, connection) => {
  app.use(bodyParser.json());

  // Create Plan Subscription -- POST
  app.post(
    "/api/cf-subscription-plans",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_SUBSCRIPTION_PLANS_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        const data = req.body;
        if (req.body.type == "PERIODIC" && !req.body.intervals) {
          throw {
            message: "Please enter intervals"
          };
        }
        if (req.body.type == "PERIODIC" && !req.body.amount) {
          throw {
            message: "Please enter amount"
          };
        }
        if (req.body.type == "ON_DEMAND" && !req.body.max_amount) {
          throw {
            message: "Please enter max amount"
          };
        }
        if (req.body.type == "PERIODIC" && !req.body.interval_type) {
          throw {
            message: "Please enter interval type"
          };
        }
        const s3url = req.service.file_s3_path;
        //fetch template from s3
        const jsonS3Response = await s3helper.fetchJsonFromS3(
          s3url.substring(s3url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          message: "Error while finding temlate from s3"
        };

        //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(
          jsonS3Response,
          [data]
        );
        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!resValDataTemp) throw {
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
            message: Object.values(resValDataTemp.exactErrorColumns[0])[0],
          };
        //Cashfree Subscription Plan Data
        const subscriptionPlanApiData = JSON.stringify({
            planId: req.body.plan_id,
            planName: req.body.plan_name,
            type: req.body.type,
            maxCycles: req.body.max_cycles,
            amount: req.body.amount,
            maxAmount: req.body.max_amount,
            intervalType: req.body.interval_type,
            intervals: req.body.intervals,
            description: req.body.description,
        });
        //Cashfree create subscription plan url
        const url = process.env.CASHFREE_URL + "/api/v2/subscription-plans";
        //X-Cashfree ID and Secret
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };
        var subscriptionPlanData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_SUBSCRIPTION_PLANS_ID,
          api_name: "CF-SUBSCRIPTION-PLANS",
          // api_name: "cf-subscription-plans",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${subscriptionPlanData.api_name}/${subscriptionPlanData.vendor_name}/${subscriptionPlanData.company_id}/${filename}/${subscriptionPlanData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (subscriptionPlanData.document_uploaded_s3 = 0),
          (subscriptionPlanData.response_type = "error");
        }
        subscriptionPlanData.document_uploaded_s3 = 1;
        subscriptionPlanData.response_type = "success";
        subscriptionPlanData.api_response_status = "SUCCESS";
        subscriptionPlanData.raw_data = uploadResponse.Location;
        subscriptionPlanData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(subscriptionPlanData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription plan api after successfully uploading request data to s3
        axios
          .post(url, subscriptionPlanApiData, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${subscriptionPlanData.api_name}/${subscriptionPlanData.vendor_name}/${subscriptionPlanData.company_id}/${filename}/${subscriptionPlanData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (subscriptionPlanData.document_uploaded_s3 = 0),
              (subscriptionPlanData.response_type = "error");
            } else {
              subscriptionPlanData.document_uploaded_s3 = 1;
              subscriptionPlanData.response_type = "success";
            }
            subscriptionPlanData.raw_data = await uploadS3FileRes.Location;
            subscriptionPlanData.request_type = "response";
            if (response.data["status"] == "OK") {
              subscriptionPlanData.api_response_status = "SUCCESS";
            } else {
              subscriptionPlanData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const subscriptionPlanDataResp = await bureauService.addNew(
              subscriptionPlanData
            );
            if (!subscriptionPlanDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from subscription plan api
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  // Create Subcription -- POST
  app.post(
    "/api/cf-subscriptions",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        const data = req.body;
        //fetch template from s3
        const s3url = req.service.file_s3_path;
        //fetch template from s3
        const jsonS3Response = await s3helper.fetchJsonFromS3(
          s3url.substring(s3url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          message: "Error while finding temlate from s3"
        };
        // //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(
          jsonS3Response,
          [data]
        );
        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!resValDataTemp) throw {
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
            message: Object.values(resValDataTemp.exactErrorColumns[0])[0],
          };
        // Cashfree Subscription Data
        const subscriptionApiData = JSON.stringify({
          subscriptionId: req.body.subscription_id,
          planId: req.body.plan_id,
          customerName: req.body.customer_name,
          customerEmail: req.body.customer_email,
          customerPhone: req.body.customer_phone,
          firstChargeDate: req.body.first_charge_date,
          authAmount: req.body.auth_amount,
          expiresOn: req.body.expires_on,
          returnUrl: req.body.return_url,
          subscriptionNote: req.body.subscription_note,
          notificationChannels: req.body.notification_channels,
      });
        //Cashfree create plan url
        const url = process.env.CASHFREE_URL + "/api/v2/subscriptions";
        //X-Cashfree ID and Secret
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };
        var subscriptionData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_ID,
          api_name: "CF-SUBSCRIPTION",
          // api_name: "cf-subscriptions",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${subscriptionData.api_name}/${subscriptionData.vendor_name}/${subscriptionData.company_id}/${filename}/${subscriptionData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (subscriptionData.document_uploaded_s3 = 0),
          (subscriptionData.response_type = "error");
        }
        subscriptionData.document_uploaded_s3 = 1;
        subscriptionData.response_type = "success";
        subscriptionData.api_response_status = "SUCCESS";
        subscriptionData.raw_data = uploadResponse.Location;
        subscriptionData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(subscriptionData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription api after successfully uploading request data to s3
        axios
          .post(url, subscriptionApiData, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${subscriptionData.api_name}/${subscriptionData.vendor_name}/${subscriptionData.company_id}/${filename}/${subscriptionData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (subscriptionData.document_uploaded_s3 = 0),
              (subscriptionData.response_type = "error");
            } else {
              subscriptionData.document_uploaded_s3 = 1;
              subscriptionData.response_type = "success";
            }
            subscriptionData.raw_data = await uploadS3FileRes.Location;
            subscriptionData.request_type = "response";
            if (response.data["status"] == "OK") {
              subscriptionData.api_response_status = "SUCCESS";
            } else {
              subscriptionData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const subscriptionDataResp = await bureauService.addNew(
              subscriptionData
            );
            if (!subscriptionDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from subscription api
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  // Get Subscription details -- GET
  app.get(
    "/api/cf-subscriptions/:subReferenceId",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_GET_SUBSCRIPTIONS_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        if (!req.params.subReferenceId)
          throw {
            message: "Subscription reference id should not be empty"
          };

        const url = 
          process.env.CASHFREE_URL + 
          "/api/v2/subscriptions/" + 
          req.params.subReferenceId;
        //X-Cashfree ID and Secret
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };
        var getSubscriptionData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_GET_SUBSCRIPTIONS_ID,
          api_name: "CF-GET-SUBSCRIPTIONS",
          // api_name: "cf-subscriptions/:subReferenceId",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${getSubscriptionData.api_name}/${getSubscriptionData.vendor_name}/${getSubscriptionData.company_id}/${filename}/${getSubscriptionData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (getSubscriptionData.document_uploaded_s3 = 0),
          (getSubscriptionData.response_type = "error");
        }
        getSubscriptionData.document_uploaded_s3 = 1;
        getSubscriptionData.response_type = "success";
        getSubscriptionData.api_response_status = "SUCCESS";
        getSubscriptionData.raw_data = uploadResponse.Location;
        getSubscriptionData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(getSubscriptionData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription plan api after successfully uploading request data to s3
        axios
          .get(url, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${getSubscriptionData.api_name}/${getSubscriptionData.vendor_name}/${getSubscriptionData.company_id}/${filename}/${getSubscriptionData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (getSubscriptionData.document_uploaded_s3 = 0),
              (getSubscriptionData.response_type = "error");
            } else {
              getSubscriptionData.document_uploaded_s3 = 1;
              getSubscriptionData.response_type = "success";
            }
            getSubscriptionData.raw_data = await uploadS3FileRes.Location;
            getSubscriptionData.request_type = "response";
            if (response.data["status"] == "OK") {
              getSubscriptionData.api_response_status = "SUCCESS";
            } else {
              getSubscriptionData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const getSubscriptionDataResp = await bureauService.addNew(
              getSubscriptionData
            );
            if (!getSubscriptionDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from subscription plan api
            console.log(error);
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  // Get All Subscriptions -- GET
  app.get(
    "/api/cf-subscriptions/:subReferenceId/payments",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_GET_SUBSCRIPTIONS_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        if (!req.params.subReferenceId)
          throw {
            message: "Subscription id should not be empty"
          };

        //Cashfree get subscription payments
        const url =
          process.env.CASHFREE_URL +
          "/api/v2/subscriptions/" +
          req.params.subReferenceId +
          "/payments" +
          "?lastId=" +
          req.query.lastId +
          "&count=" +
          req.query.count;
        //X-Cashfree ID and Secret
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };

        var getAllSubscriptionData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_GET_SUBSCRIPTIONS_ID,
          api_name: "CF-GET-ALL-SUBSCRIPTIONS",
          // api_name: "cf-subscriptions/:subReferenceId/payments",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${getAllSubscriptionData.api_name}/${getAllSubscriptionData.vendor_name}/${getAllSubscriptionData.company_id}/${filename}/${getAllSubscriptionData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (getAllSubscriptionData.document_uploaded_s3 = 0),
          (getAllSubscriptionData.response_type = "error");
        }
        getAllSubscriptionData.document_uploaded_s3 = 1;
        getAllSubscriptionData.response_type = "success";
        getAllSubscriptionData.api_response_status = "SUCCESS";
        getAllSubscriptionData.raw_data = uploadResponse.Location;
        getAllSubscriptionData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(getAllSubscriptionData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription plan api after successfully uploading request data to s3
        axios
          .get(url, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${getAllSubscriptionData.api_name}/${getAllSubscriptionData.vendor_name}/${getAllSubscriptionData.company_id}/${filename}/${getAllSubscriptionData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (getAllSubscriptionData.document_uploaded_s3 = 0),
              (getAllSubscriptionData.response_type = "error");
            } else {
              getAllSubscriptionData.document_uploaded_s3 = 1;
              getAllSubscriptionData.response_type = "success";
            }
            getAllSubscriptionData.raw_data = await uploadS3FileRes.Location;
            getAllSubscriptionData.request_type = "response";
            if (response.data["status"] == "OK") {
              getAllSubscriptionData.api_response_status = "SUCCESS";
            } else {
              getAllSubscriptionData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const getAllSubscriptionDataResp = await bureauService.addNew(
              getAllSubscriptionData
            );
            if (!getAllSubscriptionDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from get payment subscription plan api
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  // Get Single Subscription detail -- GET
  app.get(
    "/api/cf-subscriptions/:subReferenceId/payments/:paymentId",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_GET_SUBSCRIPTIONS_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        if (!req.params.subReferenceId)
          throw {
            message: "Subscription reference id should not be empty"
          };
        if (!req.params.paymentId)
          throw {
            message: "Payment id should not be empty"
          };

        const url =
          process.env.CASHFREE_URL +
          "/api/v2/subscriptions/" +
          req.params.subReferenceId +
          "/payments/" +
          req.params.paymentId;
        //X-Cashfree ID and Secret
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };
        var getSingleSubscriptionData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_GET_SUBSCRIPTIONS_ID,
          api_name: "CF-GET-SINGLE-SUBSCRIPTION",
          // api_name: "cf-subscriptions/:subReferenceId/payments/:paymentId",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${getSingleSubscriptionData.api_name}/${getSingleSubscriptionData.vendor_name}/${getSingleSubscriptionData.company_id}/${filename}/${getSingleSubscriptionData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (getSingleSubscriptionData.document_uploaded_s3 = 0),
          (getSingleSubscriptionData.response_type = "error");
        }
        getSingleSubscriptionData.document_uploaded_s3 = 1;
        getSingleSubscriptionData.response_type = "success";
        getSingleSubscriptionData.api_response_status = "SUCCESS";
        getSingleSubscriptionData.raw_data = uploadResponse.Location;
        getSingleSubscriptionData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(getSingleSubscriptionData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription plan api after successfully uploading request data to s3
        axios
          .get(url, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${getSingleSubscriptionData.api_name}/${getSingleSubscriptionData.vendor_name}/${getSingleSubscriptionData.company_id}/${filename}/${getSingleSubscriptionData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (getSingleSubscriptionData.document_uploaded_s3 = 0),
              (getSingleSubscriptionData.response_type = "error");
            } else {
              getSingleSubscriptionData.document_uploaded_s3 = 1;
              getSingleSubscriptionData.response_type = "success";
            }
            getSingleSubscriptionData.raw_data = await uploadS3FileRes.Location;
            getSingleSubscriptionData.request_type = "response";
            if (response.data["status"] == "OK") {
              getSingleSubscriptionData.api_response_status = "SUCCESS";
            } else {
              getSingleSubscriptionData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const getSingleSubscriptionDataResp = await bureauService.addNew(
              getSingleSubscriptionData
            );
            if (!getSingleSubscriptionDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from subscription plan api
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  // Cancel Subscription  -- POST
  app.post(
    "/api/cf-subscriptions-cancel",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_CANCEL_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        const data = req.body;
        //fetch template from s3
        const s3url = req.service.file_s3_path;
        //fetch template from s3
        const jsonS3Response = await s3helper.fetchJsonFromS3(
          s3url.substring(s3url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          message: "Error while finding temlate from s3"
        };
        // //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(
          jsonS3Response,
          [data]
        );
        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!resValDataTemp) throw {
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
            message: Object.values(resValDataTemp.exactErrorColumns[0])[0],
          };

        const url = 
          process.env.CASHFREE_URL + 
          "/api/v2/subscriptions/" + 
          req.body.sub_reference_id + 
          "/cancel";
        //X-Cashfree ID and Secret
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };
        var cancelSubscriptionData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_CANCEL_ID,
          api_name: "CF-CANCEL-SUBSCRIPTION",
          // api_name: "cf-subscriptions-cancel",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${cancelSubscriptionData.api_name}/${cancelSubscriptionData.vendor_name}/${cancelSubscriptionData.company_id}/${filename}/${cancelSubscriptionData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (cancelSubscriptionData.document_uploaded_s3 = 0),
          (cancelSubscriptionData.response_type = "error");
        }
        cancelSubscriptionData.document_uploaded_s3 = 1;
        cancelSubscriptionData.response_type = "success";
        cancelSubscriptionData.api_response_status = "SUCCESS";
        cancelSubscriptionData.raw_data = uploadResponse.Location;
        cancelSubscriptionData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(cancelSubscriptionData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription plan api after successfully uploading request data to s3
        axios
          .post(url, {}, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${cancelSubscriptionData.api_name}/${cancelSubscriptionData.vendor_name}/${cancelSubscriptionData.company_id}/${filename}/${cancelSubscriptionData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (cancelSubscriptionData.document_uploaded_s3 = 0),
              (cancelSubscriptionData.response_type = "error");
            } else {
              cancelSubscriptionData.document_uploaded_s3 = 1;
              cancelSubscriptionData.response_type = "success";
            }
            cancelSubscriptionData.raw_data = await uploadS3FileRes.Location;
            cancelSubscriptionData.request_type = "response";
            if (response.data["status"] == "OK") {
              cancelSubscriptionData.api_response_status = "SUCCESS";
            } else {
              cancelSubscriptionData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const cancelSubscriptionDataResp = await bureauService.addNew(
              cancelSubscriptionData
            );
            if (!cancelSubscriptionDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from subscription plan api
            console.log(error);
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  // Charge Subscription -- POST
  app.post(
    "/api/cf-subscriptions-charge",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_CHARGE_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        const data = req.body;
        //fetch template from s3
        const s3url = req.service.file_s3_path;
        //fetch template from s3
        const jsonS3Response = await s3helper.fetchJsonFromS3(
          s3url.substring(s3url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          message: "Error while finding temlate from s3"
        };
        // //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(
          jsonS3Response,
          [data]
        );
        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!resValDataTemp) throw {
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
            message: Object.values(resValDataTemp.exactErrorColumns[0])[0],
          };
        //Cashfree create plan url
        const url = 
          process.env.CASHFREE_URL + 
          "/api/v2/subscriptions/" + 
          req.body.sub_reference_id + 
          "/charge";
        //X-Cashfree ID and Secret
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };
        var chargeSubscriptionApiData = {
          amount: req.body.amount,
          scheduledOn: req.body.scheduled_on,
          remarks: req.body.remarks,
        };
        var chargeSubscriptionData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_CHARGE_ID,
          api_name: "CF-CHARGE-SUBSCRIPTION",
          // api_name: "cf-subscriptions-charge",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${chargeSubscriptionData.api_name}/${chargeSubscriptionData.vendor_name}/${chargeSubscriptionData.company_id}/${filename}/${chargeSubscriptionData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (chargeSubscriptionData.document_uploaded_s3 = 0),
          (chargeSubscriptionData.response_type = "error");
        }
        chargeSubscriptionData.document_uploaded_s3 = 1;
        chargeSubscriptionData.response_type = "success";
        chargeSubscriptionData.api_response_status = "SUCCESS";
        chargeSubscriptionData.raw_data = uploadResponse.Location;
        chargeSubscriptionData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(chargeSubscriptionData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription plan api after successfully uploading request data to s3
        axios
          .post(url, chargeSubscriptionApiData, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${chargeSubscriptionData.api_name}/${chargeSubscriptionData.vendor_name}/${chargeSubscriptionData.company_id}/${filename}/${chargeSubscriptionData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (chargeSubscriptionData.document_uploaded_s3 = 0),
              (chargeSubscriptionData.response_type = "error");
            } else {
              chargeSubscriptionData.document_uploaded_s3 = 1;
              chargeSubscriptionData.response_type = "success";
            }
            chargeSubscriptionData.raw_data = await uploadS3FileRes.Location;
            chargeSubscriptionData.request_type = "response";
            if (response.data["status"] == "OK") {
              chargeSubscriptionData.api_response_status = "SUCCESS";
            } else {
              chargeSubscriptionData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const chargeSubscriptionDataResp = await bureauService.addNew(
              chargeSubscriptionData
            );
            if (!chargeSubscriptionDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from subscription charge api
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  // Retry Payment -- POST
  app.post(
    "/api/cf-subscriptions-charge-retry",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_CHARGE_RETRY_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        const data = req.body;
        const s3url = req.service.file_s3_path;
        //fetch template from s3
        const jsonS3Response = await s3helper.fetchJsonFromS3(
          s3url.substring(s3url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          message: "Error while finding temlate from s3"
        };
        // //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(
          jsonS3Response,
          [data]
        );
        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!resValDataTemp) throw {
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
            message: Object.values(resValDataTemp.exactErrorColumns[0])[0],
          };
        //Cashfree create plan url
        const url = 
          process.env.CASHFREE_URL + 
          "/api/v2/subscriptions/" + 
          req.body.sub_reference_id + 
          "/charge-retry";
        //X-Cashfree ID and Secret
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };
        var retryPaymentApiData = {
          nextScheduledOn: req.body.next_scheduled_on,
        };
        var retryPaymentData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_CHARGE_RETRY_ID,
          api_name: "CF-CHARGE-RETRY-SUBSCRIPTION",
          // api_name: "cf-subscriptions-charge-retry",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${retryPaymentData.api_name}/${retryPaymentData.vendor_name}/${retryPaymentData.company_id}/${filename}/${retryPaymentData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (retryPaymentData.document_uploaded_s3 = 0),
          (retryPaymentData.response_type = "error");
        }
        retryPaymentData.document_uploaded_s3 = 1;
        retryPaymentData.response_type = "success";
        retryPaymentData.api_response_status = "SUCCESS";
        retryPaymentData.raw_data = uploadResponse.Location;
        retryPaymentData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(retryPaymentData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription plan api after successfully uploading request data to s3
        axios
          .post(url, retryPaymentApiData, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${retryPaymentData.api_name}/${retryPaymentData.vendor_name}/${retryPaymentData.company_id}/${filename}/${retryPaymentData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (retryPaymentData.document_uploaded_s3 = 0),
              (retryPaymentData.response_type = "error");
            } else {
              retryPaymentData.document_uploaded_s3 = 1;
              retryPaymentData.response_type = "success";
            }
            retryPaymentData.raw_data = await uploadS3FileRes.Location;
            retryPaymentData.request_type = "response";
            if (response.data["status"] == "OK") {
              retryPaymentData.api_response_status = "SUCCESS";
            } else {
              retryPaymentData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const retryPaymentDataResp = await bureauService.addNew(
              retryPaymentData
            );
            if (!retryPaymentDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from subscription charge-retry api
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  // Activate subscription -- POST
  app.post(
    "/api/cf-subscriptions-activate",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_SUBSCRIPTION_ACTIVATE_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        const data = req.body;
        const s3url = req.service.file_s3_path;
        //fetch template from s3
        const jsonS3Response = await s3helper.fetchJsonFromS3(
          s3url.substring(s3url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          message: "Error while finding temlate from s3"
        };
        // //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(
          jsonS3Response,
          [data]
        );
        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter(
            (x) => x.field != "sub_company_code"
          );
        }
        if (!resValDataTemp) throw {
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
            message: Object.values(resValDataTemp.exactErrorColumns[0])[0],
          };
        //Cashfree create plan url
        const url = 
          process.env.CASHFREE_URL +
          "/api/v2/subscriptions/" +
          req.body.sub_reference_id +
          "/activate";
        //X-Cashfree ID and Secret
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };
        var activateSubscriptionApiData = {
          nextScheduledOn: req.body.next_scheduled_on,
        };
        var activateSubscriptionData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_SUBSCRIPTION_ACTIVATE_ID,
          api_name: "CF-ACTIVATE-SUBSCRIPTION",
          // api_name: "cf-subscriptions-activate",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${activateSubscriptionData.api_name}/${activateSubscriptionData.vendor_name}/${activateSubscriptionData.company_id}/${filename}/${activateSubscriptionData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (activateSubscriptionData.document_uploaded_s3 = 0),
          (activateSubscriptionData.response_type = "error");
        }
        activateSubscriptionData.document_uploaded_s3 = 1;
        activateSubscriptionData.response_type = "success";
        activateSubscriptionData.api_response_status = "SUCCESS";
        activateSubscriptionData.raw_data = uploadResponse.Location;
        activateSubscriptionData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(activateSubscriptionData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription plan api after successfully uploading request data to s3
        axios
          .post(url, activateSubscriptionApiData, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${activateSubscriptionData.api_name}/${activateSubscriptionData.vendor_name}/${activateSubscriptionData.company_id}/${filename}/${activateSubscriptionData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (activateSubscriptionData.document_uploaded_s3 = 0),
              (activateSubscriptionData.response_type = "error");
            } else {
              activateSubscriptionData.document_uploaded_s3 = 1;
              activateSubscriptionData.response_type = "success";
            }
            activateSubscriptionData.raw_data = await uploadS3FileRes.Location;
            activateSubscriptionData.request_type = "response";
            if (response.data["status"] == "OK") {
              activateSubscriptionData.api_response_status = "SUCCESS";
            } else {
              activateSubscriptionData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const activateSubscriptionDataResp = await bureauService.addNew(
              activateSubscriptionData
            );
            if (!activateSubscriptionDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from subscription cancel api
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );

  // Cancel Charge  -- POST
  app.post(
    "/api/cf-subscriptions/:subReferenceId/charge/:chargeId/cancel",
    [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany],
    [
      services.isServiceEnabledCached(
        process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_CANCEL_CHARGE_ID
      ),
    ],
    async (req, res, next) => {
      try {
        var requestId = genRequestId(req);
        if (!req.params.subReferenceId)
          throw {
            message: "Subcription reference id should not be empty"
          };
        if (!req.params.chargeId)
          throw {
            message: "charge id should not be empty"
          };

        const url = 
          process.env.CASHFREE_URL +
          "/api/v2/subscription/"+
          req.params.subReferenceId +
          "/charge/" +
          req.params.chargeId +
          "/cancel";
        //X-Cashfree ID and Secret
        console.log(url);
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        //Headers
        const config = {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
            "X-Client-Secret": clientSecret,
          },
        };
        var cancelChargeData = {
          company_id: req.company && req.company._id ? req.company._id : null,
          company_code: req.company && req.company.code ? req.company.code : null,
          vendor_name: "CASHFREE",
          service_id: process.env.SERVICE_CASHFREE_SUBSCRIPTIONS_CANCEL_CHARGE_ID,
          api_name: "CF-CANCEL-CHARGE-SUBCRIPTION",
          // api_name: "cf-subscriptions/:subReferenceId/charge/:chargeId/cancel",
          raw_data: "",
          response_type: "",
          request_type: "",
          timestamp: Date.now(),
          document_uploaded_s3: "",
          api_response_type: "JSON",
          api_response_status: "",
          request_id: requestId
        };
        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${cancelChargeData.api_name}/${cancelChargeData.vendor_name}/${cancelChargeData.company_id}/${filename}/${cancelChargeData.timestamp}.txt`;
        //upload request data on s3
        const uploadResponse = await s3helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (cancelChargeData.document_uploaded_s3 = 0),
          (cancelChargeData.response_type = "error");
        }
        cancelChargeData.document_uploaded_s3 = 1;
        cancelChargeData.response_type = "success";
        cancelChargeData.api_response_status = "SUCCESS";
        cancelChargeData.raw_data = uploadResponse.Location;
        cancelChargeData.request_type = "request";
        //insert request data s3 upload response to database
        const addResult = await bureauService.addNew(cancelChargeData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        //call subscription plan api after successfully uploading request data to s3
        axios
          .post(url, {}, config)
          .then(async (response) => {
            //response data from subscription plan to upload on s3
            filename = Math.floor(10000 + Math.random() * 99999) + "_res";
            const resKey = `${cancelChargeData.api_name}/${cancelChargeData.vendor_name}/${cancelChargeData.company_id}/${filename}/${cancelChargeData.timestamp}.txt`;
            //upload response data from subscription plan create plan on s3
            const uploadS3FileRes = await s3helper.uploadFileToS3(
              response.data,
              resKey
            );
            if (!uploadS3FileRes) {
              (cancelChargeData.document_uploaded_s3 = 0),
              (cancelChargeData.response_type = "error");
            } else {
              cancelChargeData.document_uploaded_s3 = 1;
              cancelChargeData.response_type = "success";
            }
            cancelChargeData.raw_data = await uploadS3FileRes.Location;
            cancelChargeData.request_type = "response";
            if (response.data["status"] == "OK") {
              cancelChargeData.api_response_status = "SUCCESS";
            } else {
              cancelChargeData.api_response_status = "FAIL";
            }
            //insert response data s3 upload response to database
            const cancelChargeDataResp = await bureauService.addNew(
              cancelChargeData
            );
            if (!cancelChargeDataResp)
              throw {
                message: "Error while adding response data to database",
                request_id : requestId
              };
            //send final response
            response.data.request_id = requestId;
            return res.send(response.data);
          })
          .catch((error) => {
            //handle error catched from subscription cancel charge api
            if (error.response) {
              if (error.response.data){
                error.response.data.request_id = requestId;
                return res.status(422).json(error.response.data);
              } else {
                error.response.request_id = requestId;
                return res.status(422).json(error.response);
              }
            }else {
              error.request_id = requestId;
              return res.status(422).json(error)
            };
          });
      } catch (error) {
        return res.status(400).json(error);
      }
    }
  );
};