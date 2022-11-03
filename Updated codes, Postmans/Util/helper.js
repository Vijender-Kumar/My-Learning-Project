"use strict";
const fs = require("fs");
const AWS = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");
//const uniqueString = require('unique-string');
const fetch = require("node-fetch");
const path = require("path");
let moment = require("moment");
const axios = require("axios");
//const NachEnach = require("../models/nach-enach-schema.js");
//const SigndeskEnach = require("../models/signdesk-schema.js");
const AllModifiedLogs = require("../models/all-modifier-logs-schema");
const CLRecord = require("../models/loan-transaction-ledger-schema.js");
const Product = require("../models/product-schema.js");
const CompanySchema = require("../models/company-schema.js");
const CLTransactionSchema = require("../models/loan-transaction-ledger-schema.js");
const BorrowerinfoCommon = require("../models/borrowerinfo-common-schema.js");
const ServiceResponseLog = require("../models/service-req-res-log-schema.js");
//const VARepaymentEntry = require("../models/va-repaymentsentry-schema.js");
const LoanDocumentCommon = require("../models/loandocument-common-schema.js");
const CLLoanDocument = require("../models/cl-loandocument-schema.js");
const User = require("../models/user-schema.js");
const Otpvalidation = require("../models/otp-validation-schema.js");
//const OtpAuthorityList = require("../models/otp-authority-list-schema.js");
//const sgMail = require("@sendgrid/mail");
const PDFDocument = require("pdfkit");
const pdf2base64 = require("pdf-to-base64");
//const SignDeskEnach = require("../models/signdesk-schema");
const LoanSchema = require("../models/loanschema-schema");
const LoanTemplateSchema = require("../models/loan-templates-schema.js");
//const pgNotifyPayment = require("../util/pg_notify");
//const SigndeskDebitSheet = require("../models/signdesk-debitsheet-schema.js");
const jwt = require("jsonwebtoken");
const s3bucket = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});
const crypto = require("crypto");
const {errorResponse} = require("../utils/responses");

const uploadXmlDataToS3Bucket = (
  companyCode,
  retype,
  item,
  serviceName,
  callback
) => {
  var params = {
    Bucket: process.env.AWS_LOAN_TEMPLATE_BUCKET,
    Key: `${
      companyCode ? companyCode : "ARTM"
    }/services/${companyCode}/${serviceName}/${Date.now()}/${retype}.txt`,
    Body: JSON.stringify(item),
    ACL: "public-read"
  };
  s3bucket.upload(params, function(err, uploadedFile) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, uploadedFile);
    }
  });
};

const validateTemplateFormat = async templates => {
  try {
    const errorTemplates = {};
    Object.keys(templates).forEach((template, index) => {
      errorTemplates[template] = templates[template].filter(item => {
        return (
          !item.isCommon ||
          !item.field ||
          !item.title ||
          !item.type ||
          !item.validationmsg ||
          !item.isOptional ||
          !item.checked
        );
      });
    });
    return errorTemplates;
  } catch (error) {
    return error;
  }
};

const validateDataSync = (type, value) => {
  switch (type) {
    case "string":
      const string = /^.{1,250}$/;
      return string.test(value);
      break;
    case "pincode":
      const pincode = /^(\d{6})$/;
      return pincode.test(value);
      break;
    case "ifsc":
      const ifsc = /^[A-Z]{4}[0]{1}[a-zA-Z0-9]{6}$/;
      return ifsc.test(value);
      break;
    case "mobile":
      const mobile = /^(\d{10})$/;
      return mobile.test(value);
      break;
    case "phone":
      const phone = /^(\d{11})$/;
      return phone.test(value);
      break;
    case "pan":
      const pan = /^([A-Z]){3}([ABCFGHLJPTE]){1}([A-Z]){1}([0-9]){4}([A-Z]){1}?$/;
      return pan.test(value);
      break;
    case "email":
      const email = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,10})+$/;
      return email.test(value);
      break;
    case "aadhaar":
      const aadhaar = /(^.{8}[0-9]{4})$/;
      return aadhaar.test(value);
      break;
    case "date":
      const date = /^(\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$)/;
      return date.test(value);
      break;
    case "dob":
      const dob = /^(\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$)/;
      return dob.test(value);
      break;
    case "float":
      const float = /^[+-]?\d+(\.\d+)?$/;
      return float.test(value);
      break;
    case "passport":
      const passport = /^[A-Z][0-9]{7}$/;
      return passport.test(value);
      break;
    case "number":
      const number = /^[0-9]*$/;
      return number.test(value);
      break;
    case "integer":
      const integer = /^[-+]?\d*$/;
      return integer.test(value);
      break;
    case "gst":
      const gst = /^([0][1-9]|[1-2][0-9]|[3][0-5])([a-zA-Z]{5}[0-9]{4}[a-zA-Z]{1}[1-9a-zA-Z]{1}[zZ]{1}[0-9a-zA-Z]{1})+$/;
      return gst.test(value);
      break;
    case "driving":
      const driving = /^([A-Z]{2}[0-9]{2}\s[0-9]{11})+$/;
      return driving.test(value);
      break;
    case "epic":
      const epic = /^([a-zA-Z]){3}([0-9]){7}?$/;
      return epic.test(value);
      break;
    case "ack":
      const ack = /^([0-9]){15}$/;
      return ack.test(value);
      break;
    case "alphanum":
      const alphanum = /^[a-zA-Z0-9]{1,50}$/;
      return alphanum.test(value);
      break;
    case "uan":
      const uan = /^([A-Z]){2}([0-9]){2}([A-Z]){1}([0-9]){7}?$/;
      return uan.test(value);
      break;
    case "vpa":
      const vpa = /^\w+.\w+@\w+$/;
      return vpa.test(value);
      break;
    case "twodigit":
      const twodigit = /^\d{2}$/;
      return twodigit.test(value);
      break;
    case "alpha":
      const alpha = /^[A-Za-z\s]{1,250}$/;
      return alpha.test(value);
      break;
    case "singleAlpha":
      const singleAlpha = /^[A-Z\s]{1}$/;
      return singleAlpha.test(value);
      break;
    case "consent":
      const consent = /^\w{1}$/;
      return consent.test(value);
      break;
    case "consumerid":
      const consumerid = /^\d{12}/;
      return consumerid.test(value);
      break;
    case "timestamp":
      const timestamp = /^(\d{10})$/;
      return timestamp.test(value);
      break;
    case "txntype":
      const txntype = /^(overdue|interest|pf|usage|repayment|manage|emi|bounce*)$/;
      return txntype.test(value);
      break;
    case "bounce":
      const bounce = /^(bounce*)$/;
      return bounce.test(value);
      break;
    case "emi":
      const emi = /^(emi*)$/;
      return emi.test(value);
      break;
    case "manage":
      const manage = /^(manage*)$/;
      return manage.test(value);
      break;
    case "repayment":
      const repayment = /^(repayment*)$/;
      return repayment.test(value);
      break;
    case "usage":
      const usage = /^(usage*)$/;
      return usage.test(value);
      break;
    case "pf":
      const pf = /^(pf*)$/;
      return pf.test(value);
      break;
    case "interest":
      const interest = /^(interest*)$/;
      return interest.test(value);
      break;
    case "overdue":
      const overdue = /^(overdue*)$/;
      return overdue.test(value);
      break;
    case "txnentry":
      const txnentry = /^(cr|dr*)$/;
      return txnentry.test(value);
      break;
    case "usageTxnentry":
      const dr = /^(dr*)$/;
      return dr.test(value);
      break;
    case "repayTxnentry":
      const cr = /^(cr*)$/;
      return cr.test(value);
      break;
    case "decimalUARAUPRP":
      const decimalUARAUPRP = /^(\d{1,8})(.\d{1,4})?(UA|RA|UP|RP)$/;
      return decimalUARAUPRP.test(value);
      break;
    case "decimalRARP":
      const decimalRARP = /^(\d{1,8})(.\d{1,4})?(RA|RP)$/;
      return decimalRARP.test(value);
      break;
    case "decimalUAUP":
      const decimalUAUP = /^(\d{1,8})(.\d{1,4})?(UA|UP)$/;
      return decimalUAUP.test(value);
      break;
    case "decimalAP":
      const decimalAP = /^(\d{1,8})(.\d{1,4})?(A|P)$/;
      return decimalAP.test(value);
      break;
    case "duesArray":
      return value.length;
      break;
    case "pattern":
      const pattern = /^(ONETIME|MONTHLY|WEEKLY|DAILY|QUARTERLY|BI-MONTHLY|FORTNIGHTLY|HALFYEARLY|YEARLY|ASPRESENTED)$/;
      return pattern.test(value);
      break;
    case "ckycnumber":
      const ckycnumber = /^([0-9]){14}$/;
      return ckycnumber.test(value);
      break;
    default:
      return true;
      break;
  }
};

const checkDuesArray = duesData => {
  const verifierKeys = [
    {
      field: "principal_amount",
      type: "float",
      checked: "TRUE",
      validationmsg: "principal cannot be empty"
    },
    {
      field: "fees",
      type: "decimalUARAUPRP",
      checked: "TRUE",
      validationmsg: "fees can have possible value 0UA/0RA/0UP/0RP"
    },
    {
      field: "subvention_fees",
      type: "decimalUARAUPRP",
      checked: "FALSE",
      validationmsg: "subvention_fees can have possible value 0UA/0RA/0UP/0RP"
    },
    {
      field: "processing_fees",
      type: "decimalUARAUPRP",
      checked: "FALSE",
      validationmsg: "processing_fees can have possible value 0UA/0RA/0UP/0RP"
    },
    {
      field: "usage_fee",
      type: "decimalUARAUPRP",
      checked: "FALSE",
      validationmsg: "usage_fee can have possible value 0UA/0RA/0UP/0RP"
    },
    {
      field: "upfront_interest",
      type: "decimalUAUP",
      checked: "FALSE",
      validationmsg: "upfront_interest can have possible value 0UA/0UP"
    },
    {
      field: "int_value",
      type: "decimalAP",
      checked: "FALSE",
      validationmsg: "int_value can have possible value 0A/0P"
    },
    {
      field: "interest_free_days",
      type: "number",
      checked: "FALSE",
      validationmsg:
        "interest_free_days cannot be null, possible values 0/any positive numer"
    },
    {
      field: "exclude_interest_till_grace_period",
      type: "string",
      checked: "TRUE",
      validationmsg:
        "exclude_interest_till_grace_period cannot be null, possible values 0/any positive numer"
    },
    {
      field: "tenure_in_days",
      type: "number",
      checked: "FALSE",
      validationmsg:
        "tenure_in_days cannot be empty, possible values 0/any positive numer"
    },
    {
      field: "grace_period",
      type: "number",
      checked: "FALSE",
      validationmsg:
        "grace_period cannot be empty, possible values 0/any positive numer"
    },
    {
      field: "overdue_charges_per_day",
      type: "decimalRARP",
      checked: "FALSE",
      validationmsg: "overdue_charges_per_day can have possible values 0RA/0RP"
    },
    {
      field: "penal_interest",
      type: "decimalRARP",
      checked: "FALSE",
      validationmsg: "penal_interest can have possible values 0RA/0RP"
    },
    {
      field: "overdue_days",
      type: "number",
      checked: "FALSE",
      validationmsg:
        "overdue_days cannot be empty, possible values 0/any positive numer"
    },
    {
      field: "penal_interest_days",
      type: "number",
      checked: "FALSE",
      validationmsg:
        "penal_interest_days cannot be empty, possible values 0/any positive numer"
    }
  ];
  let noError = true;
  var items = [];
  for (var i = 0; i < verifierKeys.length; i++) {
    var item = verifierKeys[i];
    if (duesData.hasOwnProperty(`${item.field}`)) {
      const capturedKey = duesData[item.field];
      if (!validateDataSync(item.type, capturedKey)) {
        items.push(item);
      }
    }
  }
  return {
    items: items
  };
};

const isUrlValid = input => {
  var regexQuery =
    "^(https?://)?(www\\.)?([-a-z0-9]{1,63}\\.)*?[a-z0-9][-a-z0-9]{0,61}[a-z0-9]\\.[a-z]{2,6}(/[-\\w@\\+\\.~#\\?&/=%]*)?$";
  var url = new RegExp(regexQuery, "i");
  return url.test(input);
};

const getPickerFromObj = (obj, key, matcher, picker) => {
  const resultObj = obj.filter(item => {
    return item[key] == matcher;
  });
  return resultObj[0][picker];
};

const appendLoanIdBwId = (data, loanReqData, req, res) => {
  data.forEach(item => {
    item["product_id"] = req.product._id;
    item["company_id"] = req.company._id;
    item["loan_schema_id"] = req.loanSchema._id;
    item["loan_app_id"] = `${req.product.name}-${Math.floor(
      1000000000000 + Math.random() * 9000000000000
    )}`;
    if (item.hasOwnProperty("appl_pan") && item.appl_pan) {
      item["borrower_id"] = `${item.appl_pan.substring(
        0,
        5
      )}${crypto.randomBytes(2).toString("hex")}${item.appl_pan.substring(
        9,
        10
      )}`;
    } else if (item.hasOwnProperty("aadhar_card_num") && item.aadhar_card_num) {
      item["borrower_id"] = `${item.aadhar_card_num.substring(
        0,
        5
      )}${crypto
        .randomBytes(2)
        .toString("hex")}${item.aadhar_card_num.substring(9, 10)}`;
    } else {
      return res.status(400).json({
        message: "PAN number or AADHAR number is required "
      });
    }
    item["addr_id_num"] = item.addr_id_num ? item.addr_id_num : "";
    item["aadhar_card_num"] =
      item.aadhar_card_num && item.aadhar_card_num.match(/(^.{8}[0-9]{4})$/)
        ? item.aadhar_card_num.replace(/.(?=.{4,}$)/g, "*")
        : "";
    item["int_rate"] = req.loanSchema.int_rate;
  });
  return data;
};

const generateVaNumber = (data, vaNum) => {
  const generatedVaNumbers = data.map(item => {
    item["va_num"] = `${vaNum}${JSON.stringify(item.id).padStart(8, "0")}`;
    return item;
  });
  return generatedVaNumbers;
};

const appendBasicDetail = (data, req, res) => {
  data.forEach(item => {
    item["product_id"] = req.product._id;
    item["company_id"] = req.company._id;
    item["loan_schema_id"] = req.loanSchema._id;
    item["status"] = req.loanSchema.default_loan_status
      ? req.loanSchema.default_loan_status
      : "open";
    item["stage"] =
      req.loanSchema.default_loan_status === "credit_approved"
        ? "1"
        : req.loanSchema.default_loan_status === "disbursal_approved"
        ? "2"
        : 0;
  });
  return data;
};

const createLoanTemplateRows = (fileData, loan_custom_templates_id) => {
  let templatesInsert = [];
  const templatesObj = Object.keys(fileData);
  templatesObj.forEach(item => {
    const obj = {
      loan_custom_templates_id,
      name: item,
      path: fileData[item]
    };
    templatesInsert.push(obj);
  });
  return templatesInsert;
};

const generatebiTmpl = (records, template) => {
  let finalArray = [];
  records.forEach(item => {
    let obj = {};
    template.forEach(tmpl => {
      if (
        tmpl.checked === "TRUE" &&
        (tmpl.field == "partner_loan_app_id" ||
          tmpl.field == "partner_borrower_id" ||
          tmpl.field == "loan_app_id" ||
          tmpl.field == "borrower_id")
      ) {
        obj[tmpl.field] = item[tmpl.field] || "";
      }
    });
    finalArray.push(obj);
  });
  return finalArray;
};

const generateLrTemplate = template => {
  let finalArray = [];
  let obj = {};
  template.forEach(tmpl => {
    if (tmpl.checked === "TRUE") obj[tmpl.field] = "";
  });
  finalArray.push(obj);
  return finalArray;
};

const appendBookkingTxnId = (data, req, res) => {
  data.forEach(item => {
    item["company_id"] = req.company.id;
    item["txn_id"] = req.company.code + item["txn_id"];
    item["type"] = "dr";
    item["product_id"] = req.product.id;
  });
  return data;
};

const validateDocumentWithTemplate = (template, field) => {
  //Check if any column is missing compared to the template upload against this schema
  const validateColumn = template.filter((column, index) => {
    return field === column.field;
  });
  if (validateColumn.length) return validateColumn[0].isCommon;
  return `Document type ${field} is not checked while creating product schema`;
};

const validateCommonFieldsWithTemplate = (template, data) => {
  const commonRows = [];
  const unCommonRows = [];
  //bifurcate the common and unCommon fields by comparing incoming json data with custom template json
  data.forEach((row, index) => {
    let common = {};
    let unCommon = {};
    Object.keys(row).forEach(column => {
      template.forEach(checker => {
        if (checker.field === column && checker.isCommon === "TRUE") {
          common[column] = row[column];
        } else if (checker.field === column && checker.isCommon === "FALSE") {
          unCommon[column] = row[column];
          unCommon["loan_id"] = row.loan_id;
          unCommon["borrower_id"] = row.borrower_id;
          unCommon["partner_loan_id"] = row.partner_loan_id;
          unCommon["partner_borrower_id"] = row.partner_borrower_id;
        }
      });
    });
    if (common) commonRows.push(common);
    if (unCommon) unCommonRows.push(unCommon);
  });
  return {
    commonRows,
    unCommonRows
  };
};

const DPDRateCalculation = (interesttype, dpdrate, dpd, Pamount, DisDate) => {
  let splitRate = dpdrate.split(",");
  let May30Date = moment("2020-05-30").format("YYYY-MM-DD");
  let Aug18Date = moment("2020-08-18").format("YYYY-MM-DD");
  let NewDpd = parseFloat(dpd);
  switch (interesttype) {
    case "P":
      return NewDpd * dpdrate * Pamount;
      break;
    case "PR":
      return NewDpd * dpdrate;
      break;
    case "PNDC":
      if (NewDpd <= 1) return NewDpd * splitRate[0] * Pamount;
      return 1 * splitRate[0] * Pamount + (NewDpd - 1) * splitRate[1] * Pamount;
      break;
    case "PMAC":
      if (DisDate <= May30Date) return NewDpd * splitRate[0] * Pamount;
      return NewDpd * splitRate[1] * Pamount;
      break;
    case "PFDC":
      if (NewDpd <= 3) return NewDpd * splitRate[0] * Pamount;
      return 3 * splitRate[0] * Pamount + (NewDpd - 3) * splitRate[1] * Pamount;
      break;
    case "PAAC":
      if (DisDate <= Aug18Date) {
        if (NewDpd <= 1) return NewDpd * splitRate[0] * Pamount;
        return (
          1 * splitRate[0] * Pamount + (NewDpd - 1) * splitRate[1] * Pamount
        );
      } else {
        if (NewDpd <= 30) return NewDpd * splitRate[2] * Pamount;
        return (
          30 * splitRate[2] * Pamount + (NewDpd - 30) * splitRate[3] * Pamount
        );
      }
      break;
    case "PTTC":
      return NewDpd <= 1
        ? NewDpd * splitRate[0] * Pamount
        : NewDpd >= 2 && NewDpd <= 29
        ? 1 * splitRate[0] * Pamount + (NewDpd - 1) * splitRate[1] * Pamount
        : NewDpd >= 30
        ? 1 * splitRate[0] * Pamount +
          (NewDpd - 1) * splitRate[1] * Pamount +
          (NewDpd - 30) * splitRate[2] * Pamount
        : 0;
      break;
    default:
      return 0;
  }
};

const dghQuestions = [
  {
    Question:
      "I am to the best of my knowledge and belief, in good health and free from all symptoms of illness and disease?",
    answer: "y",
    id: 1
  },
  {
    Question:
      "None of my family members have been diagnosed with diabetes, heart disease, high BP, elevated blood fats, cancer, mental illness, HIV, stroke or had any hereditary disorder?",
    answer: "y",
    id: 2
  },
  {
    Question:
      "Do not intend to participate or participate in any hazardous sports or activities?",
    answer: "y",
    id: 3
  },
  {
    Question:
      "I do not currently live or intend to live or travel outside India for more than six months in a financial year?",
    answer: "y",
    id: 4
  },
  {
    Question:
      "I am not currently taking any medications/drugs, other than minor condition (e.g. cold and flu), either prescribed or not prescribed by a doctor, or have not suffered from any illness, disorder, disability, injury during past 5 years which has required any form of medical or specialised examination (including chest x-rays, gynaecological investigations, pap smear, or blood tests), consultation, hospitalisation, surgery or have any condition for which hospitalization / surgery has been advised or is contemplated?    ",
    answer: "y",
    id: 5
  },
  {
    Question:
      "I have no congenital / birth defects, pain or problems in back, spine, muscles or joint, arthritis, gout, severe injury or other physical disability and have not been incapable of working / attending the office during the last two years for more than three consecutive days or I am not currently incapable of working / attending office ?For females only –I have not ever suffered from or suffering or is currently suffering any diseases of breast / uterus / cervix, or not presently pregnant?",
    answer: "y",
    id: 6
  },
  {
    Question:
      "I do not suffer from or ever had any medical ailments such as diabetes, high blood pressure, cancer, respiratory disease (including asthma), kidney or liver disease, stroke, paralysis, auto immune disorder, any blood disorder, heart problems, Hepatitis B or C, or tuberculosis, psychiatric disorder, depression, colitis, or any other stomach problems, have not undergone any transplants, thyroid disorders, reproductive organs, HIV AIDS or a related infection?",
    answer: "y",
    id: 7
  },
  {
    Question:
      "I have never ever taken drugs, or been advised to reduce alcohol consumption or received or have been counselled to receive treatment for drug addiction or alcoholism?",
    answer: "y",
    id: 8
  },
  {
    Question:
      "I have never been refused life insurance or offered insurance modified in any way?",
    answer: "y",
    id: 9
  },
  {
    Question: "I am not suffering from disorder/ disease not mentioned above?",
    answer: "y",
    id: 10
  }
];

const signdeskPost = (SignDesk_URL, PostData, callback) => {
  const config = {
    method: "post",
    headers: {
      "X-Parse-Application-Id": process.env.SIGNDESK_X_PARSE_APPLICATION_ID,
      "X-Parse-Rest-Api-Key": process.env.SIGNDESK_X_PARSE_REST_API_KEY,
      "Content-Type": "application/json"
    }
  };
  axios
    .post(SignDesk_URL, PostData, config)
    .then(response => {
      return callback(null, response);
    })
    .catch(err => {
      return callback(err, null);
    });
};

const signdeskPhysicalNachPost = (
  SignDesk_URL,
  PostData,
  AAP_ID,
  API_KEY,
  callback
) => {
  const config = {
    method: "post",
    headers: {
      "X-Parse-Application-Id": AAP_ID,
      "X-Parse-Rest-Api-Key": API_KEY,
      "Content-Type": "application/json"
    }
  };
  axios
    .post(SignDesk_URL, PostData, config)
    .then(response => {
      return callback(null, response);
    })
    .catch(err => {
      return callback(err, null);
    });
};

const getFileExtension = filename => {
  var dot_pos = filename.lastIndexOf(".");
  if (dot_pos == -1) {
    return "";
  }
  return filename.substr(dot_pos + 1).toLowerCase();
};

const FileTypeValidation = (fileName, FileType) => {
  let extension = getFileExtension(fileName);
  switch (FileType.toUpperCase()) {
    case "PDF":
      return !(extension == "PDF" || extension == "pdf") ? false : true;
      break;
    case "IMAGE":
      return !(
        extension == "jpg" ||
        extension == "jpeg" ||
        extension == "png" ||
        extension == "gif"
      )
        ? false
        : true;
      break;
    case "DOCX":
      return !(extension == "doc" || extension == "docx") ? false : true;
      break;
    case "TXT":
      return !(extension == "txt") ? false : true;
      break;
    case "JSON":
      return !(extension == "json") ? false : true;
      break;
    case "XLS":
      return !(extension == "xlsx" || extension == "xls") ? false : true;
      break;
    case "CSV":
      return !(extension == "csv") ? false : true;
      break;
    default:
      return false;
  }
};

const MsgSmsPost = (PostData, callback) => {
  const config = {
    method: "post",
    headers: {
      authkey: process.env.SMS_AUTHKEY,
      "Content-Type": "application/json"
    }
  };
  axios
    .post(process.env.SMS_URL, PostData, config)
    .then(response => {
      return callback(null, response);
    })
    .catch(err => {
      return callback(err, null);
    });
};
const EnachDataFetch = (loan_id, callback) => {
  SigndeskEnach.findByBookkingLoanIds(loan_id, (finderr, sigdeskresp) => {
    if (finderr)
      return callback(null, {
        Emandate_ID: ""
      });
    if (!sigdeskresp) {
      NachEnach.findbyBookkingLoanId(loan_id, (err, enachresp) => {
        if (err)
          return callback(null, {
            Emandate_ID: ""
          });
        if (!enachresp)
          return callback(null, {
            Emandate_ID: ""
          });
        return callback(null, {
          Nachvendor: "TPSL",
          Emandate_ID: enachresp.hasOwnProperty("paynimo_id")
            ? enachresp.paynimo_id
            : "",
          EMI_Amt: enachresp.hasOwnProperty("max_amount")
            ? enachresp.max_amount
            : "",
          Start_Date: enachresp.hasOwnProperty("start_date")
            ? enachresp.start_date
            : "",
          Frequency_type: enachresp.hasOwnProperty("frequency")
            ? enachresp.frequency
            : "",
          bank_name: "NA",
          UMRN_NO: "NA",
          registration_date: enachresp.hasOwnProperty("created_at")
            ? enachresp.created_at
            : ""
        });
      });
    } else {
      return callback(null, {
        Nachvendor: "SignDesk",
        Emandate_ID: sigdeskresp.hasOwnProperty("emandate_id")
          ? sigdeskresp.emandate_id
          : "",
        EMI_Amt: sigdeskresp.hasOwnProperty("amount") ? sigdeskresp.amount : "",
        Start_Date: sigdeskresp.hasOwnProperty("first_collection_date")
          ? sigdeskresp.first_collection_date
          : "",
        Frequency_type: sigdeskresp.hasOwnProperty("occurance_frequency_type")
          ? sigdeskresp.occurance_frequency_type
          : "",
        bank_name: sigdeskresp.hasOwnProperty("instructed_agent_code")
          ? sigdeskresp.instructed_agent_code
          : "",
        UMRN_NO: sigdeskresp.hasOwnProperty("umrn") ? sigdeskresp.umrn : "",
        registration_date: sigdeskresp.hasOwnProperty("created_at")
          ? sigdeskresp.created_at
          : ""
      });
    }
  });
};
var groupBy = function(data, groupByKey) {
  if (data) {
    return data.reduce(function(accumalator, currentValue) {
      (accumalator[currentValue[groupByKey]] =
        accumalator[currentValue[groupByKey]] || []).push(currentValue);
      return accumalator;
    }, {});
  }
  return {};
};
const ckycSearchMatchPattern = (type, value) => {
  switch (type) {
    case "E":
      const UID = /^[0-9]{4}[|][a-zA-Z]+(([',. -][a-zA-Z ])?[a-zA-Z]*)*[|]\d{2}-\d{2}-\d{4}[|][A-Z]{1}$/;
      return !UID.test(value) ? false : true;
      break;
    case "C":
      const PAN = /^([A-Z]){3}([ABCFGHLJPTE]){1}([A-Z]){1}([0-9]){4}([A-Z]){1}?$/;
      return !PAN.test(value) ? false : true;
      break;
  }
};

const ckycDownloadMatchPattern = (type, value) => {
  switch (type) {
    case "01":
      const date = /^(\d{2}-\d{2}-\d{4}$)/;
      return !date.test(value) ? false : true;
      break;
    case "02":
      const pinAndDob = /^(\d{10})$/;
      return !pinAndDob.test(value) ? false : true;
      break;
    case "03":
      const mobileNo = /^(\d{10})$/;
      return !mobileNo.test(value) ? false : true;
      break;
    case "ckycno":
      const ckycNo = /^(\d{14})$/;
      return !ckycNo.test(value) ? false : true;
      break;
  }
};

const addModifiedLogs = data => {
  const Resp = AllModifiedLogs.addNew(data);
  if (!Resp)
    return res.status(400).json({
      message: "Error while adding modified logs"
    });
  return Resp;
};

const addUpdateDuesOnLoan = (record, dues, updateUsage) => {
  record["total_principal"] = 0;
  record["upfront_interest"] = 0;
  record["upfront_fees"] = 0;
  record["upfront_processing_fees"] = 0;
  record["upfront_usage_fee"] = 0;
  record["upfront_deducted_charges"] = 0;
  record["payable_fees"] = 0;
  record["payable_processing_fees"] = 0;
  record["payable_usage_fee"] = 0;
  record["charges_payable"] = 0;
  record["interest_payable"] = 0;
  record["int_value"] = "";
  record["tenure_in_days"] = "";
  record["grace_period"] = "";
  record["due_date"] = "";
  record["final_disburse_amt"] = 0;
  record["total_outstanding"] = 0;
  record["subvention_fees"] = 0;
  record["interest_free_days"] = 0;
  record["exclude_interest_till_grace_period"] = "";

  if (!record.int_value && record.int_value != "") record.int_value = "";
  if (!record.tenure_in_days && record.tenure_in_days != "")
    record.tenure_in_days = 0;
  if (!record.grace_period && record.grace_period == "")
    record.grace_period = 0;
  if (!record.due_date && record.due_date != "") record.due_date = "";
  record.penal_interest = 0;
  record.overdue_charges = 0;
  dues.forEach(due => {
    record["total_principal"] += due.principal_amount * 1;
    record["upfront_interest"] += due.upfront_interest * 1;
    record["subvention_fees"] += due.subvention_fees * 1;
    record["upfront_fees"] +=
      due.fees.indexOf("U") > -1 ? due.fees.replace(/[a-zA-Z]+/g, "") * 1 : 0;
    record["upfront_processing_fees"] +=
      due.processing_fees.indexOf("U") > -1
        ? due.processing_fees.replace(/[a-zA-Z]+/g, "") * 1
        : 0;
    record["upfront_usage_fee"] +=
      due.usage_fee.indexOf("U") > -1
        ? due.usage_fee.replace(/[a-zA-Z]+/g, "") * 1
        : 0;
    record["payable_fees"] +=
      due.fees.indexOf("R") > -1 ? due.fees.replace(/[a-zA-Z]+/g, "") * 1 : 0;
    record["payable_processing_fees"] +=
      due.processing_fees.indexOf("R") > -1
        ? due.processing_fees.replace(/[a-zA-Z]+/g, "") * 1
        : 0;
    record["payable_usage_fee"] +=
      due.usage_fee.indexOf("R") > -1
        ? due.usage_fee.replace(/[a-zA-Z]+/g, "") * 1
        : 0;
    var usageDate = moment(record.txn_date, "YYYY-MM-DD");
    var today = moment();
    var daysPassed = today.diff(usageDate, "days");
    var intrest_days = 0;
    if (due.exclude_interest_till_grace_period * 1) {
      intrest_days =
        daysPassed * 1 > due.tenure_in_days * 1 + due.grace_period * 1
          ? daysPassed * 1 - (due.tenure_in_days * 1 + due.grace_period * 1)
          : 0;
    } else {
      intrest_days =
        daysPassed > due.interest_free_days
          ? daysPassed * 1 - due.interest_free_days * 1
          : 0;
    }

    record["interest_payable"] +=
      due.int_value.indexOf("P") > -1
        ? due.principal_amount *
          1 *
          ((due.int_value.replace(/[a-zA-Z]+/g, "") * 1) / 100) *
          intrest_days
        : due.int_value.replace(/[a-zA-Z]+/g, "");

    var temp_int_value = record.int_value
      ? record.int_value.toString().split(",")
      : [];
    temp_int_value.push(due.int_value);
    record.int_value = temp_int_value.toString();

    var temp_tenure_in_days = record.tenure_in_days
      ? record.tenure_in_days.toString().split(",")
      : [];
    temp_tenure_in_days.push(due.tenure_in_days);
    record.tenure_in_days = temp_tenure_in_days.toString();

    var temp_interest_free_days = record.interest_free_days
      ? record.interest_free_days.toString().split(",")
      : [];
    temp_interest_free_days.push(due.interest_free_days);
    record.interest_free_days = temp_interest_free_days.toString();

    var temp_exclude_interest_till_grace_period = record.exclude_interest_till_grace_period
      ? record.exclude_interest_till_grace_period.toString().split(",")
      : [];
    temp_exclude_interest_till_grace_period.push(
      due.exclude_interest_till_grace_period
    );
    record.exclude_interest_till_grace_period = temp_exclude_interest_till_grace_period.toString();

    var temp_grace_period = record.grace_period
      ? record.grace_period.toString().split(",")
      : [];
    temp_grace_period.push(due.grace_period);
    record.grace_period = temp_grace_period.toString();

    var temp_due_date = record.due_date
      ? record.due_date.toString().split(",")
      : [];
    temp_due_date.push(due.due_date);
    record.due_date = temp_due_date.toString();

    var start_charges_day = due.tenure_in_days * 1 + due.grace_period * 1;

    var dpd_days =
      daysPassed > start_charges_day ? daysPassed - start_charges_day : 0;
    if (daysPassed > due.overdue_days * 1) dpd_days = due.overdue_days * 1;
    if (dpd_days)
      record.overdue_charges +=
        due.overdue_charges_per_day.indexOf("P") > -1
          ? due.principal_amount *
            1 *
            ((due.overdue_charges_per_day.replace(/[a-zA-Z]+/g, "") * 1) /
              100) *
            dpd_days
          : due.overdue_charges_per_day.replace(/[a-zA-Z]+/g, "") * dpd_days;

    var penal_int_days =
      daysPassed > start_charges_day ? daysPassed - start_charges_day : 0;
    if (daysPassed > due.penal_interest_days * 1)
      penal_int_days = due.penal_interest_days * 1;
    if (penal_int_days)
      record.penal_interest +=
        due.penal_interest.indexOf("P") > -1
          ? due.principal_amount *
            1 *
            ((due.penal_interest.replace(/[a-zA-Z]+/g, "") * 1) / 100) *
            penal_int_days
          : due.penal_interest.replace(/[a-zA-Z]+/g, "") * penal_int_days;
  });

  record["upfront_deducted_charges"] +=
    record.upfront_interest * 1 +
    record.upfront_fees * 1 +
    record.upfront_processing_fees * 1 +
    record.upfront_usage_fee * 1 +
    record.subvention_fees * 1;
  record["charges_payable"] +=
    record.payable_fees * 1 +
    record.payable_processing_fees * 1 +
    record.payable_usage_fee * 1;
  record.final_disburse_amt =
    record.total_principal * 1 - record.upfront_deducted_charges * 1;
  record.total_outstanding =
    record.total_principal * 1 +
    record.charges_payable * 1 +
    record.interest_payable * 1 +
    record.penal_interest * 1 +
    record.overdue_charges * 1;
  var updateRecord = {
    id: record.id,
    company_id: record.company_id,
    product_id: record.product_id,
    borrower_name: record.borrower_name || "",
    company_name: record.company_name || "",
    loan_id: record.loan_id,
    borrower_id: record.borrower_id,
    partner_borrower_id: record.partner_borrower_id,
    partner_loan_id: record.partner_loan_id,
    ac_holder_name: record.ac_holder_name,
    vpa_id: record.vpa_id || "",
    txn_id: record.txn_id,
    txn_amount: record.txn_amount,
    txn_date: record.txn_date,
    txn_reference: record.txn_reference,
    txn_id: record.txn_id,
    type: record.type,
    txn_entry: record.txn_entry,
    invoice_status: record.invoice_status,
    invoice_number: record.invoice_number || "",
    label: record.label,
    tenure: record.tenure || "",
    total_principal: record.total_principal,
    final_disburse_amt: record.final_disburse_amt,
    upfront_deducted_charges: record.upfront_deducted_charges,
    charges_payable: record.charges_payable,
    expected_repayment_dates: record.due_date || "",
    total_outstanding: record.total_outstanding,
    interest_payable: record.interest_payable,
    upfront_interest: record.upfront_interest,
    int_value: record.int_value.toString(),
    due_date: record.due_date,
    grace_period: record.grace_period,
    tenure_in_days: record.tenure_in_days,
    upfront_fees: record.upfront_fees,
    upfront_processing_fees: record.upfront_processing_fees,
    upfront_usage_fee: record.upfront_usage_fee,
    payable_fees: record.payable_fees,
    payable_processing_fees: record.payable_processing_fees,
    payable_usage_fee: record.payable_usage_fee,
    subvention_fees: record.subvention_fees,
    interest_free_days: record.interest_free_days,
    exclude_interest_till_grace_period:
      record.exclude_interest_till_grace_period,
    penal_interest: record.penal_interest,
    overdue_charges: record.overdue_charges
  };

  if (updateUsage) {
    CLRecord.updateRecord(
      updateRecord,
      (errorRecordUpdate, responseRecordUpdate) => {
        if (errorRecordUpdate) console.log("updateErorr", errorRecordUpdate);
      }
    );
  }
  return record;
};

const convertFormulaToAmountUpfrontOrRear = (due, key, deductionEnd) => {
  var isUpfrontOrRear = due[key].indexOf(deductionEnd) > -1;
  if (!isUpfrontOrRear) return 0;
  var plainValue = due[key].replace(/[a-zA-Z]+/g, "") * 1;
  var percentValue = (due["d_principal_amount"] * 1 * plainValue) / 100;
  return due[key].indexOf("P") > -1 ? percentValue : plainValue;
};

const addUpdateDuesOnLoanJoined = (records, updateUsage) => {
  var record = records[0];
  record["total_principal"] = 0;
  record["upfront_interest"] = 0;
  record["upfront_fees"] = 0;
  record["upfront_processing_fees"] = 0;
  record["upfront_usage_fee"] = "";
  record["upfront_deducted_charges"] = 0;
  record["upfront_subvention_fees"] = 0;
  record["payable_fees"] = 0;
  record["payable_processing_fees"] = 0;
  record["payable_usage_fee"] = 0;
  record["payable_subvention_fees"] = 0;
  record["charges_payable"] = 0;
  record["interest_payable"] = 0;
  record["int_value"] = "";
  record["tenure_in_days"] = "";
  record["grace_period"] = "";
  record["due_date"] = "";
  record["final_disburse_amt"] = 0;
  record["total_outstanding"] = 0;
  record["subvention_fees"] = 0;
  record["interest_free_days"] = "";
  record["exclude_interest_till_grace_period"] = "";

  if (!record.int_value && record.int_value != "") record.int_value = "";
  if (!record.tenure_in_days && record.tenure_in_days != "")
    record.tenure_in_days = 0;
  if (!record.grace_period && record.grace_period == "")
    record.grace_period = 0;
  if (!record.due_date && record.due_date != "") record.due_date = "";
  record.penal_interest = 0;
  record.overdue_charges = 0;

  records.forEach(due => {
    if (record.d_txn_id) {
      record["total_principal"] += due.d_principal_amount * 1;
      //Upfront charges
      record["upfront_interest"] +=
        convertFormulaToAmountUpfrontOrRear(due, "d_upfront_interest", "U") * 1;
      record["upfront_subvention_fees"] +=
        convertFormulaToAmountUpfrontOrRear(due, "d_subvention_fees", "U") * 1;
      record["upfront_fees"] +=
        convertFormulaToAmountUpfrontOrRear(due, "d_fees", "U") * 1;
      record["upfront_processing_fees"] +=
        convertFormulaToAmountUpfrontOrRear(due, "d_processing_fees", "U") * 1;
      record["upfront_usage_fee"] +=
        convertFormulaToAmountUpfrontOrRear(due, "d_usage_fee", "U") * 1;
      //Rear Ended charges
      record["payable_subvention_fees"] +=
        convertFormulaToAmountUpfrontOrRear(due, "d_subvention_fees", "R") * 1;
      record["payable_fees"] +=
        convertFormulaToAmountUpfrontOrRear(due, "d_fees", "R") * 1;
      record["payable_processing_fees"] +=
        convertFormulaToAmountUpfrontOrRear(due, "d_processing_fees", "R") * 1;
      record["payable_usage_fee"] +=
        convertFormulaToAmountUpfrontOrRear(due, "d_usage_fee", "R") * 1;
      var usageDate = moment(record.txn_date, "YYYY-MM-DD");
      var today = moment();
      var daysPassed = today.diff(usageDate, "days");
      var intrest_days = 0;
      if (
        due.d_exclude_interest_till_grace_period == "true" ||
        due.d_exclude_interest_till_grace_period == 1 ||
        due.d_exclude_interest_till_grace_period == "1"
      ) {
        intrest_days =
          daysPassed * 1 > due.d_tenure_in_days * 1 + due.d_grace_period * 1
            ? daysPassed * 1 -
              (due.d_tenure_in_days * 1 + due.d_grace_period * 1)
            : 0;
      } else {
        intrest_days =
          daysPassed > due.d_interest_free_days * 1
            ? daysPassed * 1 - due.d_interest_free_days * 1
            : 0;
      }
      record["interest_payable"] +=
        due.d_int_value.indexOf("P") > -1
          ? due.d_principal_amount *
            1 *
            ((due.d_int_value.replace(/[a-zA-Z]+/g, "") * 1) / 100) *
            intrest_days
          : due.d_int_value.replace(/[a-zA-Z]+/g, "") * 1 * intrest_days;

      var temp_int_value = record.int_value.toString()
        ? record.int_value.toString().split(",")
        : [];
      temp_int_value.push(due.d_int_value);
      record.int_value = temp_int_value.toString();

      var temp_tenure_in_days = record.tenure_in_days.toString()
        ? record.tenure_in_days.toString().split(",")
        : [];
      temp_tenure_in_days.push(due.d_tenure_in_days);
      record.tenure_in_days = temp_tenure_in_days.toString();

      var temp_interest_free_days = record.interest_free_days.toString()
        ? record.interest_free_days.toString().split(",")
        : [];
      temp_interest_free_days.push(due.d_interest_free_days);
      record.interest_free_days = temp_interest_free_days.toString();

      var temp_exclude_interest_till_grace_period = record.exclude_interest_till_grace_period.toString()
        ? record.exclude_interest_till_grace_period.toString().split()
        : [];
      temp_exclude_interest_till_grace_period.push(
        record.d_exclude_interest_till_grace_period.toString()
      );
      record.exclude_interest_till_grace_period = temp_exclude_interest_till_grace_period.toString();

      var temp_grace_period = record.grace_period.toString()
        ? record.grace_period.toString().split(",")
        : [];
      temp_grace_period.push(due.d_grace_period);
      record.grace_period = temp_grace_period.toString();

      var temp_due_date = record.due_date
        ? record.due_date.toString().split(",")
        : [];
      temp_due_date.push(due.d_due_date);
      record.due_date = temp_due_date.toString();

      var start_charges_day = due.d_tenure_in_days * 1 + due.d_grace_period * 1;

      var dpd_days =
        daysPassed > start_charges_day ? daysPassed - start_charges_day : 0;
      if (daysPassed > due.d_overdue_days * 1)
        dpd_days = due.d_overdue_days * 1;
      if (dpd_days)
        record.overdue_charges +=
          due.d_overdue_charges_per_day.indexOf("P") > -1
            ? due.d_principal_amount *
              1 *
              ((due.d_overdue_charges_per_day.replace(/[a-zA-Z]+/g, "") * 1) /
                100) *
              dpd_days
            : due.d_overdue_charges_per_day.replace(/[a-zA-Z]+/g, "") *
              dpd_days;

      var penal_int_days =
        daysPassed > start_charges_day ? daysPassed - start_charges_day : 0;
      if (daysPassed > due.d_penal_interest_days * 1)
        penal_int_days = due.d_penal_interest_days * 1;
      if (penal_int_days)
        record.penal_interest +=
          due.d_penal_interest.indexOf("P") > -1
            ? due.d_principal_amount *
              1 *
              ((due.d_penal_interest.replace(/[a-zA-Z]+/g, "") * 1) / 100) *
              penal_int_days
            : due.d_penal_interest.replace(/[a-zA-Z]+/g, "") * penal_int_days;
    }
  });

  record["upfront_deducted_charges"] +=
    record.upfront_interest * 1 +
    record.upfront_fees * 1 +
    record.upfront_processing_fees * 1 +
    record.upfront_usage_fee * 1 +
    record.upfront_subvention_fees * 1;
  record["charges_payable"] +=
    record.payable_fees * 1 +
    record.payable_processing_fees * 1 +
    record.payable_usage_fee * 1 +
    record.payable_subvention_fees * 1;
  record["final_disburse_amt"] =
    record.total_principal * 1 - record.upfront_deducted_charges * 1;
  record["total_outstanding"] =
    record.total_principal * 1 +
    record.charges_payable * 1 +
    record.interest_payable * 1 +
    record.penal_interest * 1 +
    record.overdue_charges * 1;
  var updateRecord = {
    id: record.id,
    company_id: record.company_id,
    product_id: record.product_id,
    borrower_name: record.borrower_name || "",
    company_name: record.company_name || "",
    loan_id: record.loan_id,
    borrower_id: record.borrower_id,
    partner_borrower_id: record.partner_borrower_id,
    partner_loan_id: record.partner_loan_id,
    ac_holder_name: record.ac_holder_name,
    vpa_id: record.vpa_id || "",
    txn_id: record.txn_id,
    txn_amount: record.txn_amount,
    txn_date: record.txn_date,
    txn_reference: record.txn_reference,
    txn_id: record.txn_id,
    type: record.type,
    txn_entry: record.txn_entry,
    invoice_status: record.invoice_status,
    invoice_number: record.invoice_number || "",
    label: record.label,
    tenure: record.tenure || "",
    total_principal: record.total_principal,
    final_disburse_amt: record.final_disburse_amt,
    upfront_deducted_charges: record.upfront_deducted_charges,
    charges_payable: record.charges_payable,
    expected_repayment_dates: record.due_date || "",
    total_outstanding: record.total_outstanding,
    interest_payable: record.interest_payable,
    upfront_interest: record.upfront_interest,
    int_value: record.int_value.toString(),
    due_date: record.due_date,
    grace_period: record.grace_period,
    tenure_in_days: record.tenure_in_days,
    upfront_fees: record.upfront_fees,
    upfront_processing_fees: record.upfront_processing_fees,
    upfront_usage_fee: record.upfront_usage_fee,
    payable_fees: record.payable_fees,
    payable_processing_fees: record.payable_processing_fees,
    payable_usage_fee: record.payable_usage_fee,
    subvention_fees: record.subvention_fees,
    upfront_subvention_fees: record.upfront_subvention_fees,
    payable_subvention_fees: record.payable_subvention_fees,
    interest_free_days: record.interest_free_days,
    exclude_interest_till_grace_period:
      record.exclude_interest_till_grace_period,
    penal_interest: record.penal_interest,
    overdue_charges: record.overdue_charges
  };
  CLRecord.updateRecord(
    updateRecord,
    (errorRecordUpdate, responseRecordUpdate) => {}
  );
  return record;
};

const fetchProductVaNumber = (companyId, callback) => {
  Product.findByVaNumber(companyId, (errrProd, resProduct) => {
    if (errrProd) return callback(null, {});
    const ProductVA = [];
    resProduct.forEach(item => {
      ProductVA.push(item.va_num);
    });
    callback(null, ProductVA);
  });
};
const fetchCompanyId = (companyVaNumber, callback) => {
  CompanySchema.findByVaNumb(companyVaNumber, (errrComp, resCompany) => {
    if (errrComp) return callback(null, {});
    const CompanyId = [];
    resCompany.forEach(item => {
      CompanyId.push(item.id);
    });
    callback(null, CompanyId);
  });
};

const ekycDataFields = require("../models/ekyc_data_fields_schema");

const verifyEkycFields = async (loan_id, lrData) => {
  try {
    const ekycDataFields = await ekycDataFields.getAll(loan_id);
    if (!ekycDataFields)
      throw {
        message: "error while fetching ekyc data fields"
      };
    let ekycCheckFields = {
      dob_check: 0,
      pincode_check: 0,
      state_check: 0,
      name_check: 0
    };
    ekycDataFields.forEach(async item => {
      if (item.ekyc_type === "AADHAAR-XML") {
        if (
          lrData.pincode == item.pincode ||
          lrData.per_pincode == item.pincode
        )
          ekycCheckFields.pincode_check = true;
        if (lrData.dob == item.dob) ekycCheckFields.dob_check = true;
        if (lrData.state == item.state || lrData.per_state == item.state)
          ekycCheckFields.state_check = true;
        let aadharName = generateFullNameFromAadhaar(item.name);
        let fullName = lrData.first_name.trim();
        if (
          lrData.last_name.toLowerCase().trim() !== "na" &&
          lrData.last_name.toLowerCase().trim() !== "." &&
          lrData.last_name.toLowerCase().trim() !== ""
        )
          fullName = `${fullName} ${lrData.last_name.trim()}`;
        let percentage = similarity(
          fullName.toUpperCase(),
          aadharName ? aadharName.toUpperCase() : ""
        );
        if (percentage > 90) ekycCheckFields.name_check = true;
        ekycCheckFields.name_match_percent = percentage.toFixed(2);
        const updateEkycData = await ekycDataFields.updateRecord(
          ekycCheckFields,
          item.id
        );
        if (!updateEkycData)
          throw {
            message: "error while updating ekyc data fields"
          };
      }
    });
  } catch (error) {
    return error;
  }
};

const AddBureauResponseLog = (data, callback) => {
  uploadXmlDataToS3Bucket(
    data.company_id,
    "response",
    data,
    "COMPOSITE-DISBURSEMENT",
    (uploadError, uploadResponse) => {
      if (uploadError || !uploadResponse) return callback(uploadError, null);
      const dates = moment().format("YYYY-MM-DD HH:mm:ss");
      const location = uploadResponse.Location;
      const objData = {
        company_id: data.company_id,
        company_code: data.company_code,
        api_name: "COMPOSITE-DISBURSEMENT",
        service_id: process.env.SERVICE_COMPOSITE_DISBURSEMENT_ID,
        response_type: "success",
        request_type: "response",
        raw_data: location,
        timestamp: dates,
        pan_card: "",
        document_uploaded_s3: "1",
        api_response_type: "JSON",
        api_response_status: "SUCCESS",
        loan_id: data.loan_id,
        kyc_id: data.transaction_id
      };
      BureauResponseLog.findByKycId(
        data.transaction_id,
        (kycError, KycIdResponse) => {
          if (kycError || KycIdResponse) return callback(null, KycIdResponse);
          BureauResponseLog.addNew(objData, (bureauError, bureauResponse) => {
            if (bureauError || !bureauResponse)
              return callback(bureauError, null);
            return callback(null, bureauResponse);
          });
        }
      );
    }
  );
};
const checkSimilar = (a, b) => {
  var equivalency = 0;
  var minLength = a.length > b.length ? b.length : a.length;
  var maxLength = a.length < b.length ? b.length : a.length;
  for (var i = 0; i < minLength; i++) {
    if (a[i] == b[i]) {
      equivalency++;
    }
  }
  var weight = equivalency / maxLength;
  return weight * 100;
};

function similarity(s1, s2) {
  try {
    var longer = s1;
    var shorter = s2;
    if (s1.length < s2.length) {
      longer = s2;
      shorter = s1;
    }
    var longerLength = longer.length;
    if (longerLength == 0) {
      return 100;
    }
    return (
      (100 * (longerLength - editDistance(longer, shorter))) /
      parseFloat(longerLength)
    );
  } catch (error) {
    return 0;
  }
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  var costs = new Array();
  for (var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for (var j = 0; j <= s2.length; j++) {
      if (i == 0) costs[j] = j;
      else {
        if (j > 0) {
          var newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

const addVaRepaymentEntryForCompanyOrProduct = (data, callback) => {
  var va_num = data.VANumber.toString().substring(0, 8);
  data["loan_id"] = "";
  data["company_id"] = "";
  data["company_code"] = "";
  data["company_name"] = "";
  data["product_id"] = "";
  data["product_name"] = "";
  data["FullVANumber"] = data.VANumber;
  data["CompanyVANumber"] = va_num;
  Product.findProductByVaNum(va_num, (errrProd, resProduct) => {
    if (errrProd || !resProduct) {
      CompanySchema.findCompanyByVaNum(va_num, (errrComp, resCompany) => {
        if (resCompany) {
          data["company_id"] = resCompany.id;
          data["company_code"] = resCompany.code;
          data["company_name"] = resCompany.name;
        }
        callback(null, data);
      });
    } else {
      data.product_id = resProduct.id;
      data.product_name = resProduct.name;
      CompanySchema.findCompanyById(
        resProduct.company_id,
        (errrCompByProduct, resCompanyByProduct) => {
          if (resCompanyByProduct) {
            data["company_id"] = resCompanyByProduct.id;
            data["company_code"] = resCompanyByProduct.code;
            data["company_name"] = resCompanyByProduct.name;
          }
          callback(null, data);
        }
      );
    }
  });
};

const generateFullNameFromAadhaar = name => {
  var finalName = "";
  var namedArray = [];
  name.split(" ").forEach(item => {
    if (item.replace(/ /g, "") !== "") namedArray.push(item);
  });
  finalName =
    namedArray.length > 2
      ? `${namedArray[0]} ${namedArray[namedArray.length - 1]}`
      : namedArray.toString().replace(/,/g, " ");
  return finalName;
};
const genericMail = (data, callback) => {
  const msg = {
    to: data.to,
    cc: data.cc,
    from: data.from,
    templateId: data.templateId,
    dynamicTemplateData: data.dynamicTemplateData
  };
  var sgKey = process.env.SENDGRID_API_KEY;
  sgMail.setApiKey(sgKey);
  sgMail
    .send(msg)
    .then(() => {
      return callback(null, JSON.stringify(msg, null, 4));
    })
    .catch(error => {
      return callback(null, {});
    });
};

const genericMailAttchement = (data, callback) => {
  const pathToAttachment = data.filename;
  const attachment = fs.readFileSync(pathToAttachment).toString("base64");
  const msg = {
    to: data.to,
    cc: data.cc,
    from: data.from,
    templateId: data.templateId,
    subject: data.subject,
    dynamicTemplateData: data.dynamicTemplateData,
    attachments: [
      {
        content: attachment,
        filename: data.filename,
        type: "application/pdf",
        disposition: "attachment"
      }
    ]
  };
  var sgKey = process.env.SENDGRID_API_KEY;
  sgMail.setApiKey(sgKey);
  sgMail
    .send(msg)
    .then(() => {
      return callback(null, JSON.stringify(msg, null, 4));
    })
    .catch(error => {
      return callback(null, {});
    });
};
const removeSalutation = fullNames => {
  try {
    var regex = /(Mr|MR|Ms|Miss|Mrs|Dr|Sir)(\.?)\s/;
    var match = regex.exec(fullNames);
    return match !== null ? fullNames.replace(match[0], "") : fullNames;
  } catch (e) {
    return fullNames;
  }
};

var counterUsageDue = 0;
var duesToInsert = [];

const prepareDue = (data, callback, recalibrate) => {
  const {
    productIdsObject,
    productData,
    respUsageAdd,
    bookkingLoanIdsList,
    reqData,
    req
  } = data;
  var item = respUsageAdd[counterUsageDue];
  const usagesAddedByKLID = reqData.filter(
    usageItem => usageItem.loan_id === item.loan_id
  );
  CLTransactionSchema.getClTransactionCount(
    item.loan_id,
    (errorCountUsage, respCountUsage) => {
      const firstTimeBulk = usagesAddedByKLID.length === respCountUsage;
      const usageAddedMapped = reqData.filter(
        usageItem => usageItem.txn_id === item.txn_id
      );
      const mappedUsageItem = usageAddedMapped[0];
      const usageAddedMappedInDB = respUsageAdd.filter(
        usageItem => usageItem.txn_id === mappedUsageItem.txn_id
      );
      var due = {};
      var currentUsageBIConfig = {};
      var addUpfrontDeductions = firstTimeBulk
        ? usagesAddedByKLID[0].txn_id == mappedUsageItem.txn_id
          ? 1
          : 0
        : respCountUsage < 2;
      const capturedBI = bookkingLoanIdsList.filter(
        itemBI => itemBI.loan_id === item.loan_id
      );
      currentUsageBIConfig["fees"] = !addUpfrontDeductions
        ? "0UA"
        : capturedBI[0].fees || productData.fees || "0UA";
      currentUsageBIConfig["processing_fees"] = !addUpfrontDeductions
        ? "0UA"
        : capturedBI[0].processing_fees || productData.processing_fees || "0UA";
      currentUsageBIConfig["usage_fee"] =
        capturedBI[0].usage_fee || productData.usage_fee || "0UA";
      currentUsageBIConfig["subvention_fees"] = !addUpfrontDeductions
        ? "0UA"
        : capturedBI[0].subvention_fees || productData.subvention_fees || "0UA";
      currentUsageBIConfig["upfront_interest"] = !addUpfrontDeductions
        ? "0UA"
        : capturedBI[0].upfront_interest ||
          productData.upfront_interest ||
          "0UA";
      currentUsageBIConfig["int_value"] =
        capturedBI[0].int_value || productData.int_value || "0UA";
      currentUsageBIConfig["interest_free_days"] =
        (capturedBI[0].interest_free_days
          ? capturedBI[0].interest_free_days.toString()
          : capturedBI[0].interest_free_days) ||
        productData.interest_free_days ||
        0;
      currentUsageBIConfig[
        "exclude_interest_till_grace_period"
      ] = capturedBI[0].exclude_interest_till_grace_period.toString()
        ? capturedBI[0].exclude_interest_till_grace_period
        : productData.exclude_interest_till_grace_period
        ? productData.exclude_interest_till_grace_period
        : 0;
      currentUsageBIConfig["tenure_in_days"] =
        capturedBI[0].tenure_in_days || productData.tenure_in_days || 0;
      currentUsageBIConfig["grace_period"] =
        capturedBI[0].grace_period || productData.grace_period || 0;
      currentUsageBIConfig["due_date"] = moment(mappedUsageItem.txn_date)
        .add(
          (capturedBI[0].tenure_in_days ? capturedBI[0].tenure_in_days : 0) * 1,
          "days"
        )
        .format("YYYY-MM-DD");
      currentUsageBIConfig["overdue_charges_per_day"] =
        capturedBI[0].overdue_charges_per_day ||
        productData.overdue_charges_per_day ||
        0;
      currentUsageBIConfig["penal_interest"] =
        capturedBI[0].penal_interest || productData.penal_interest || 0;
      currentUsageBIConfig["overdue_days"] =
        capturedBI[0].overdue_days || productData.overdue_days || 0;
      currentUsageBIConfig["penal_interest_days"] =
        capturedBI[0].penal_interest_days ||
        productData.penal_interest_days ||
        0;
      if (mappedUsageItem.dues) {
        mappedUsageItem.dues.forEach(dueItem => {
          due = {
            loan_id: mappedUsageItem.loan_id,
            partner_loan_id: mappedUsageItem.partner_loan_id,
            usage_id: usageAddedMappedInDB[0].id,
            company_id: req.company.id,
            product_id:
              productIdsObject[
                `${mappedUsageItem.loan_id.toString().replace(/\s/g, "")}`
              ],
            d_txn_id: mappedUsageItem.txn_id,
            d_principal_amount: dueItem.principal_amount,
            d_txn_date: mappedUsageItem.txn_date,
            d_fees:
              dueItem["fees"] ||
              (!addUpfrontDeductions ? "0UA" : currentUsageBIConfig.fees),
            d_processing_fees:
              dueItem["processing_fees"] ||
              (!addUpfrontDeductions
                ? "0UA"
                : currentUsageBIConfig.processing_fees),
            d_subvention_fees:
              dueItem["subvention_fees"] ||
              (!addUpfrontDeductions
                ? "0UA"
                : currentUsageBIConfig.subvention_fees),
            d_usage_fee: dueItem["usage_fee"] || currentUsageBIConfig.usage_fee,
            d_upfront_interest:
              dueItem["upfront_interest"] ||
              (!addUpfrontDeductions
                ? "0UA"
                : currentUsageBIConfig.upfront_interest),
            d_int_value: dueItem["int_value"] || currentUsageBIConfig.int_value,
            d_interest_free_days:
              dueItem["interest_free_days"].toString() ||
              currentUsageBIConfig.interest_free_days.toString(),
            d_exclude_interest_till_grace_period: dueItem[
              "exclude_interest_till_grace_period"
            ].toString()
              ? dueItem["exclude_interest_till_grace_period"]
              : currentUsageBIConfig.exclude_interest_till_grace_period.toString(),
            d_tenure_in_days:
              dueItem["tenure_in_days"] || currentUsageBIConfig.tenure_in_days,
            d_grace_period:
              dueItem["grace_period"] || currentUsageBIConfig.grace_period,
            d_due_date: moment(mappedUsageItem.txn_date)
              .add(
                (dueItem["tenure_in_days"] ||
                  currentUsageBIConfig.tenure_in_days) * 1,
                "days"
              )
              .format("YYYY-MM-DD"),
            d_overdue_charges_per_day:
              dueItem["overdue_charges_per_day"] ||
              currentUsageBIConfig.overdue_charges_per_day,
            d_penal_interest:
              dueItem["penal_interest"] || currentUsageBIConfig.penal_interest,
            d_overdue_days:
              dueItem["overdue_days"] || currentUsageBIConfig["overdue_days"],
            d_penal_interest_days:
              dueItem["penal_interest_days"] ||
              currentUsageBIConfig["penal_interest_days"],
            d_status: "pending"
          };
          duesToInsert.push(due);
        });
      } else {
        due = {
          loan_id: mappedUsageItem.loan_id,
          partner_loan_id: mappedUsageItem.partner_loan_id,
          usage_id: usageAddedMappedInDB[0].id,
          company_id: req.company.id,
          product_id:
            productIdsObject[
              `${mappedUsageItem.loan_id.toString().replace(/\s/g, "")}`
            ],
          d_txn_id: mappedUsageItem.txn_id,
          d_principal_amount: mappedUsageItem.txn_amount,
          d_txn_date: mappedUsageItem.txn_date,
          d_fees: !addUpfrontDeductions ? "0UA" : currentUsageBIConfig.fees,
          d_processing_fees: !addUpfrontDeductions
            ? "0UA"
            : currentUsageBIConfig.processing_fees,
          d_subvention_fees: !addUpfrontDeductions
            ? "0UA"
            : currentUsageBIConfig.subvention_fees,
          d_upfront_interest: !addUpfrontDeductions
            ? "0UA"
            : currentUsageBIConfig.upfront_interest,
          d_usage_fee: currentUsageBIConfig.usage_fee,
          d_int_value: currentUsageBIConfig.int_value,
          d_interest_free_days: currentUsageBIConfig.interest_free_days.toString(),
          d_exclude_interest_till_grace_period: currentUsageBIConfig.exclude_interest_till_grace_period.toString(),
          d_tenure_in_days: currentUsageBIConfig.tenure_in_days,
          d_grace_period: currentUsageBIConfig.grace_period,
          d_due_date: moment(mappedUsageItem.txn_date)
            .add(currentUsageBIConfig.tenure_in_days * 1, "days")
            .format("YYYY-MM-DD"),
          d_overdue_charges_per_day:
            currentUsageBIConfig.overdue_charges_per_day,
          d_penal_interest: currentUsageBIConfig.penal_interest,
          d_overdue_days: currentUsageBIConfig["overdue_days"],
          d_penal_interest_days: currentUsageBIConfig["penal_interest_days"],
          d_status: "pending"
        };
        duesToInsert.push(due);
      }
      counterUsageDue++;
      if (counterUsageDue > respUsageAdd.length)
        return callback(null, duesToInsert);
      prepareDue(data, callback);
    }
  );
};

const createDuesData = (data, callback, recalibrate) => {
  counterUsageDue = 0;
  duesToInsert = [];
  prepareDue(data, callback, recalibrate);
};

const createDuesDataOnDemand = data => {
  counterUsageDue = 0;
  duesToInsert = [];
  prepareDueOnDemand(data);
};

const calculateConfigFieldValue = (
  field,
  capturedBI,
  productData,
  defaultValue,
  print
) => {
  let value = null;
  if (print) {
    //console.log('capturedBI ---', capturedBI);
    //console.log('productData ---', productData);
    //console.log('hasOwnProperty', capturedBI.hasOwnProperty(field));
    //console.log(`captured info ${capturedBI[field]} - ${productData[field]}`);
  }
  if (
    capturedBI.hasOwnProperty(field) &&
    capturedBI[field] != undefined &&
    capturedBI[field] != null
  ) {
    value = capturedBI[field].toString();
  } else if (
    productData.hasOwnProperty(field) &&
    productData[field] != undefined &&
    productData[field] != null
  ) {
    value = productData[field].toString();
  }
  return value ? value : defaultValue;
};

const prepareDueOnDemand = data => {
  const {productData, BIList, usages, req} = data;
  //Start with usage at index
  var item = usages[counterUsageDue];
  //Check if it is first usage
  const firstUsage = counterUsageDue == 0;
  var due = {};
  //Map Borrower info matching loan_id
  const capturedBI = BIList.filter(itemBI => {
    return itemBI.loan_id === item.loan_id;
  });
  due["loan_id"] = item.loan_id;
  due["partner_loan_id"] = item.partner_loan_id;
  due["usage_id"] = item._id;
  due["company_id"] = req.company._id;
  due["product_id"] = productData._id;
  due["txn_id"] = item.txn_id;
  due["txn_date"] = item.txn_date;
  due["txn_amount"] = item.txn_amount;
  due["fees"] = !firstUsage
    ? "0UA"
    : calculateConfigFieldValue("fees", capturedBI[0], productData, "0UA");
  due["processing_fees"] = !firstUsage
    ? "0UA"
    : calculateConfigFieldValue(
        "processing_fees",
        capturedBI[0],
        productData,
        "0UA"
      );
  due["usage_fee"] = calculateConfigFieldValue(
    "usage_fee",
    capturedBI[0],
    productData,
    "0UA"
  );
  due["subvention_fees"] = !firstUsage
    ? "0UA"
    : calculateConfigFieldValue(
        "subvention_fees",
        capturedBI[0],
        productData,
        "0UA"
      );
  due["upfront_interest"] = !firstUsage
    ? "0UA"
    : calculateConfigFieldValue(
        "upfront_interest",
        capturedBI[0],
        productData,
        "0UA"
      );
  due["int_value"] = calculateConfigFieldValue(
    "int_value",
    capturedBI[0],
    productData,
    "0UA"
  );
  due["interest_free_days"] = calculateConfigFieldValue(
    "interest_free_days",
    capturedBI[0],
    productData,
    0
  );
  due["exclude_interest_till_grace_period"] = calculateConfigFieldValue(
    "exclude_interest_till_grace_period",
    capturedBI[0],
    productData,
    0
  );
  due["tenure_in_days"] = calculateConfigFieldValue(
    "tenure_in_days",
    capturedBI[0],
    productData,
    0,
    1
  );
  due["grace_period"] = calculateConfigFieldValue(
    "grace_period",
    capturedBI[0],
    productData,
    0
  );
  due["due_date"] = moment(item.txn_date)
    .add(due["tenure_in_days"], "days")
    .format("YYYY-MM-DD");
  if (capturedBI[0]["is_monthly_billing_date_fixed"] == "true") {
    due["due_date"] = moment(
      moment(item.txn_date).set(
        "date",
        Number(capturedBI[0].monthly_billing_cycle_day || 1)
      )
    )
      .add(1, "months")
      .format("YYYY-MM-DD");
    due["tenure_in_days"] = moment(due["due_date"]).diff(
      moment(item.txn_date),
      "days"
    );
  } else if (productData["is_monthly_billing_date_fixed"] == "true") {
    due["due_date"] = moment(
      moment(item.txn_date).set(
        "date",
        Number(productData.monthly_billing_cycle_day || 1)
      )
    )
      .add(1, "months")
      .format("YYYY-MM-DD");
    due["tenure_in_days"] = moment(due["due_date"]).diff(
      moment(item.txn_date),
      "days"
    );
  }
  due["overdue_charges_per_day"] = calculateConfigFieldValue(
    "overdue_charges_per_day",
    capturedBI[0],
    productData,
    0
  );
  due["penal_interest"] = calculateConfigFieldValue(
    "penal_interest",
    capturedBI[0],
    productData,
    0
  );
  due["overdue_days"] = calculateConfigFieldValue(
    "overdue_days",
    capturedBI[0],
    productData,
    0
  );
  due["penal_interest_days"] = calculateConfigFieldValue(
    "penal_interest_days",
    capturedBI[0],
    productData,
    0
  );
  duesToInsert.push(due);
  counterUsageDue++;
  if (counterUsageDue >= usages.length) {
    return duesToInsert;
  }
  prepareDueOnDemand(data);
};

const markLoansDisbursed = loans => {
  loans.forEach(item => {
    BorrowerinfoCommon.updateDisbStatusByKLBIId(
      {
        status: "disbursed",
        stage: "4"
      },
      item.loan_id,
      item.borrower_id,
      (disbStserr, disbStsresult) => {}
    );
  });
};

const bureauLogs = (data, callback) => {
  try {
    uploadXmlDataToS3Bucket(
      data.company_id,
      data.type,
      data.bodyData || null,
      data.api_name,
      (uploadError, uploadResponse) => {
        if (uploadError || !uploadResponse)
          return callback(uploadError || uploadResponse, null);
        if (data.bodyData) delete data.bodyData;
        data.raw_data = uploadResponse.Location;
        data.timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
        BureauResponseLog.addNew(data, (bureauError, bureauResponse) => {
          if (bureauError || !bureauResponse)
            return callback(bureauError || bureauResponse, null);
          return callback(null, bureauResponse);
        });
      }
    );
  } catch (beuroLogsError) {
    return callback(beuroLogsError, null);
  }
};

const AddVARepaymentData = (data, callback) => {
  VARepaymentEntry.findOneUTRNumber(
    data.UTRNumber,
    (erroFetchVARepayment, respVARepayment) => {
      if (erroFetchVARepayment || respVARepayment)
        return callback(null, respVARepayment);
      VARepaymentEntry.addNew(
        data,
        (errorVARepaymentEntry, responseVARepaymentEntry) => {
          if (errorVARepaymentEntry || !responseVARepaymentEntry)
            return callback(errorVARepaymentEntry, null);
          return callback(null, responseVARepaymentEntry);
        }
      );
    }
  );
};

const checkEkycId = async (req, loanRequest) => {
  try {
    const bodyData = req.body[0];
    if (req.headers["aadhaar_kyc_id"]) {
      const kycResp = await ekycDataFields.findOneRecord({
        aadhaar_kyc_id: req.headers["aadhaar_kyc_id"]
      });
      if (!kycResp) return true;
      const resultbiJson = await fetchJsonFromS3(kycResp.doc_s3_url, {
        method: "Get"
      });
      if (!resultbiJson) return true;
      const baseResp = await convertImgBase64ToPdfBase64(resultbiJson);
      if (!baseResp) return true;
      const ekycResponse = await ekycDataFields.updateData(
        {
          loan_id: bodyData.loan_id
        },
        {
          aadhaar_kyc_id: req.headers["aadhaar_kyc_id"]
        }
      );
      if (!ekycResponse) return true;
      const verifyResp = await verifyEkycFields(bodyData.loan_id, loanRequest);
      if (!verifyResp) return true;
      const borroData = {
        loan_id: bodyData.loan_id,
        borrower_id: bodyData.borrower_id,
        partner_loan_id: bodyData.partner_loan_id,
        partner_borrower_id: bodyData.partner_borrower_id,
        fileType: "selfie",
        base64pdfencodedfile: baseResp
      };
      const respDoc = uploadLoanDoc(borroData, req);
      if (respDoc || !respDoc) return true;
    } else {
      const kycRes = await ekycDataFields.findOneRecord({
        loan_id: bodyData.loan_id
      });
      if (!kycRes) return true;
      const resultbiJson = await fetchJsonFromS3(kycRes.doc_s3_url, {
        method: "Get"
      });
      if (!resultbiJson) return true;
      const baseResp = convertImgBase64ToPdfBase64(resultbiJson);
      if (!baseResp) return true;
      const borroData = {
        loan_id: bodyData.loan_id,
        borrower_id: bodyData.borrower_id,
        partner_loan_id: bodyData.partner_loan_id,
        partner_borrower_id: bodyData.partner_borrower_id,
        fileType: "selfie",
        base64pdfencodedfile: baseResp
      };
      const respDoc = uploadLoanDoc(borroData, req);
      if (respDoc || !respDoc) return true;
    }
  } catch (error) {
    return error;
  }
};

const convertImgBase64ToPdfBase64 = (base64, cb) => {
  let name = Date.now();
  var pngFileName = `./${name}.png`;
  var base64Data = base64;
  fs.writeFile(pngFileName, base64Data, "base64", function(err) {
    if (err) return cb(true, null);
    const doc = new PDFDocument({
      size: "A4"
    });
    doc.image(pngFileName, {
      fit: [500, 400],
      align: "center",
      valign: "center"
    });
    doc.pipe(fs.createWriteStream(`./${name}.pdf`)).on("finish", function(err) {
      fs.unlink(`./${name}.png`, errUnlinkHtml => {
        if (errUnlinkHtml) return cb(true, null);
      });
      pdf2base64(`./${name}.pdf`)
        .then(pdfResp => {
          fs.unlink(`./${name}.pdf`, errUnlinkHtml => {
            if (errUnlinkHtml) return cb(true, null);
            return cb(null, pdfResp);
          });
        })
        .catch(error => {
          fs.unlink(`./${name}.pdf`, errUnlinkHtml => {
            if (errUnlinkHtml) return cb(true, null);
          });
          return cb(true, null);
        });
    });
    doc.end();
  });
};

const uploadLoanDoc = (data, req) => {
  let submitdata = {
    base64pdfencodedfile: data.base64pdfencodedfile,
    fileType: data.fileType,
    loan_id: data.loan_id,
    borrower_id: data.borrower_id,
    partner_loan_id: data.partner_loan_id,
    partner_borrower_id: data.partner_borrower_id
  };
  var basePath = "http://localhost:" + process.env.PORT;
  var loanDocumentUrl = `${basePath}/api/loandocument`;
  axios
    .post(loanDocumentUrl, submitdata, {
      headers: {
        Authorization: req.headers["authorization"],
        company_code: req.headers["company_code"]
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    })
    .then(response => {
      return true;
    })
    .catch(err => {
      return false;
    });
};

const UpdateDataRecallibrationStatus = (status, id, callback) => {
  Product.updateData(
    {
      data_recallibration_status: status
    },
    {
      id: id
    },
    (statusUpdateErr, statusupdateRes) => {
      if (statusupdateRes) return callback(null, statusupdateRes);
      if (statusUpdateErr) return callback(statusUpdateErr, null);
    }
  );
};

const signdeskNachRepay = (data, batch_id, callback) => {
  try {
    for (let index = 0; index < data.length; index++) {
      SignDeskEnach.findByEmandateId(
        data[index].emandate_id,
        (enachErr, enachResp) => {
          if (enachErr || !enachResp)
            if (data.length - 1 == index) {
              return callback(null, true);
            } else {
              return true;
            }
          BorrowerinfoCommon.findOneData(
            enachResp.loan_id,
            (borroErr, borroResp) => {
              if (borroErr || !borroResp)
                if (data.length - 1 == index) {
                  return callback(null, true);
                } else {
                  return true;
                }
              CompanySchema.findCompanyById(
                borroResp.company_id,
                (companyErr, companyResp) => {
                  if (companyErr || !companyResp)
                    if (data.length - 1 == index) {
                      return callback(null, true);
                    } else {
                      return true;
                    }
                  SigndeskDebitSheet.findByCondition(
                    {
                      batch_id: batch_id,
                      emandate_id: data[index].emandate_id,
                      status: "success"
                    },
                    (signDebitErr, signDebitResp) => {
                      if (signDebitErr || !signDebitResp)
                        if (data.length - 1 == index) {
                          return callback(null, true);
                        } else {
                          return true;
                        }
                      const token = jwt.sign(
                        {
                          company_id: borroResp.company_id,
                          product_id: borroResp.product_id,
                          loan_schema_id: borroResp.loan_schema_id,
                          company_code: companyResp.code,
                          type: "api",
                          environment: process.env.ENVIRONMENT
                        },
                        process.env.SECRET_KEY
                      );
                      let submitData = data[index];
                      submitData.token = token;
                      submitData.loan_id = borroResp.loan_id;
                      submitData.borrower_id = borroResp.borrower_id;
                      submitData.partner_loan_id = borroResp.partner_loan_id;
                      submitData.partner_borrower_id =
                        borroResp.partner_borrower_id;
                      submitData.amount = signDebitResp.amount;
                      Product.findById(
                        borroResp.product_id,
                        (errProduct, responseProduct) => {
                          if (errProduct || !responseProduct)
                            if (data.length - 1 == index) {
                              return callback(null, true);
                            } else {
                              return true;
                            }
                          let vaData = {
                            company_name: companyResp.name,
                            company_code: companyResp.code,
                            company_id: companyResp.id,
                            product_name: responseProduct.name,
                            product_id: responseProduct.id,
                            amount: signDebitResp.amount,
                            creditDate: moment().format("YYYY-MM-DD"),
                            loan_id: borroResp.loan_id,
                            transferType: "Collection",
                            UTRNumber: submitData.umrn,
                            vendor: "ENACH",
                            ConvertedDate: moment().format("YYYY-MM-DD")
                          };
                          AddVARepaymentData(vaData, (vaErr, vaResp) => {
                            if (vaErr || !vaResp)
                              if (data.length - 1 == index) {
                                return callback(null, true);
                              } else {
                                return true;
                              }
                            if (
                              responseProduct.name
                                .toLocaleLowerCase()
                                .indexOf("cl") > -1
                            ) {
                              clRepayment(
                                submitData,
                                companyResp.code,
                                (clErr, clResp) => {
                                  if (clErr || !clResp) return true;
                                }
                              );
                            } else {
                              pgRepayment(submitData, (pgErr, pgResp) => {
                                if (pgErr || !pgResp) return true;
                              });
                            }
                            if (data.length - 1 === index)
                              return callback(null, true);
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  } catch (error) {
    return callback(error, null);
  }
};

const clRepayment = (data, company_code, callback) => {
  try {
    var BaseUrl = "http://localhost:" + process.env.PORT;
    var SubmitPostData = [
      {
        partner_loan_id: data.partner_loan_id,
        partner_borrower_id: data.partner_borrower_id,
        loan_id: data.loan_id,
        borrower_id: data.borrower_id,
        txn_amount: data.amount,
        txn_date: moment().format("YYYY-MM-DD"),
        txn_reference: data.umrn,
        vpa_id: "test@test",
        txn_id: data.umrn,
        label: "repayment",
        txn_stage: "06",
        utr_number: data.umrn
      }
    ];
    axios
      .post(`${BaseUrl}/api/cl_repay_credit_line`, SubmitPostData, {
        headers: {
          Authorization: `Bearer ${data.token}`,
          company_code: company_code
        }
      })
      .then(response => {
        return callback(null, response.data);
      })
      .catch(error => {
        return callback(error.response.data, null);
      });
  } catch (error) {
    return callback(null, true);
  }
};

const pgRepayment = (data, callback) => {
  var paymentRecord = {};
  paymentRecord.loan_id = data.loan_id;
  paymentRecord.partner_loan_id = data.partner_loan_id;
  paymentRecord.paid_amt = data.amount;
  paymentRecord.order_id = data.umrn;
  paymentRecord.payment_mode = "NA";
  paymentRecord.payment_date = moment().format("YYYY-MM-DD hh:mm:ss");
  pgNotifyPayment.recordPaymentViaPG(paymentRecord, function(err, Resdata) {
    if (err) return true;
    return callback(null, true);
  });
};

const getOfflineStatus = (data, res) => {
  var BaseUrl = "http://localhost:" + process.env.PORT;
  axios
    .post(`${BaseUrl}/api/get_loan_request_now_ready`, data, {
      headers: {
        "Content-Type": `application/json`
      }
    })
    .then(response => {
      return response.data;
    })
    .catch(error => {
      return error.response.data;
    });
};

const nonstrictValidateDataWithTemplate = (template, data) => {
  let errorRows = [];
  let validatedRows = [];
  let unknownColumns = [];
  let missingColumns = [];
  let exactErrorColumns = [];

  //Check if any column is missing compared to the templated upload against this schema
  missingColumns = template.filter((column, index) => {
    return (
      column.checked === "TRUE" &&
      data[0].hasOwnProperty(column.field) === false
    );
  });
  if (missingColumns.length)
    return {
      missingColumns,
      errorRows,
      validatedRows,
      unknownColumns,
      exactErrorColumns
    };
  //Check if all fields required are provided
  //And do the validation
  data.forEach((row, index) => {
    let columnError = null;
    let exactColumnError = {};
    Object.keys(row)
      .filter(key => key != "")
      .forEach(column => {
        const checker = template.filter(check => {
          return check.field == column;
        });
        if (checker.length) {
          const value =
            !row[column] || row[column] === undefined || row[column] === null
              ? ""
              : row[column];
          validateData(checker[0].type, value, validation => {
            if (checker[0].checked === "TRUE" && validation === false) {
              row[column] = checker[0].validationmsg;
              columnError = row;
              exactColumnError[column] = checker[0].validationmsg;
            } else if (
              checker[0].checked === "FALSE" &&
              validation === false &&
              value !== ""
            ) {
              row[column] = checker[0].validationmsg;
              columnError = row;
              exactColumnError[column] = checker[0].validationmsg;
            }
          });
        }
      });
    if (columnError) {
      errorRows.push(columnError);
      exactErrorColumns.push(exactColumnError);
    }
    if (!columnError) validatedRows.push(row);
  });
  return {
    missingColumns,
    errorRows,
    validatedRows,
    unknownColumns,
    exactErrorColumns
  };
};

const validateData = (type, value, callback) => {
  switch (type) {
    case "string":
      const string = /^.{1,250}$/;
      callback(string.test(value));
      break;
    case "pincode":
      const pincode = /^(\d{6})$/;
      callback(pincode.test(value));
      break;
    case "ifsc":
      const ifsc = /^[A-Z]{4}[0]{1}[a-zA-Z0-9]{6}$/;
      callback(ifsc.test(value));
      break;
    case "mobile":
      const mobile = /^(\d{10})$/;
      callback(mobile.test(value));
      break;
    case "phone":
      const phone = /^(\d{11})$/;
      callback(phone.test(value));
      break;
    case "pan":
      const pan = /^([A-Z]){3}([ABCFGHLJPTE]){1}([A-Z]){1}([0-9]){4}([A-Z]){1}?$/;
      callback(pan.test(value));
      break;
    case "email":
      const email = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,10})+$/;
      callback(email.test(value));
      break;
    case "aadhaar":
      const aadhaar = /(^.{8}[0-9]{4})$/;
      callback(aadhaar.test(value));
      break;
    case "date":
      const date = /^(\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$)/;
      callback(date.test(value));
      break;
    case "dateTime":
      const dateTime = /^(\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])\ (0[0-9]|1[0-9]|2[0123])\:([012345][0-9])\:([012345][0-9])$)/;
      callback(dateTime.test(value));
      break;
    case "dob":
      const dob = /^(\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$)/;
      callback(dob.test(value));
      break;
    case "float":
      const float = /^[+-]?\d+(\.\d+)?$/;
      callback(float.test(value));
      break;
    case "passport":
      const passport = /^[A-Z][0-9]{7}$/;
      callback(passport.test(value));
      break;
    case "number":
      const number = /^[0-9]*$/;
      callback(number.test(value));
      break;
    case "gst":
      const gst = /^([0][1-9]|[1-2][0-9]|[3][0-8]|[9][79])([a-zA-Z]{5}[0-9]{4}[a-zA-Z]{1}[1-9a-zA-Z]{1}[zZ]{1}[0-9a-zA-Z]{1})+$/;
      callback(gst.test(value));
      break;
    case "driving":
      const driving = /^([A-Z]{2}[0-9]{2}\s[0-9]{11})+$/;
      callback(driving.test(value));
      break;
    case "epic":
      const epic = /^([a-zA-Z]){3}([0-9]){7}?$/;
      callback(epic.test(value));
      break;
    case "ack":
      const ack = /^([0-9]){15}$/;
      callback(ack.test(value));
      break;
    case "uan":
      const uan = /^([A-Z]){2}([0-9]){2}([A-Z]){1}([0-9]){7}?$/;
      callback(uan.test(value));
      break;
    case "vpa":
      const vpa = /^\w+.\w+@\w+$/;
      callback(vpa.test(value));
      break;
    case "twodigit":
      const twodigit = /^\d{2}$/;
      callback(twodigit.test(value));
      break;
    case "alpha":
      const alpha = /^[A-Za-z\s]{1,250}$/;
      callback(alpha.test(value));
      break;
    case "singleAlpha":
      const singleAlpha = /^[A-Z\s]{1}$/;
      callback(singleAlpha.test(value));
      break;
    case "consent":
      const consent = /^\w{1}$/;
      callback(consent.test(value));
      break;
    case "consumerid":
      const consumerid = /^\d{12}/;
      callback(consumerid.test(value));
      break;
    case "timestamp":
      const timestamp = /^(\d{10})$/;
      callback(timestamp.test(value));
      break;
    case "txntype":
      const txntype = /^(overdue|interest|pf|usage|repayment|manage|emi|waiver|bounce*)$/;
      callback(txntype.test(value));
      break;
    case "bounce":
      const bounce = /^(bounce*)$/;
      callback(bounce.test(value));
      break;
    case "emi":
      const emi = /^(emi*)$/;
      callback(emi.test(value));
      break;
    case "manage":
      const manage = /^(manage*)$/;
      callback(manage.test(value));
      break;
    case "repayment":
      const repayment = /^(repayment*)$/;
      callback(repayment.test(value));
      break;
    case "usage":
      const usage = /^(usage*)$/;
      callback(usage.test(value));
      break;
    case "pf":
      const pf = /^(pf*)$/;
      callback(pf.test(value));
      break;
    case "interest":
      const interest = /^(interest*)$/;
      callback(interest.test(value));
      break;
    case "overdue":
      const overdue = /^(overdue*)$/;
      callback(overdue.test(value));
      break;
    case "txnentry":
      const txnentry = /^(cr|dr*)$/;
      callback(txnentry.test(value));
      break;
    case "usageTxnentry":
      const dr = /^(dr*)$/;
      callback(dr.test(value));
      break;
    case "repayTxnentry":
      const cr = /^(cr*)$/;
      callback(cr.test(value));
      break;
    case "decimalUARAUPRP":
      const decimalUARAUPRP = /^(\d{1,8})(.\d{1,4})?(UA|RA|UP|RP)$/;
      var temp = decimalUARAUPRP.test(value);
      if (!temp) {
        value += "UA";
      }
      return decimalUARAUPRP.test(value);
    case "decimalRARP":
      const decimalRARP = /^(\d{1,8})(.\d{1,4})?(RA|RP)$/;
      var temp = decimalRARP.test(value);
      if (!temp) {
        value += "RA";
      }
      return decimalRARP.test(value);
    case "decimalUAUP":
      const decimalUAUP = /^(\d{1,8})(.\d{1,4})?(UA|UP)$/;
      var temp = decimalUAUP.test(value);
      if (!temp) {
        value += "UA";
      }
      return decimalUAUP.test(value);
    case "decimalAP": {
      const decimalAP = /^(\d{1,8})(.\d{1,4})?(A|P)$/;
      var temp = decimalAP.test(value);
      if (!temp) {
        value += "A";
      }
      return decimalAP.test(value);
    }
    case "duesArray":
      callback(value.length);
      break;
    default:
      callback(true);
      break;
  }
};

const checkApprovalAmountThreshold = async (user, amount) => {
  try {
    if (
      user.type !== "company" &&
      parseFloat(amount) > parseFloat(user.approval_amount_threshold)
    ) {
      return false;
    }
    return true;
  } catch (error) {
    return error;
  }
};

const checkOtpoCreditApprovalAmount = async (
  product,
  company_id,
  usertype,
  amount,
  loan_id
) => {
  try {
    let creditapprovalamount = 0;
    creditapprovalamount = product.otp_on_credit_approval_amount;
    if (
      usertype !== "company" &&
      parseFloat(amount) >= parseFloat(creditapprovalamount)
    ) {
      let status = "active";
      let role = "credit";
      const RespAuth = await OtpAuthorityList.findOneWithStaus(status, role);
      if (!RespAuth)
        throw {
          message: "please change authority status as acitve"
        };
      let otp = Math.floor(100000 + Math.random() * 900000);
      let data = {
        company_id: company_id,
        product_id: product.id,
        loan_id: loan_id
      };
      var config = {
        method: "post",
        url: process.env.OTP_SEND_URL,
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.OTP_API_KEY
        }
      };
      for (let i = 0; i < RespAuth.length; i++) {
        const details = JSON.stringify({
          phone: RespAuth[i].mobile_number,
          otp: otp
        });
        config.data = details;
        axios(config)
          .then(response => {
            return;
          })
          .catch(error => {
            return;
          });
      }
      data.otp = otp;
      const deleteRes = await Otpvalidation.deleteRecord(loan_id);
      if (!deleteRes)
        throw {
          message: "error while deleteing otp data"
        };
      const addRes = await Otpvalidation.addNew(data);
      if (!addRes)
        throw {
          message: "error while adding otp data"
        };
      return "send otp";
    } else {
      return true;
    }
  } catch (error) {
    return error;
  }
};

const stateList = [
  "ANDHRA PRADESH",
  "PONDICHERRY",
  "ASSAM",
  "BIHAR",
  "CHHATTISGARH",
  "DELHI",
  "GUJARAT",
  "DAMAN AND DIU",
  "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
  "HARYANA",
  "HIMACHAL PRADESH",
  "JAMMU AND KASHMIR",
  "JHARKHAND",
  "KARNATAKA",
  "KERALA",
  "LAKSHADWEEP",
  "MADHYA PRADESH",
  "MAHARASHTRA",
  "GOA",
  "MANIPUR",
  "MIZORAM",
  "NAGALAND",
  "TRIPURA",
  "ARUNACHAL PRADESH",
  "MEGHALAYA",
  "ODISHA",
  "PUNJAB",
  "CHANDIGARH",
  "RAJASTHAN",
  "TAMIL NADU",
  "UTTAR PRADESH",
  "UTTARAKHAND",
  "WEST BENGAL",
  "ANDAMAN AND NICOBAR ISLANDS",
  "SIKKIM",
  "TELANGANA",
  "LADAKH"
];

const handleValidateStateName = async (req, res, loanReqData) => {
  try {
    let inValidStateNames = [];
    await loanReqData?.map(({state, partner_loan_app_id}) => {
      if (!stateList.includes(state.toUpperCase())) {
        inValidStateNames.push({
          state,
          partner_loan_app_id
        });
      }
    });

    if (inValidStateNames?.length) {
      return {
        invalidData: inValidStateNames,
        validStateNames: stateList
      };
    } else {
      return true;
    }
  } catch (error) {
    return errorResponse(req, res, error);
  }
};

const statusToDisplay = {
  open: "Open",
  kyc_data_approved: "KYC Data Approved",
  credit_approved: "Credit Approved",
  disbursal_approved: "Disbursement Approved",
  disbursal_pending: "Pending Disbursal",
  disbursement_initiated: "Disbursement Initiated",
  disbursed: "Active",
  new: 'New',
  logged: 'Logged',
};

module.exports = {
  validateTemplateFormat,
  getPickerFromObj,
  appendLoanIdBwId,
  appendBasicDetail,
  createLoanTemplateRows,
  generatebiTmpl,
  appendBookkingTxnId,
  validateDocumentWithTemplate,
  validateCommonFieldsWithTemplate,
  generateVaNumber,
  generateLrTemplate,
  validateDataSync,
  dghQuestions,
  DPDRateCalculation,
  signdeskPost,
  getFileExtension,
  FileTypeValidation,
  MsgSmsPost,
  EnachDataFetch,
  signdeskPhysicalNachPost,
  groupBy,
  isUrlValid,
  ckycSearchMatchPattern,
  ckycDownloadMatchPattern,
  addModifiedLogs,
  checkDuesArray,
  addUpdateDuesOnLoan,
  addUpdateDuesOnLoanJoined,
  fetchProductVaNumber,
  fetchCompanyId,
  verifyEkycFields,
  addVaRepaymentEntryForCompanyOrProduct,
  generateFullNameFromAadhaar,
  genericMail,
  similarity,
  createDuesData,
  removeSalutation,
  markLoansDisbursed,
  AddBureauResponseLog,
  bureauLogs,
  AddVARepaymentData,
  checkEkycId,
  convertImgBase64ToPdfBase64,
  uploadLoanDoc,
  UpdateDataRecallibrationStatus,
  signdeskNachRepay,
  clRepayment,
  pgRepayment,
  genericMailAttchement,
  getOfflineStatus,
  createDuesDataOnDemand,
  nonstrictValidateDataWithTemplate,
  validateData,
  checkApprovalAmountThreshold,
  checkOtpoCreditApprovalAmount,
  calculateConfigFieldValue,
  stateList,
  handleValidateStateName,
  statusToDisplay,
};
