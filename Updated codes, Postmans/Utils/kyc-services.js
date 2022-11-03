"use strict";
const moment = require("moment");
const axios = require("axios");
var xmltojs = require("xml2js");
const s3helper = require("../util/s3helper.js");
const Compliance = require("../models/compliance-schema.js");
const BureauDetailsSchema = require("../models/bureau-data-schema");
const stateCode = require("../utils/stateCodeMapping.js");
const stateConvertion = require("../utils/stateConvertionMapping.js");

const convertXmlToJosn = async encodedXml => {
  return new Promise((resolve, reject) => {
    let buff = new Buffer.from(encodedXml, "base64");
    let text = buff.toString("ascii");
    let parsestring = xmltojs.parseString;
    parsestring(text, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
  });
};

const getAge = birthYear => {
  var currentYear = new Date().getFullYear();
  let age = currentYear - birthYear;
  return age;
};

const generateAddress = address => {
  let address_line_1 = "";
  let address_line_2 = "";
  let address_line_3 = "";
  let address_line_4 = "";
  let address_line_5 = "";
  address_line_1 = address;
  if (address.length > 40) {
    address_line_1 = address.substring(0, 40);
    address_line_2 = address.substring(40);
  }
  if (address.length > 80) {
    address_line_1 = address.substring(0, 40);
    address_line_2 = address.substring(40, 80);
    address_line_3 = address.substring(80);
  }
  if (address.length > 120) {
    address_line_1 = address.substring(0, 40);
    address_line_2 = address.substring(40, 80);
    address_line_3 = address.substring(80, 120);
    address_line_4 = address.substring(120);
  }
  if (address.length > 160) {
    address_line_1 = address.substring(0, 40);
    address_line_2 = address.substring(40, 80);
    address_line_3 = address.substring(80, 120);
    address_line_4 = address.substring(120, 160);
    address_line_5 = address.substring(160);
  }
  return {
    address_line_1,
    address_line_2,
    address_line_3,
    address_line_4,
    address_line_5
  };
};

const CKYCSearch = async (req, res, data) => {
  //prepare data to record in kyc service compliance table
  let complianceData = {
    company_id: req.company._id,
    product_id: req.product._id,
    loan_app_id: data.loan_app_id,
    pan: data.appl_pan,
    dob: data.dob
  };
  try {
    const ckycSerachData = {
      id_type: "C",
      id_no: data.appl_pan,
      loan_app_id: data.loan_app_id,
      consent: "Y",
      //created_at from loanrequest table
      consent_timestamp: moment().format("YYYY-MM-DD HH:mm:ss")
    };
    //prepare config data to make call to the ckyc search api
    const ckycSearchConfig = {
      method: "POST",
      url: `${process.env.SERVICE_MS_URL}/api/ckyc-search`,
      headers: {
        Authorization: process.env.SERVICE_MS_TOKEN,
        "Content-Type": "application/json"
      },
      data: ckycSerachData
    };
    //make call to the ckyc seach api
    const ckycSearchResp = await axios(ckycSearchConfig);
    if (ckycSearchResp.data) {
      //convert ckyc search xml response to json to get kyc_id
      const xmlToJson = await convertXmlToJosn(
        ckycSearchResp.data.data.encodedXml
      );
      return {
        success: true,
        ckyc_id: xmlToJson.PID_DATA.SearchResponsePID[0].CKYC_NO[0]
      };
    }
  } catch (error) {
    complianceData.ckyc_status = "N";
    //record kyc compliance data in tablec
    const recordCompliance = await Compliance.findIfExistAndRecord(
      data.loan_app_id,
      complianceData
    );
    return {
      success: false
    };
  }
};

const CKYCDownload = async (req, res, data) => {
  //prepare data to record in kyc service compliance table
  let complianceData = {
    company_id: req.company._id,
    product_id: req.product._id,
    loan_app_id: data.loan_app_id,
    pan: data.appl_pan,
    dob: data.dob
  };
  try {
    const ckycDownloadData = {
      ckyc_no: data.ckyc_id,
      auth_factor_type: "01",
      auth_factor: moment(data.dob).format("DD-MM-YYYY"),
      loan_app_id: data.loan_app_id,
      consent: "Y",
      consent_timestamp: moment().format("YYYY-MM-DD HH:mm:ss")
    };
    //prepare config data to make call to the ckyc search api
    const ckycDownloadConfig = {
      method: "POST",
      url: `${process.env.SERVICE_MS_URL}/api/ckyc-download-v2`,
      headers: {
        Authorization: process.env.SERVICE_MS_TOKEN,
        "Content-Type": "application/json"
      },
      data: ckycDownloadData
    };
    //make call to the ckyc seach api
    const ckycDownloadResp = await axios(ckycDownloadConfig);
    if (ckycDownloadResp.data) {
      complianceData.ckyc_status = "Y";
      //record kyc compliance data in table
      const recordCompliance = await Compliance.findIfExistAndRecord(
        data.loan_app_id,
        complianceData
      );
      return {success: true};
    }
  } catch (error) {
    complianceData.ckyc_status = "N";
    //record kyc compliance data in table
    const recordCompliance = await Compliance.findIfExistAndRecord(
      data.loan_app_id,
      complianceData
    );
    return {
      success: false
    };
  }
};

const PanKYC = async (req, res, data) => {
  //prepare data to record in kyc service compliance table
  let complianceData = {
    company_id: req.company._id,
    product_id: req.product._id,
    loan_app_id: data.loan_app_id,
    pan: data.appl_pan,
    dob: data.dob
  };
  const panKYCData = {
    pan: data.appl_pan,
    loan_app_id: data.loan_app_id,
    consent: "Y",
    consent_timestamp: moment().format("YYYY-MM-DD HH:mm:ss")
  };
  try {
    //prepare config data to make call to the pan kyc api
    const panKYCConfig = {
      method: "POST",
      url: `${process.env.SERVICE_MS_URL}/api/kz_pan_kyc`,
      headers: {
        Authorization: process.env.SERVICE_MS_TOKEN,
        "Content-Type": "application/json"
      },
      data: panKYCData
    };
    //make call to the pan kyc api
    const panKYCResp = await axios(panKYCConfig);
    if (panKYCResp.data) {
      complianceData.pan_status = "Y";
      //record kyc compliance data in table
      const recordCompliance = await Compliance.findIfExistAndRecord(
        data.loan_app_id,
        complianceData
      );
      return {success: true};
    }
  } catch (error) {
    complianceData.pan_status = "N";
    //record kyc compliance data in table
    const recordCompliance = await Compliance.findIfExistAndRecord(
      data.loan_app_id,
      complianceData
    );
    return {
      success: false
    };
  }
};

const BurauServiceCall = async (req, res, data) => {
  let complianceData = {
    company_id: req.company._id,
    product_id: req.product._id,
    loan_app_id: data.loan_app_id,
    pan: data.appl_pan,
    dob: data.dob
  };
  try {
    //check if bureau call is already made for loan_app_id or partner_loan_id
    const bureauRecordExist = await BureauDetailsSchema.findOneWithLAIDAndPLID(
      data.loan_app_id,
      data.partner_loan_app_id
    );
    // If bureau record exist then update bureau_status as Y in compliance table
    if (bureauRecordExist) {
      complianceData.bureau_status = "Y";
      const recordCompliance = await Compliance.findIfExistAndRecord(
        data.loan_app_id,
        complianceData
      );
    }
    //If bureau record not exist then make call to the bureau api
    if (!bureauRecordExist) {
      //for bureau_bureau_partner_name CRIF call crif api
      switch (req.product.bureau_partner_name.toUpperCase()) {
        case "CRIF":
          return BureauCrif(req, res, data);
        case "CIBIL":
          return BureauCibil(req, res, data);
        default:
          return null;
      }
      // if (req.product.bureau_partner_name.toUpperCase() === "CRIF") {
      //   const crifResponse = await BureauCrif(req, res, data);
      // }
    }
  } catch (error) {
    return {
      success: false
    };
  }
};

const BureauCrif = async (req, res, data) => {
  const calculatedAge = getAge(new Date(data.dob).getFullYear());
  const mappedStateCode = data.state
    ? stateCode.stateCodeMapping[data.state.toUpperCase()]
    : "";
  //prepare data to record in kyc service compliance table
  let complianceData = {
    company_id: req.company._id,
    product_id: req.product._id,
    loan_app_id: data.loan_app_id,
    pan: data.appl_pan,
    dob: data.dob
  };
  try {
    const crifData = {
      borrower_name_1: `${data.first_name} ${data.last_name}`,
      dob: moment(data.dob).format("YYYY-MM-DD"),
      borrower_age: calculatedAge,
      borrower_age_as_on: moment().format("YYYY-MM-DD"),
      borrower_id_type: "ID07",
      borrower_id_number: data.appl_pan,
      borrower_telephone_num_type: "P03",
      borrower_telephone_num: data.appl_phone,
      borrower_address_type: "D01",
      borrower_address: data.resi_addr_ln1,
      borrower_city: data.city,
      borrower_state: mappedStateCode,
      borrower_pincode: data.pincode,
      enquiry_purpose: "ACCT-ORIG",
      enquiry_stage: "PRE-SCREEN",
      loan_amount: data.sanction_amount,
      email_id: data.email_id ? data.email_id : "",
      gender:
        data.gender.toUpperCase() === "FEMALE"
          ? "G01"
          : data.gender.toUpperCase() === "MALE"
          ? "G02"
          : "G03",
      loan_app_id: data.loan_app_id,
      consent: "Y",
      consent_timestamp: moment().format("YYYY-MM-DD HH:mm:ss")
    };
    //prepare config data to make call to the crif api
    const crifConfig = {
      method: "POST",
      url: `${process.env.SERVICE_MS_URL}/api/crif`,
      headers: {
        Authorization: process.env.SERVICE_MS_TOKEN,
        "Content-Type": "application/json"
      },
      data: crifData
    };
    //make call to the pan kyc api
    const crifResp = await axios(crifConfig);
    if (crifResp.data) {
      complianceData.bureau_status = "Y";
      //record kyc compliance data in table
      const recordCompliance = await Compliance.findIfExistAndRecord(
        data.loan_app_id,
        complianceData
      );
      return {success: true};
    }
  } catch (error) {
    complianceData.bureau_status = "N";
    //record kyc compliance data in table
    const recordCompliance = await Compliance.findIfExistAndRecord(
      data.loan_app_id,
      complianceData
    );
    return {
      success: false
    };
  }
};

const BureauCibil = async (req, res, data) => {
  //prepare data to record in kyc service compliance table
  let complianceData = {
    company_id: req.company._id,
    product_id: req.product._id,
    loan_app_id: data.loan_app_id,
    pan: data.appl_pan,
    dob: data.dob
  };
  try {
    const mappedStateCode = data.state
      ? stateConvertion.stateConvertionMapping[data.state.toUpperCase()]
      : "";
    // Prepare address as per length for cibil api
    const address = await generateAddress(data.resi_addr_ln1);
    //prepare config data to make call to the cibil api
    const cibilData = {
      enquiry_purpose: "05",
      enquiry_amount: data.sanction_amount,
      name_first_name_1: data.first_name ? data.first_name : "",
      name_middle_name_1: data.middle_name ? data.middle_name : "",
      name_last_name_1: data.last_name ? data.last_name : "",
      name_birth_date_1: moment(data.dob).format("DDMMYYYY"),
      name_gender_1:
        data.gender.toUpperCase() === "MALE"
          ? "1"
          : data.gender.toUpperCase() === "FEMALE"
          ? "2"
          : "3",
      tele_telephone_number_1: data.appl_phone,
      tele_telephone_type_1: "01",
      id_id_number_1: data.appl_pan,
      id_id_type_1: "01",
      add_line1_1: address.address_line_1,
      add_line2_1: address.address_line_2,
      add_line3_1: address.address_line_3,
      add_line4_1: address.address_line_4,
      add_line5_1: address.address_line_5,
      add_state_code_1: mappedStateCode,
      add_pin_code_1: data.pincode,
      add_address_category_1: "02",
      en_acc_account_number_1: " ",
      loan_app_id: data.loan_app_id,
      consent: "Y",
      consent_timestamp: moment().format("YYYY-MM-DD HH:mm:ss")
    };
    //prepare config data to make call to the cibil api
    const cibilConfig = {
      method: "POST",
      url: `${process.env.SERVICE_MS_URL}/api/cibil-verify`,
      headers: {
        Authorization: process.env.SERVICE_MS_TOKEN,
        "Content-Type": "application/json"
      },
      data: cibilData
    };
    //make call to the pan kyc api
    const cibilResp = await axios(cibilConfig);
    if (cibilResp.data) {
      complianceData.bureau_status = "Y";
      //record kyc compliance data in table
      const recordCompliance = await Compliance.findIfExistAndRecord(
        data.loan_app_id,
        complianceData
      );
      return {success: true};
    }
  } catch (error) {
    complianceData.bureau_status = "N";
    //record kyc compliance data in table
    const recordCompliance = await Compliance.findIfExistAndRecord(
      data.loan_app_id,
      complianceData
    );
    return {
      success: false
    };
  }
};

module.exports = {
  CKYCSearch,
  PanKYC,
  CKYCDownload,
  BureauCrif,
  BurauServiceCall
};
