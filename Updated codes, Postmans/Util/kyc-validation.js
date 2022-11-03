"use strict";
const PLLoanDocument = require("../models/pl-loandocument-schema.js");
const LoanSchema = require("../models/loanschema-schema");
const LoanTemplateSchema = require("../models/loan-templates-schema.js");
const LoanDocumentCommon = require("../models/loandocument-common-schema.js");
const CLLoanDocument = require("../models/cl-loandocument-schema.js");
const helper = require("./helper");
const s3helper = require("./s3helper");
const moment = require("moment");
const kycVerificationRecord = require("../models/loan-validation-records-schema.js");

const verifyPanKyc = (pan_data_url, lrData) => {
  return new Promise(async (resolve, reject) => {
    const resultbiJson = await s3helper.asyncFetchJsonFromS3(pan_data_url, {
      method: "Get"
    }).catch((err) => {
      return err;
    });
    if (!resultbiJson.success) {
      return reject({
        success: false,
        message: "Pan kyc - pan number is not verified"
      });
    }
    if (lrData.appl_pan !== resultbiJson.Pan) {
      return reject({
        success: false,
        message: "Pan kyc - pan number is incorrect."
      });
    }
    var panName = resultbiJson.Name.trim();
    var percentage = getNameMatchPercentage(lrData, panName);
    /*resultbiJson.Name = resultbiJson.Name.trim();
        let panName = helper.generateFullNameFromAadhaar(resultbiJson.Name).toUpperCase();
        let fullName = [lrData.first_name, lrData.middle_name, lrData.last_name].filter(x => x).join(' ').trim().toUpperCase();
        if (lrData.last_name.toLowerCase().trim() !== 'na' && lrData.last_name.toLowerCase().trim() !== '.' && lrData.last_name.toLowerCase().trim() !== '') fullName = `${fullName} ${lrData.last_name.trim()}`;
        let percentage = helper.similarity(fullName, (panName) ? panName : '');*/
    if (percentage < 90) {
      return reject({
        success: false,
        message: "Pan kyc - pan name match is only " + percentage + " %"
      });
    }
    return resolve({
      success: true
    });
  });
};

const verifyCkyc = async (ckyc_url, lrData) => {
  try {
    const resultbiJson = await s3helper.asyncFetchJsonFromS3(ckyc_url, {
      method: "Get"
    });
    if (!resultbiJson) throw {
      success: false,
      message: "ckyc_id is invalid."
    };
    var ckycData = resultbiJson.data.PID_DATA;
    if (ckycData.DOB) {
      if (moment(lrData.dob).format("DD-MM-YYYY") != ckycData.DOB[0]) throw {
        success: false,
        message: "Ckyc -  dob is incorrect."
      };
    } else {
      var age = moment().format("YYYY") - parseInt(moment(lrData.dob).format("YYYY"), 10);
      if (age != ckycData.AGE[0]) throw {
        success: false,
        message: `age=${age}, dob  is incorrect.`
      };
    }
    if (ckycData.PAN) {
      if (lrData.appl_pan != ckycData.PAN[0]) throw {
        success: false,
        message: "Pan number does not match."
      };
    }
    var percentage = getNameMatchPercentage(lrData, ckycData.NAME[0]);
    if (percentage < 90) throw {
      success: false,
      message: "Name is incorrect."
    };
    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      message: `Ckyc - ${error.message}` || "Something went wrong."
    };
  }
};

const getNameMatchPercentage = (lrData, nameToVerify) => {
  var names = [
    [lrData.first_name, lrData.middle_name, lrData.last_name],
    [lrData.first_name, lrData.middle_name],
    [lrData.middle_name, lrData.last_name],
    [lrData.first_name, lrData.last_name],
  ];
  let percentage = 0;
  var nameToVerify = nameToVerify
    .replace(/^M[a-z][a-z\ ]/, "")
    .trim()
    .toUpperCase();
  nameToVerify = helper.generateFullNameFromAadhaar(nameToVerify);
  for (var i = 0; i < names.length && percentage < 90; i++) {
    var fullName = names[i]
      .filter((x) => x)
      .join(" ")
      .trim()
      .toUpperCase();
    if (nameToVerify.length > fullName.length) {
      if (nameToVerify.indexOf(fullName) > -1) percentage = 100;
    } else {
      if (fullName.indexOf(nameToVerify) > -1) percentage = 100;
    }
    if (percentage < 90) {
      percentage = helper.similarity(fullName, nameToVerify);
    }
  }
  return percentage;
};

const verifyEkyc = async (ekyc_url, lrData) => {
  try {
    const resultbiJson = await s3helper.asyncFetchJsonFromS3(ekyc_url, {
      method: "Get"
    });
    if (!resultbiJson) throw {
      success: false,
      message: "ekyc_id is invalid."
    };
    if (lrData.pincode != resultbiJson.pincode && lrData.per_pincode != resultbiJson.pincode)
      throw {
        success: false,
        message: "Pincode is incorrect."
      };
    if (lrData.dob != resultbiJson.dob) throw {
      success: false,
      message: "Dob is incorrect."
    };
    let aadharName = helper.generateFullNameFromAadhaar(resultbiJson.name);
    var percentage = getNameMatchPercentage(lrData, aadharName);
    if (percentage < 90) throw {
      success: false,
      message: "Name is incorrect."
    };
    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      message: `Ekyc - ${error.message}` || "Something went wrong."
    };
  }
};

const verifyBankAcctAndIFSCCode = async (penny_drop_url, lrData) => {
  try {
    const resultbiJson = await s3helper.asyncFetchJsonFromS3(penny_drop_url, {
      method: "Get"
    });
    if (!resultbiJson) throw {
      success: false,
      message: "pennydrop_id is invalid."
    };
    /**
         *  data.result is of the form
         *  "accountNumber": "...",
            "ifsc": "...",
            "accountName": "first middle last",
            "bankResponse": "Transaction Successful",
            "bankTxnStatus": true
         */
    if (lrData.borro_bank_acc_num !== resultbiJson.data.result.accountNumber)
      throw {
        success: false,
        message: "The bank account number associated with your loan is not verified"
      };
    if (lrData.borro_bank_ifsc !== resultbiJson.data.result.ifsc)
      throw {
        success: false,
        message: "The bank ifsc associated with your loan is not verified"
      };
    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      message: `Pennydrop - ${error.message}` || "Something went wrong."
    };
  }
};

const CheckMandatoryDocUpload = async (loan_schema_id, loan_id) => {
  let missingDocuments = [];
  try {
    const loanschemaRes = await LoanSchema.findRecord({
      _id: loan_schema_id
    });
    if (!loanschemaRes) throw "Loan schema not found.";
    const loanTempRes = await LoanTemplateSchema.findByNameTmplId(loanschemaRes.loan_custom_templates_id, "loandocument");
    if (!loanTempRes) throw "error loading template from db.";
    const resultJson = await s3helper.asyncFetchJsonFromS3(loanTempRes.path, {
      method: "Get"
    });
    if (!resultJson) throw "error loading template from S3.";
    let filteredArray = resultJson.filter(
      (value) =>
      value.checked === "TRUE" &&
      value.field != "loan_id" &&
      value.field != "borrower_id" &&
      value.field != "partner_loan_id" &&
      value.field != "partner_borrower_id"
    );
    let mandatoryDocArray = await filteredArray.map((value) => value.field);
    // const verificationRes = await kycVerificationRecord.findRecord({ loan_id: loan_id });
    // if (verificationRes && (verificationRes.ckyc_kyc_id || (verificationRes.pan_kyc_id && verificationRes.aadharkyc_kyc_id))) {
    //   mandatoryDocArray = mandatoryDocArray.filter((a) => a !== "pan_card" && a !== "address_proof" && a !== "aadhar_card");
    // }
    const loanDocCommonfindres = await LoanDocumentCommon.findAllRecord({
      loan_id: loan_id
    });
    if (!loanDocCommonfindres) throw "Error fetching loan documents.";
    // const clLoanDocumentfindres = await CLLoanDocument.findAllRecord({ loan_id: loan_id });
    // if (!clLoanDocumentfindres) throw "Error finding cl based documents.";
    // Array.prototype.push.apply(loanDocCommonfindres, clLoanDocumentfindres);
    // const plLoanDocumentfindres = await PLLoanDocument.findAllRecord({ loan_id: loan_id });
    // if (!plLoanDocumentfindres) throw "Error finding pl based documents.";
    // Array.prototype.push.apply(loanDocCommonfindres, plLoanDocumentfindres);
    let loanDocumentsData = {};
    for (var i = 0; i < mandatoryDocArray.length; i++) {
      for (var j = 0; j < loanDocCommonfindres.length; j++) {
        if (!loanDocumentsData.hasOwnProperty(mandatoryDocArray[i]) && loanDocCommonfindres[j][mandatoryDocArray[i]])
          loanDocumentsData[mandatoryDocArray[i]] = loanDocCommonfindres[j][mandatoryDocArray[i]];
      }
    }
    if (Object.keys(loanDocumentsData).length !== mandatoryDocArray.length) {
      mandatoryDocArray.forEach((item) => {
        if (!loanDocumentsData[item]) missingDocuments.push(item);
      });
      throw `Upload all mandatory documents in pre-approval, post-approval or post-disbursal for ${loan_id},if you want to exclude aadhaar and pan upload then call either ckyc api or ekyc and pankyc api`;
    }
    let documentCount = mandatoryDocArray.length - missingDocuments.length;
    return {
      success: true,
      uploadedDocCount: documentCount
    };
  } catch (error) {
    return {
      success: false,
      message: error || "Something went wrong.",
      missingDocuments: missingDocuments
    };
  }
};

function getPermutations(array, size) {
  function p(t, i) {
    if (t.length === size) {
      result.push(t);
      return;
    }
    if (i + 1 > array.length) {
      return;
    }
    p(t.concat(array[i]), i + 1);
    p(t, i + 1);
  }

  var result = [];
  p([], 0);
  return result;
}

const createWords = (PerMutationNameList) => {
  storage = {};
  for (i = 0; i < PerMutationNameList.length; i++) {
    storage[PerMutationNameList[i].join(" ")] = 1;
    storage[PerMutationNameList[i].reverse().join(" ")] = 1;
  }
  return storage;
};

const findMatchName = (name1, name2) => {
  var array = name1.split(" ");
  var array2 = name2.split(" ");
  PerMutationNameList = getPermutations(array, 2);
  PerMutationNameList1 = getPermutations(array2, 2);
  wordCombination1 = createWords(PerMutationNameList);
  wordCombination2 = createWords(PerMutationNameList1);
  count1 = Object.keys(wordCombination1).length;
  count2 = Object.keys(wordCombination2).length;
  if (count1 > count2) {
    for (var key in wordCombination1) {
      if (key in wordCombination2) {
        return true;
      }
    }
  } else {
    for (var key in wordCombination2) {
      if (key in wordCombination1) {
        return true;
      }
    }
  }
  return false;
};

module.exports = {
  verifyPanKyc,
  verifyCkyc,
  verifyEkyc,
  CheckMandatoryDocUpload,
  verifyBankAcctAndIFSCCode,
  findMatchName,
};