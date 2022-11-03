var mongoose = require("mongoose");
mongoose.Promise = global.Promise;
const Company = require("./company-schema");

var BureauDataSchema = mongoose.Schema({
  company_id: {
    type: Number
  },
  loan_app_id: {
    type: String,
    allowNull: true
  },
  request_id: {
    type: String,
    allowNull: true
  },
  bureau_type: {
    type: String,
    enum: ["CRIF", "CIBIL", "EXPERIAN","CIBIL-CACHE"],
    allowNull: false
  },
  req_url: {
    type: String
  },
  res_url: {
    type: String
  },
  consent: {
    type: String,
    enum: ["Y", "N"]
  },
  consent_timestamp: {
    type: Date
  },
  pan: {
    type: String
  },
  status: {
    type: String
  },
  created_at: {
    type: Date,
    allowNull: true,
    defaultValue: Date.now
  },
  created_by: {
    type: String
  }
});
var BureauData = (module.exports = mongoose.model(
  "bureau_detail",
  BureauDataSchema
));

module.exports.findIfExists = (loan_app_id, pan, status, bureau_type) => {
  return BureauData.find({
    loan_app_id: loan_app_id,
    pan: pan,
    status: status,
    bureau_type: bureau_type
  })
    .sort({_id: -1})
    .limit(1);
};

module.exports.findCachedBureau = (loan_app_id, pan) => {
  return BureauData.find({
    loan_app_id: loan_app_id,
    pan: pan
  })
    .sort({_id: -1})
    .limit(1);
};

module.exports.findCachedBureauCIBIL = (loan_app_id, pan, bureau_type) => {
  return BureauData.find({
    loan_app_id: loan_app_id,
    pan: pan,
    bureau_type: bureau_type
  })
    .sort({_id: -1})
    .limit(1);
};

//insert single
module.exports.addNew = async bureauData => {
  return BureauData.create(bureauData);
};

module.exports.findOneWithLoanAppID = id => {
  return BureauData.findOne({loan_app_id: id});
};

module.exports.findOneWithLAIDAndPLID = (loan_app_id, partner_loan_app_id) => {
  return BureauData.findOne({
    loan_app_id: {$in: [loan_app_id, partner_loan_app_id]}
  });
};
