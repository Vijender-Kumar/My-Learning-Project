"use strict";
const jwt = require("jsonwebtoken");
const UserSchema = require("../models/user-schema");
const CompanySchema = require("../models/company-schema");
const ProductSchema = require("../models/product-schema");
const LoanSchemaModel = require("../models/loanschema-schema.js");
const BorrowerinfoCommon = require("../models/borrowerinfo-common-schema.js");
const TokensModel = require("../models/tokens-schema.js");
// const BankingEntity = require("../models/banking-entity-schema.js");

const cache = require("memory-cache");
// cache bearer token for 30 mins
// const CACHE_EXPIRE = 30 * 60 * 1000;
const CACHE_EXPIRE = 60 * 5 * 1;

const verifyToken = (req, res, next) => {
  try {
    const bearerHeader = req.headers["authorization"];
    // const company_code = req.headers["company_code"] || "";
    if (!bearerHeader || bearerHeader == "undefined" || bearerHeader == undefined) throw {
      message: "Forbidden",
      success: false
    };
    const bearer = bearerHeader.split(" ");
    const bearerToken = bearer[1];
    const authData = jwt.verify(bearerToken, process.env.SECRET_KEY);
    if (!authData) throw {
      message: "Forbidden",
      success: false
    };
    if (authData.type !== "api" && authData.type !== "dash-api" && authData.type !== "dash" && authData.type !== "service")
      throw {
        message: "Forbidden invalid type of token",
        success: false
      };
    // if (authData.type === "api" || authData.type === "service") {
    //   if (!authData.company_code)
    //     throw res.status(403).send({
    //       message: "Invalid token. Please get a new token",
    //       success: false,
    //     });
    //   if (authData.company_code !== company_code) throw { message: "Forbidden Invalid company code", success: false };
    // }
    if (authData.environment !== process.env.ENVIRONMENT) throw {
      message: "Forbidden cross environment",
      success: false
    };
    req.authData = authData;
    next();
  } catch (error) {
    return res.status(400).send(error);
  }
};

const verifyUser = async (req, res, next) => {
  try {
    var user = await UserSchema.findById(req.authData.user_id);
    if (!user) throw {
      message: "Invalid user"
    };
    if (!user.status) throw {
      message: "User is not active"
    };
    req.user = user;
    next();
  } catch (err) {
    return res.status(400).send(err);
  }
};

const verifyCompany = async (req, res, next) => {
  try {
    var company = await CompanySchema.findById(req.authData.company_id);
    if (!company) throw {
      message: "Invalid company"
    };
    if (
      (!company.status && req.authData.type === "api") ||
      (!company.status && req.authData.type === "service") ||
      (!company.status && req.authData.type === "dash-api")
    )
      throw {
        message: "Company is not active"
      };
    req.company = company;
    next();
  } catch (err) {
    return res.status(400).send({
      err
    });
  }
};

const verifyCompanyCached = (req, res, next) => {
  var recentCachedData;
  var cacheKey;
  if (req.authData.company_id) {
    cacheKey = "utils-jwt-verify-company." + req.authData.company_id;
  }
  var recentCachedData = cache.get(cacheKey);
  if (recentCachedData) {
    req.company = recentCachedData;
    return next();
  }
  CompanySchema.findById(req.authData.company_id, (err, company) => {
    if (err || !company) return res.status(403).send({
      message: "Invalid company"
    });
    if (
      (!company.status && req.authData.type === "api") ||
      (!company.status && req.authData.type === "service") ||
      (!company.status && req.authData.type === "dash-api")
    )
      return res.status(403).send({
        message: "Company is not active"
      });
    req.company = company;
    if (cacheKey) {
      cache.put(cacheKey, company, CACHE_EXPIRE);
    }
    next();
  });
};

const verifyProduct = async (req, res, next) => {
  try {
    const product = await ProductSchema.findById(req.authData.product_id);
    if (!product) throw {
      message: "Product not found"
    };
    if ((!product.status && req.authData.type === "api") || (!product.status && req.authData.type === "dash-api"))
      throw {
        message: "Product not active"
      };
    req.product = product;
    const schema = await LoanSchemaModel.findById(product.loan_schema_id);
    if (!schema) throw {
      message: "Schema not found"
    };
    if (!schema.status) throw {
      message: "Schema not active"
    };
    req.loanSchema = schema;
    next();
  } catch (error) {
    return res.status(400).send(error);
  }
};

const verifyLoanSchema = async (req, res, next) => {
  try {
    const schema = await LoanSchemaModel.findById(req.product.loan_schema_id);
    if (!schema) throw {
      message: "Schema not found"
    };
    if (!schema.status) throw {
      message: "Schema not active"
    };
    req.loanSchema = schema;
    next();
  } catch (error) {
    return res.status(400).send(error);
  }
};

const verifyBodyLengthDynamic = (req, res, next) => {
  if (req.authData.type === "api" && req.body.length > req.product.multiple_record_count)
    return res.status(402).send({
      message: `Please send only ${req.product.multiple_record_count} record`,
    });
  next();
};

const verifyBodyLength = (req, res, next) => {
  if (req.authData.type === "api" && req.body.length > 1) return res.status(402).send({
    message: `Please send only 1 record`
  });
  next();
};

const verifyAuthWithBodyData = (req, res, next) => {
  let reqData = {};

  req.authData.company_id ? (reqData["company_id"] = req.authData.company_id) : null;
  req.authData.product_id ? (reqData["product_id"] = req.authData.product_id) : null;
  req.body.partner_loan_id ? (reqData["partner_loan_id"] = req.body.partner_loan_id) : null;
  req.body.loan_schema_id ? (reqData["loan_schema_id"] = req.body.loan_schema_id) : null;
  req.body.partner_borrower_id ? (reqData["partner_borrower_id"] = req.body.partner_borrower_id) : null;
  req.body.loan_id ? (reqData["loan_id"] = req.body.loan_id) : null;
  req.body.borrower_id ? (reqData["borrower_id"] = req.body.borrower_id) : null;
  BorrowerinfoCommon.findBiForAuth(reqData, (err, brRes) => {
    if (err) return res.status(403).send({
      message: "Error validating request data"
    });
    if (!brRes) return res.status(403).send({
      message: "Please send valid data related to company"
    });
    next();
  });
};

const generateToken = (req, res, next) => {
  const token = jwt.sign({
      company_id: req.loanRequestData.company_id || "",
      loan_schema_id: req.loanRequestData.loan_schema_id || "",
      product_id: req.loanRequestData.product_id || "",
      type: "dash",
      environment: process.env.ENVIRONMENT,
    },
    process.env.SECRET_KEY
  );
  req.headers["authorization"] = `Bearer ${token}`;
  req.headers["company_code"] = req.loanRequestData.company_id || "";
  next();
};

const generateTokenForService = (req, res, next) => {
  const token = jwt.sign({
      company_id: req.company_id,
      product_id: req.product_id,
      user_id: req.user_id,
      type: req.type,
      environment: process.env.ENVIRONMENT,
      company_code: req.company_code,
    },
    process.env.SECRET_KEY
  );
  return token;
};

const verifyLender = async (req, res, next) => {
  try {
    var lender = await BankingEntity.findById(req.authData.lender_id);
    if (!lender) throw {
      message: "Invalid lender"
    };
    if (
      (!lender.status && req.authData.type === "api") ||
      (!lender.status && req.authData.type === "service") ||
      (!lender.status && req.authData.type === "dash-api")
    )
      throw {
        message: "Lender is not active"
      };
    req.lender = lender;
    next();
  } catch (err) {
    return res.status(400).send({
      err
    });
  }
};

const verifyWebhookToken = (req, res, next) => {
  try {
    const bearerHeader = req.headers["authorization"];
    if (!bearerHeader || bearerHeader == "undefined" || bearerHeader == undefined) throw {
      message: "Forbidden",
      success: false
    };
    if(bearerHeader !== process.env.WIREOUT_SECRET) throw{success:false, message:"Invalid token."}
    next();
  } catch (error) {
    return res.status(400).send(error);
  }
};

module.exports = {
  verifyToken,
  verifyUser,
  verifyCompany,
  verifyCompanyCached,
  verifyProduct,
  verifyLoanSchema,
  verifyBodyLengthDynamic,
  verifyBodyLength,
  verifyAuthWithBodyData,
  generateToken,
  verifyLender,
  generateTokenForService,
  verifyWebhookToken
};
