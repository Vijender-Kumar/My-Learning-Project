var mongoose = require("mongoose");
mongoose.Promise = global.Promise;

var KycDataSchema = mongoose.Schema({
  company_id: {
    type: Number,
  },
  loan_app_id: {
    type: String,
    allowNull: true,
  },
  kyc_type: {
    type: String,
    enum: [
      "VOTERID-KYC",
      "PAN-KYC",
      "PAN-ADV-KYC",
      "DL-KYC",
      "AADHAAR-XML-FILE",
      "AADHAAR-XML-OTP",
      "CKYC-SEARCH",
      "CKYC-DOWNLOAD",
      "CKYC-DOWNLOAD-XML",
      "CKYC-DOWNLOAD-JSON",
      "PAN-PROFILE-DETAILS-KYC",
      "GST-ONLY",
      "ITR-ONLY",
      "GST-AND-ITR",
      "VEHICLE-RC-VERIFY",
      "BANK-ACC-NUM-KYC",
      "GST-VERIFY",
    ],
    allowNull: false,
  },
  req_url: {
    type: String,
  },
  res_url: {
    type: String,
  },
  consent: {
    type: String,
    enum: ["Y", "N"],
  },
  consent_timestamp: {
    type: Date,
  },
  id_number: {
    type: String,
  },
  created_at: {
    type: Date,
    allowNull: true,
    defaultValue: Date.now,
  },
  created_by: {
    type: String,
  },
  request_id: {
    type: String,
    allowNull: true,
  },
  kyc_id: {
    type: String,
    allowNull: true,
  },
});
var KycData = (module.exports = mongoose.model("kyc_detail", KycDataSchema));

//insert single
module.exports.addNew = async (kycData) => {
  return KycData.create(kycData);
};

module.exports.findIfExists = (loan_app_id, id_number, kyc_type) => {
  return KycData.find({
    loan_app_id: loan_app_id,
    id_number: id_number,
    kyc_type: kyc_type
  })
    .sort({_id: -1})
    .limit(1);
};

module.exports.getAll = async (offset = 0, limit = 100, findQuery = {}) => {
  return await KycData.find(findQuery)
    .skip(offset)
    .limit(limit)
    .sort({ create_date: -1 });
};

module.exports.findByKYCId = async (id) => {
  return await KycData.findOne({ kyc_id: id });
};
