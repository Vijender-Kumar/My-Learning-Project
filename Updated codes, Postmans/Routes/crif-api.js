bodyParser = require("body-parser");
const axios = require('axios');
const helper = require('../util/s3helper.js');
const bureaurReqResLogSchema = require('../models/service-req-res-log-schema');
const moment = require('moment');
const jwt = require('../util/jwt');
const services = require('../util/service')
const AccessLog = require('../util/accessLog');
const validate = require("../util/validate-req-body.js");
const bureau_data = require("../models/bureau-data-schema");
const { verifyloanAppIdValidation } = require("../util/loan-app-id-validation");
module.exports = (app, connection) => {
  app.use(bodyParser.json());
  app.post('/api/crif', [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany, services.isServiceEnabled(process.env.SERVICE_CRIF_ID), AccessLog.maintainAccessLog, verifyloanAppIdValidation],
    async (req, res, next) => {
      const requestID =`${req.company.code}-CRIF-${Date.now()}`;
      try {
        const data = req.body;
        const url = req.service.file_s3_path;
        
        //fetch template from s3
        const jsonS3Response = await helper.fetchJsonFromS3(
          url.substring(url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          message: "Error while finding template from s3"
        };
        
        //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(jsonS3Response, [data]);

        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter((x) => x.field != "sub_company_code");
        }

        if (!resValDataTemp) throw {
          message: "No records found"
        };
        if (resValDataTemp.unknownColumns.length) throw {
          message: resValDataTemp.unknownColumns[0]
        };
        if (resValDataTemp.missingColumns.length) throw {
          message: resValDataTemp.missingColumns[0]
        };
        if (resValDataTemp.errorRows.length) throw {
          message: Object.values(resValDataTemp.exactErrorColumns[0])[0]
        };

        const ReferenceNo = 'b0Yf0000003fL7xEA456' + Math.floor(1000000000000 + Math.random() * 9000000000000);
        const postData = `<REQUEST-REQUEST-FILE><HEADER-SEGMENT><SUB-MBR-ID>MAMTA PROJECTS PRIVATE LIMITED</SUB-MBR-ID><INQ-DT-TM>${moment().format('DD-MM-YYYY HH:mm:ss')}</INQ-DT-TM><REQ-ACTN-TYP>SUBMIT</REQ-ACTN-TYP><TEST-FLG>HMTEST</TEST-FLG><AUTH-FLG>Y</AUTH-FLG><AUTH-TITLE>USER</AUTH-TITLE><RES-FRMT>XML</RES-FRMT><MEMBER-PRE-OVERRIDE>N</MEMBER-PRE-OVERRIDE><RES-FRMT-EMBD>Y</RES-FRMT-EMBD><MFI><INDV>true</INDV><SCORE>false</SCORE><GROUP>true</GROUP></MFI><CONSUMER><INDV>true</INDV><SCORE>true</SCORE></CONSUMER><IOI>true</IOI></HEADER-SEGMENT><INQUIRY><APPLICANT-SEGMENT><APPLICANT-NAME><NAME1>${data.borrower_name_1}</NAME1><NAME2>${data.borrower_name_2}</NAME2><NAME3></NAME3><NAME4></NAME4><NAME5></NAME5></APPLICANT-NAME><EMAILS><EMAIL>${data.email_id}</EMAIL></EMAILS><DOB><DOB-DATE>${moment(data.dob).format('DD/MM/YYYY')}</DOB-DATE><AGE>${data.borrower_age}</AGE><AGE-AS-ON>${moment().format('DD-MM-YYYY')}</AGE-AS-ON></DOB><IDS><ID><TYPE>${data.borrower_id_type}</TYPE><VALUE>${data.borrower_id_number}</VALUE></ID></IDS><GENDER>${data.gender}</GENDER><RELATIONS><RELATION><NAME>${data.borrower_father_name}</NAME><TYPE>K01</TYPE></RELATION></RELATIONS><KEY-PERSON><NAME>${data.borrower_mother_name}</NAME><TYPE>K03</TYPE></KEY-PERSON><NOMINEE><NAME>${data.borrower_nominee_name}</NAME><TYPE>K01</TYPE></NOMINEE><PHONES><PHONE><TELE-NO>${data.borrower_telephone_num}</TELE-NO><TELE-NO-TYPE>${data.borrower_telephone_num_type}</TELE-NO-TYPE></PHONE></PHONES></APPLICANT-SEGMENT><ADDRESS-SEGMENT><ADDRESS><TYPE>${data.borrower_address_type}</TYPE><ADDRESS-1>${data.borrower_address}</ADDRESS-1><CITY>${data.borrower_city}</CITY><STATE>${data.borrower_state}</STATE><PIN>${data.borrower_pincode}</PIN></ADDRESS></ADDRESS-SEGMENT><APPLICATION-SEGMENT><INQUIRY-UNIQUE-REF-NO>${moment().format('DDMMYYYYHHmmss') + ReferenceNo}</INQUIRY-UNIQUE-REF-NO><CREDT-INQ-PURPS-TYP>${data.enquiry_purpose}</CREDT-INQ-PURPS-TYP><CREDIT-INQUIRY-STAGE>${data.enquiry_stage}</CREDIT-INQUIRY-STAGE><CREDT-REQ-TYP>INDV</CREDT-REQ-TYP><BRANCH-ID>3008</BRANCH-ID><LOS-APP-ID>${ReferenceNo}</LOS-APP-ID><LOAN-AMOUNT>${data.loan_amount}</LOAN-AMOUNT></APPLICATION-SEGMENT></INQUIRY></REQUEST-REQUEST-FILE>`;

        var config = {
          method: 'post',
          url: process.env.CRIF_URL,
          headers: {
            'content-type': 'text/xml',
            'requestXML': postData,
            'userId': process.env.userIdCRIF,
            'password': process.env.passwordCRIF,
            'mbrid': process.env.mbridCRIF,
            'productType': process.env.productTypeCRIF,
            'productVersion': process.env.productVersionCRIF,
            'reqVolType': process.env.reqVolTypeCRIF
          }
        };

        const retype = 'request';
        const company_id = req.company._id;
        const company_code = req.company.code;
        const dates = moment().format('YYYY-MM-DD HH:mm:ss');
        const item = postData;
        const objData = {
          request_id: requestID,
          company_id: company_id,
          company_code: company_code,
          api_name: 'CRIF',
          service_id: process.env.SERVICE_CRIF_ID,
          response_type: 'success',
          request_type: 'request',
          timestamp: dates,
          pan_card: data.Idnumber,
          is_cached_response : 'FALSE',
          consent:data.consent,
          consent_timestamp: data.consent_timestamp,
          document_uploaded_s3: "1",
          api_response_type: 'XML',
          api_response_status: 'SUCCESS'
        }

        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${objData.api_name}/${objData.api_name}/${company_id}/${filename}/${Date.now()}.txt`;
        //upload request data on s3
        const uploadResponse = await helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (objData.document_uploaded_s3 = 0), (objData.response_type = "error");
        }
        objData.raw_data = uploadResponse.Location;
        //insert request data s3 upload response to database
          if(req.body.consent === "N"){
          objData.response_type = 'error',
          objData.api_response_status = "FAIL";
        //insert request data s3 upload response to database
            
          await bureaurReqResLogSchema.addNew(objData);
          return res.status(400).send({
            request_id: requestID,
            message: "Consent was not provided",
          });
          
        }else{
          const addResult = await bureaurReqResLogSchema.addNew(objData);
          if (!addResult) throw {
            message: "Error while adding request data"
          };
        }

      // Caching mechanism for getting request data from server.
           
          var cachedBureau = await bureau_data.findIfExists(req.body.loan_app_id,req.body.borrower_id_number,"SUCCESS","CRIF");
          console.log(cachedBureau);
          if(cachedBureau[0]){
          var cachedUrl = cachedBureau[0].res_url;
          const xmlS3Response = await helper.fetchXMLFromS3(
            cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
               );

          objData.request_type = 'response';
          objData.raw_data = cachedUrl;
          objData.is_cached_response = 'TRUE';
          //insert request data s3 upload response to database
          await bureaurReqResLogSchema.addNew(objData);    

          return res.status(200).send({
            requestId:requestID,
            data: xmlS3Response
          });
        }
        
        /*Call 3rd party API*/
        axios(config).then(async (response) => {
          const matchString = response.data.match(/SUCCESS/g)
          const api_response_status = matchString ? 'SUCCESS' : 'FAIL';
          const retype = 'response';
          let filename = Math.floor(10000 + Math.random() * 99999) + "_res";
          const resKey = `${objData.api_name}/${objData.api_name}/${company_id}/${filename}/${Date.now()}.txt`;
          //upload request data on s3
          const bureaurLogSchemaResponse = await helper.uploadFileToS3(response.data, resKey);
          if (!bureaurLogSchemaResponse) {
            (objData.document_uploaded_s3 = 0), (objData.response_type = "error");
          }
          objData.request_type = 'response';
          objData.raw_data = bureaurLogSchemaResponse.Location;
          objData.api_response_status = api_response_status;
          objData.is_cached_response = 'FALSE';
          //insert request data s3 upload response to database
          const addResult = await bureaurReqResLogSchema.addNew(objData);
          if(req.body.consent === "Y"){
            const crif_res_data = await addBureauData(req.body, uploadResponse.Location, bureaurLogSchemaResponse.Location, req.company._id, req.company.code,"SUCCESS",requestID);
          }
          if (!addResult) throw {
            message: "Error while adding response data"
          };
          if (api_response_status == 'FAIL') return res.status(400).send(response.data);
          return res.send({
            request_id: objData.request_id,
            data: response.data.replace(/(\r\n|\r|\n)/g, '')
          });

        }).catch(async (error) => {
          let filename = Math.floor(10000 + Math.random() * 99999) + "_res";
          const resKey = `${objData.api_name}/${objData.api_name}/${company_id}/${filename}/${Date.now()}.txt`;
          //upload request data on s3
          const uploadXmlDataResponse = await helper.uploadFileToS3(error, resKey);
          if(req.body.consent === "Y"){
            const crif_data = await addBureauData(req.body, uploadResponse.Location, uploadXmlDataResponse.Location, req.company._id, req.company.code,"FAIL",requestID);
          }
          if (!uploadXmlDataResponse) {
            (objData.document_uploaded_s3 = 0), (objData.response_type = "error");
          }
          objData.request_type = 'response';
          objData.api_response_type = 'JSON';
          objData.api_response_status = 'FAIL';
          objData.raw_data = uploadXmlDataResponse.Location
          //insert request data s3 upload response to database
          const addResult = await bureaurReqResLogSchema.addNew(objData);
          if (!addResult) throw {
            message: "Error while adding error data"
          };

          res.status(500).send({
            requestID: requestID,
            message: "Please contact the administrator",
            status: "fail"
          });

        })

      } catch (error) {
        res.status(500).send({
          requestID: requestID,
          message: "Please contact the administrator",
          status: "fail"
        });
      }
    }
  );

  app.post('/api/crif-minimal', [jwt.verifyToken, jwt.verifyUser, jwt.verifyCompany, services.isServiceEnabled(process.env.SERVICE_CRIF_MINIMAL_ID), AccessLog.maintainAccessLog, verifyloanAppIdValidation],
    async (req, res, next) => {
      const requestID =`${req.company.code}-CRIF-${Date.now()}`;
      try {
        const data = req.body;
        const url = req.service.file_s3_path;
        //fetch template from s3
        const jsonS3Response = await helper.fetchJsonFromS3(
          url.substring(url.indexOf("services"))
        );
        if (!jsonS3Response) throw {
          message: "Error while finding template from s3"
        };
        //validate the incoming template data with customized template data
        const resValDataTemp = validate.validateDataWithTemplate(jsonS3Response, [data]);

        if (resValDataTemp.missingColumns.length) {
          resValDataTemp.missingColumns = resValDataTemp.missingColumns.filter((x) => x.field != "sub_company_code");
        }

        if (!resValDataTemp) throw {
          message: "No records found"
        };
        if (resValDataTemp.unknownColumns.length) throw {
          message: resValDataTemp.unknownColumns[0]
        };
        if (resValDataTemp.missingColumns.length) throw {
          message: resValDataTemp.missingColumns[0]
        };
        if (resValDataTemp.errorRows.length) throw {
          message: Object.values(resValDataTemp.exactErrorColumns[0])[0]
        };

        const ReferenceNo = 'b0Yf0000003fL7xEA456' + Math.floor(1000000000000 + Math.random() * 9000000000000);
        const postData = `<REQUEST-REQUEST-FILE><HEADER-SEGMENT><SUB-MBR-ID>MAMTA PROJECTS PRIVATE LIMITED</SUB-MBR-ID><INQ-DT-TM>${moment().format('DD-MM-YYYY HH:mm:ss')}</INQ-DT-TM><REQ-ACTN-TYP>SUBMIT</REQ-ACTN-TYP><TEST-FLG>HMTEST</TEST-FLG><AUTH-FLG>Y</AUTH-FLG><AUTH-TITLE>USER</AUTH-TITLE><RES-FRMT>XML</RES-FRMT><MEMBER-PRE-OVERRIDE>N</MEMBER-PRE-OVERRIDE><RES-FRMT-EMBD>Y</RES-FRMT-EMBD><MFI><INDV>true</INDV><SCORE>false</SCORE><GROUP>true</GROUP></MFI><CONSUMER><INDV>true</INDV><SCORE>true</SCORE></CONSUMER><IOI>true</IOI></HEADER-SEGMENT><INQUIRY><APPLICANT-SEGMENT><APPLICANT-NAME><NAME1>${data.name}</NAME1><NAME2></NAME2><NAME3></NAME3><NAME4></NAME4><NAME5></NAME5></APPLICANT-NAME><DOB><DOB-DATE>${moment(data.dob).format('DD/MM/YYYY')}</DOB-DATE><AGE></AGE><AGE-AS-ON></AGE-AS-ON></DOB><IDS><ID><TYPE></TYPE><VALUE></VALUE></ID></IDS><RELATIONS><RELATION><NAME>${data.father_name}</NAME><TYPE>K01</TYPE></RELATION></RELATIONS><KEY-PERSON><NAME></NAME><TYPE></TYPE></KEY-PERSON><NOMINEE><NAME></NAME><TYPE></TYPE></NOMINEE><PHONES><PHONE><TELE-NO>${data.phone_number}</TELE-NO><TELE-NO-TYPE>P01</TELE-NO-TYPE></PHONE></PHONES></APPLICANT-SEGMENT><ADDRESS-SEGMENT><ADDRESS><TYPE>D01</TYPE><ADDRESS-1>${data.address}</ADDRESS-1><CITY>${data.city}</CITY><STATE>${data.state}</STATE><PIN>${data.pincode}</PIN></ADDRESS></ADDRESS-SEGMENT><APPLICATION-SEGMENT><INQUIRY-UNIQUE-REF-NO>${moment().format('DDMMYYYYHHmmss')+ReferenceNo}</INQUIRY-UNIQUE-REF-NO><CREDT-INQ-PURPS-TYP>ACCT-ORIG</CREDT-INQ-PURPS-TYP><CREDIT-INQUIRY-STAGE>PRE-DISB</CREDIT-INQUIRY-STAGE><CREDT-REQ-TYP>INDV</CREDT-REQ-TYP><BRANCH-ID>3008</BRANCH-ID><LOS-APP-ID>${ReferenceNo}</LOS-APP-ID><LOAN-AMOUNT></LOAN-AMOUNT></APPLICATION-SEGMENT></INQUIRY></REQUEST-REQUEST-FILE>`;

        var config = {
          method: 'post',
          url: process.env.CRIF_URL,
          headers: {
            'content-type': 'text/xml',
            'requestXML': postData,
            'userId': process.env.userIdCRIF,
            'password': process.env.passwordCRIF,
            'mbrid': process.env.mbridCRIF,
            'productType': process.env.productTypeCRIF,
            'productVersion': process.env.productVersionCRIF,
            'reqVolType': process.env.reqVolTypeCRIF
          }
        };

        const retype = 'request';
        const company_id = req.company._id;
        const company_code = req.company.code;
        const dates = moment().format('YYYY-MM-DD HH:mm:ss');
        const item = postData;
        const vendor_name = 'CRIF';
        const objData = {
          request_id: requestID,
          company_id: company_id,
          company_code: company_code,
          api_name: 'CRIF-MINIMAL',
          service_id: process.env.SERVICE_CRIF_MINIMAL_ID,
          response_type: 'success',
          request_type: 'request',
          timestamp: dates,
          pan_card: data.Idnumber,
          consent:data.consent,
          consent_timestamp: data.consent_timestamp,
          document_uploaded_s3: "1",
          api_response_type: 'XML',
          api_response_status: 'SUCCESS'
        }

        let filename = Math.floor(10000 + Math.random() * 99999) + "_req";
        const reqKey = `${objData.api_name}/${vendor_name}/${company_id}/${filename}/${Date.now()}.txt`;
        //upload request data on s3
        const uploadResponse = await helper.uploadFileToS3(req.body, reqKey);
        if (!uploadResponse) {
          (objData.document_uploaded_s3 = 0), (objData.response_type = "error");
        }
        objData.raw_data = uploadResponse.Location;
        //insert request data s3 upload response to database
        if(req.body.consent === "N"){
          objData.response_type = 'error',
          objData.api_response_status = "FAIL";
        //insert request data s3 upload response to database
            
        await bureaurReqResLogSchema.addNew(objData);
        
        return res.status(400).send({
          request_id: `${req.company.code}-CRIF-${Date.now()}`,
          message: "Consent was not provided",
        });
        
      }else{
        const addResult = await bureaurReqResLogSchema.addNew(objData);
        if (!addResult) throw {
          message: "Error while adding request data"
        };
        
      }

      // Caching mechanism for getting request data from server.
      
      var cachedBureau = await bureau_data.findIfExists(req.body.loan_app_id,req.body.borrower_id_number,"SUCCESS","CRIF");
      console.log(cachedBureau);
      if(cachedBureau[0]){
      var cachedUrl = cachedBureau[0].res_url;
      const xmlS3Response = await helper.fetchXMLFromS3(
        cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
           );

      objData.request_type = 'response';
      objData.raw_data = cachedUrl;
      objData.is_cached_response = 'TRUE';
      //insert request data s3 upload response to database
      await bureaurReqResLogSchema.addNew(objData);    

      return res.status(200).send({
        requestId:requestID,
        data: xmlS3Response
      });
    }

        /*Call 3rd party API*/       
        axios(config).then(async (response) => {
          const matchString = response.data.match(/SUCCESS/g)
          const api_response_status = matchString ? 'SUCCESS' : 'FAIL';
          const retype = 'response';
          let filename = Math.floor(10000 + Math.random() * 99999) + "_res";
          const resKey = `${objData.api_name}/${vendor_name}/${company_id}/${filename}/${Date.now()}.txt`;
          //upload request data on s3
          const bureaurLogSchemaResponse = await helper.uploadFileToS3(response.data, resKey);
          if (!bureaurLogSchemaResponse) {
            (objData.document_uploaded_s3 = 0), (objData.response_type = "error");
          }
          objData.request_type = 'response';
          objData.raw_data = bureaurLogSchemaResponse.Location,
            objData.api_response_status = api_response_status;
            objData.is_cached_response = 'FALSE';
          //insert request data s3 upload response to database
          const addResult = await bureaurReqResLogSchema.addNew(objData);
          if(req.body.consent === "Y"){
            const crif_res_data = await addBureauData(req.body, uploadResponse.Location, bureaurLogSchemaResponse.Location, req.company._id, req.company.code,"SUCCESS",requestID);
          }
          if (!addResult) throw {
            message: "Error while adding response data"
          };
          if (api_response_status == 'FAIL') return res.status(400).send(response.data);
          return res.send({
            request_id: objData.request_id,
            data: response.data.replace(/(\r\n|\r|\n)/g, '')
          });

        }).catch(async (error) => {
          let filename = Math.floor(10000 + Math.random() * 99999) + "_res";
          const resKey = `${objData.api_name}/${vendor_name}/${company_id}/${filename}/${Date.now()}.txt`;
          //upload request data on s3
          const uploadXmlDataResponse = await helper.uploadFileToS3(error, resKey);
          if(req.body.consent === "Y"){
            const crif_data = await addBureauData(req.body, uploadResponse.Location, uploadXmlDataResponse.Location, req.company._id, req.company.code,"FAIL",requestID);
          }
          if (!uploadXmlDataResponse) {
            (objData.document_uploaded_s3 = 0), (objData.response_type = "error");
          }
          objData.request_type = 'response';
          objData.api_response_type = 'JSON';
          objData.api_response_status = 'FAIL';
          objData.raw_data = uploadXmlDataResponse.Location
          //insert request data s3 upload response to database
          const addResult = await bureaurReqResLogSchema.addNew(objData);
          if (!addResult) throw {
            message: "Error while adding error data"
          };

          res.status(500).send({
            requestID: requestID,
            message: "Please contact the administrator",
            status: "fail",
            error: error
          });
        })

      } catch (error) {
          res.status(500).send({
          requestID: requestID,
          message: "Please contact the administrator",
          status: "fail",
          error: error
        });
      }
    }
  );

  async function addBureauData(data, reqKey, resKey, company_id, company_code,status,requestID){
      try{
        var req_data = {
          company_id:company_id,
          loan_app_id: data.loan_app_id,
          bureau_type: "CRIF",
          req_url:reqKey,
          res_url:resKey,
          status:status,
          request_id:requestID,
          pan: data.borrower_id_number,
          consent:data.consent,
          consent_timestamp: data.consent_timestamp,
          created_by:company_code,
          created_at: moment().format('YYYY-MM-DD HH:mm:ss')
        }
        var res = await bureau_data.addNew(req_data);
        return res;
      } catch(err){
        throw err;
      }
  }
}
