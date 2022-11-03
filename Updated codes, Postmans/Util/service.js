"use strict";
var compose = require("composable-middleware");
const Services = require("../models/services-schema");
const CompanyServices = require("../models/company-services-schema");
const cache = require("memory-cache");
// cache bearer token for 30 mins
const CACHE_EXPIRE = 30 * 60 * 1000;

const isServiceEnabled = (sid) => {
  return compose().use(async (req, res, next) => {
    try {
      if (req.authData.type === "service" || req.authData.type === "dash") {
        const service = await Services.findOneWithId(sid);
        if (!service)
          throw {
            message: "Error while finding if service is currently active.",
          };
        if (service.status !== 1)
          throw {
            message: "This service is currently inactive. Kindly contact support team.",
          };
        req.service = service;
        return next();
      } else {
        throw {
          message: "Invalid Token."
        };
      }
    } catch (error) {
      return res.status(400).send(error);
    }
  });
};

const isServiceEnabledCached = (sid) => {
  return compose().use(async (req, res, next) => {
    try {
      if (req.authData.type === "service" || req.authData.type === "dash") {
        const servicesRes = await Services.findOneWithCachedId(sid);
        if (!servicesRes) return res.status(400).json({
          message: "Error while finding if service is currently active."
        });
        if (servicesRes.status !== 1) return res.status(400).json({
          message: "This service is currently inactive. Kindly contact support team."
        });
        req.service = servicesRes;
        //Find company service with company id
        const companyServicesRes = await CompanyServices.findOneWithCompanyId(req.company._id);
        if (!companyServicesRes)
          return res.status(400).json({
            message: "This service is not available for your company. Kindly contact support team."
          });
        const serviceArr = companyServicesRes.services.split(",");
        if (serviceArr.indexOf(sid) > -1) return next();
        return res.status(400).json({
          message: "This service is not available for your company. Kindly contact support team."
        });
      } else {
        return res.status(400).json({
          message: "Invalid Token."
        });
      }
    } catch (error) {
      return res.status(400).json({
        message: error
      });
    }
  });
};

const isPaymentServiceEnabled = (sid) => {
  return compose().use((req, res, next) => {
    Services.findOneWithId(sid, (servicesErr, servicesRes) => {
      if (servicesErr || !servicesRes)
        return res.status(400).json({
          message: "Error while finding if service is currently active.",
        });
      if (servicesRes.status !== 1)
        return res.status(400).json({
          message: "This service is currently inactive. Kindly contact support team.",
        });
      req.service = servicesRes;
      //Find company service with company id
      CompanyServices.findOneWithCompanyId(req.company._id, (companyServiceErr, companyServicesRes) => {
        if (companyServiceErr)
          return res.status(400).json({
            message: "Error while finding company services in database",
            sucess: false,
          });
        if (!companyServicesRes)
          return res.status(400).json({
            message: "This service is not available for your company. Kindly contact support team.",
            sucess: false,
          });
        const serviceArr = companyServicesRes.services.split(",");
        if (serviceArr.indexOf(sid) > -1) return next();
        return res.status(400).json({
          message: "This service is not available for your company. Kindly contact support team.",
          sucess: false,
        });
      });
    });
  });
};

const getServiceTemplate = (sid) => {
  return compose().use((req, res, next) => {
    if (req.authData.type === "service" || req.authData.type === "dash") {
      Services.findOneWithId(sid, (servicesErr, servicesRes) => {
        if (servicesErr || !servicesRes)
          return res.status(400).json({
            message: "Error while finding if service is currently active.",
            sucess: false,
          });
        if (servicesRes.status !== 1)
          return res.status(400).json({
            message: "This service is currently inactive. Kindly contact support team.",
            sucess: false,
          });
        req.service = servicesRes;
        return next();
      });
    } else {
      return res.status(400).json({
        message: "Invalid Token.",
        sucess: false
      });
    }
  });
};

const getCibilV3PostData = (config) => {
  var {
    userID,
    password_userID,
    data,
    memberCode,
    memberCode_password
  } = config;
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
                                    <soapenv:Header />
                                    <soapenv:Body>
                                      <tem:ExecuteXMLString>
                                        <tem:request>
                                          <![CDATA[
                                    <DCRequest xmlns="http://transunion.com/dc/extsvc">
                                    <Authentication type="OnDemand">
                                    <UserId>${userID}</UserId>
                                    <Password>${password_userID}</Password>
                                    </Authentication>
                                    <RequestInfo>
                                    <ExecutionMode>NewWithContext</ExecutionMode>
                                    <SolutionSetId>107</SolutionSetId>
                                    <ExecuteLatestVersion>true</ExecuteLatestVersion>
                                    </RequestInfo>
                                    <Fields>
                                      <Field key="Applicants">
                                     &lt;Applicants&gt;
                                    &lt;Applicant&gt;
                                    &lt;ApplicantType&gt;Main&lt;/ApplicantType&gt;
                                    &lt;ApplicantFirstName&gt;${data.BorrowerFName}&lt;/ApplicantFirstName&gt;
                                    &lt;ApplicantMiddleName&gt;${data.BorrowerMName}&lt;/ApplicantMiddleName&gt;
                                    &lt;ApplicantLastName&gt;${data.BorrowerLName}&lt;/ApplicantLastName&gt;
                                    &lt;DateOfBirth&gt;${data.BorrowerDOB}&lt;/DateOfBirth&gt;
                                    &lt;Gender&gt;${data.BorrowerGender}&lt;/Gender&gt;
                                    &lt;EmailAddress&gt;${data.BorrowerEmail}&lt;/EmailAddress&gt;
                                    &lt;Identifiers&gt;
                                        &lt;Identifier&gt;
                                            &lt;IdNumber&gt;${data.Idnumber}&lt;/IdNumber&gt;
                                            &lt;IdType&gt;${data.Idtype}&lt;/IdType&gt;
                                        &lt;/Identifier&gt;
                                    &lt;/Identifiers&gt;
                                    &lt;Telephones&gt;
                                        &lt;Telephone&gt;
                                            &lt;TelephoneExtension&gt;&lt;/TelephoneExtension&gt;
                                            &lt;TelephoneNumber&gt;${data.BorrowerPhone}&lt;/TelephoneNumber&gt;
                                            &lt;TelephoneType&gt;${data.BorrowerPhoneType}&lt;/TelephoneType&gt;
                                        &lt;/Telephone&gt;
                                    &lt;/Telephones&gt;
                                    &lt;Addresses&gt;
                                        &lt;Address&gt;
                                            &lt;AddressLine1&gt;${data.Borrower_Addr1}&lt;/AddressLine1&gt;
                                            &lt;AddressLine2&gt;${data.Borrower_Addr2}&lt;/AddressLine2&gt;
                                            &lt;AddressLine3&gt;${data.Borrower_Addr3}&lt;/AddressLine3&gt;
                                            &lt;AddressLine4&gt;${data.Borrower_Addr4}&lt;/AddressLine4&gt;
                                            &lt;AddressLine5&gt;${data.Borrower_Addr5}&lt;/AddressLine5&gt;
                                            &lt;AddressType&gt;${data.Borrower_AddrType}&lt;/AddressType&gt;
                                            &lt;City&gt;${data.Borrower_City}&lt;/City&gt;
                                            &lt;PinCode&gt;${data.Borrower_Pincode}&lt;/PinCode&gt;
                                            &lt;ResidenceType&gt;${data.Borrower_ResiType}&lt;/ResidenceType&gt;
                                            &lt;StateCode&gt;${data.Borrower_StateCode}&lt;/StateCode&gt;
                                        &lt;/Address&gt;
                                    &lt;/Addresses&gt;
                                    &lt;/Applicant&gt;
                                    &lt;/Applicants&gt;</Field>
                                    <Field key="ApplicationData">&lt;ApplicationData&gt;
                                    &lt;Purpose&gt;${data.Borrower_LoanPurpose}&lt;/Purpose&gt;
                                    &lt;Amount&gt;${data.Borrower_RequestAmount}&lt;/Amount&gt;
                                    &lt;ScoreType&gt;08&lt;/ScoreType&gt;
                                    &lt;MemberCode&gt;${memberCode}&lt;/MemberCode&gt;
                                    &lt;Password&gt;${memberCode_password}&lt;/Password&gt;
                                    &lt;NTCProductType&gt;&lt;/NTCProductType&gt;
                                    &lt;ConsumerConsentForUIDAIAuthentication&gt;${data.ConsumerConsentForUIDAIAuthentication}&lt;/ConsumerConsentForUIDAIAuthentication&gt;
                                    &lt;GSTStateCode&gt;${data.GSTStateCode}&lt;/GSTStateCode&gt;
                                    &lt;CibilBureauFlag&gt;false&lt;/CibilBureauFlag&gt;
                                    &lt;DSTuNtcFlag&gt;true&lt;/DSTuNtcFlag&gt;
                                    &lt;IDVerificationFlag&gt;false&lt;/IDVerificationFlag&gt;
                                    &lt;MFIBureauFlag&gt;true&lt;/MFIBureauFlag&gt;
                                    &lt;FormattedReport&gt;True&lt;/FormattedReport&gt;
                                    &lt;/ApplicationData&gt;</Field>
                                    </Fields>
                                    </DCRequest>]]>
                                    </tem:request>
                                    </tem:ExecuteXMLString>
                                    </soapenv:Body>
                                    </soapenv:Envelope>`;
};

module.exports = {
  isServiceEnabled,
  getServiceTemplate,
  isPaymentServiceEnabled,
  getCibilV3PostData,
  isServiceEnabledCached,
};