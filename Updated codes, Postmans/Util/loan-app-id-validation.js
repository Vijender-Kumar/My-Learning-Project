"use strict";
var compose = require("composable-middleware");
const LoanRequest = require("../models/loan-request-schema");
const Company = require("../models/company-schema");
const { request } = require("http");
const verifyloanAppIdValidation = async (req, res, next) => {
  try {
    var company = await Company.getById(req.company._id);
    if(company && process.env.LMS_VERSION.indexOf(company.lms_version) !== -1 && req.body.loan_app_id){
      var loan_app = await LoanRequest.findIfExists(req.body.loan_app_id);
      if (!loan_app ) {
        throw { message: "Invalid loan app id" };
      }
      next();
    } else {
      next();
    }
  } catch (err) {
    return res.status(400).send(err);
  }
};

module.exports = { verifyloanAppIdValidation: verifyloanAppIdValidation };
