var autoIncrement = require("mongoose-auto-increment");
var mongoose = require("mongoose");
const BureauScorecardSchema = mongoose.Schema({
  id: {
    type: Number,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  gen_request_id: {
    type: String,
    allowNull: false,
  },
  bureau_request_id: {
    type: String,
    allowNull: true,
  },
  loan_app_id: {
    type: String,
    allowNull: true,
  },
  client_data: {
    type: Object,
    allowNull: true,
  },
  bureau_request: {
    type: Object,
    allowNull: true,
  },
  bureau_response: {
    type: Object,
    allowNull: true,
  },
  mapped_response: {
    type: Object,
    allowNull: true,
  },
  product_type: {
    type: String,
    allowNull: true
  },
  partner_id:{
    type:String,
    allowNull:false
  },
  bureau_type: {
    type:String,
    allowNull:false
  },
  status: {
    type: String,
    allowNull: false,
    default: "PENDING",
  },
});

autoIncrement.initialize(mongoose.connection);
BureauScorecardSchema.plugin(autoIncrement.plugin, "id");
var BureauScorecard = (module.exports = mongoose.model(
  "bureau_scorecard",
  BureauScorecardSchema
));

module.exports.add = async (data) => {
  try {
    return await BureauScorecard.create(data);
  } catch (error) {
    return null;
  }
};

module.exports.getAll = async (offset = 0, limit = 100) => {
  return await BureauScorecard.find({})
    .skip(offset)
    .limit(limit)
    .sort({ create_date: -1 });
};

module.exports.findById = async (id) => {
  return await BureauScorecard.findOne({ _id:id });
};

module.exports.findByGenRequestId = async (gen_request_id) => {
  return await BureauScorecard.findOne({ gen_request_id: gen_request_id });
};

module.exports.findByBureauRequestId = async (bureau_request_id) => {
  return await BureauScorecard.findOne({ bureau_request_id: bureau_request_id });
};

module.exports.updateClientRequest = async (gen_request_id, client_data) => {
  return await BureauScorecard.findOneAndUpdate(
    { gen_request_id: gen_request_id },
    {
      $set: {
        client_data: client_data,
      },
    }
  );
};

module.exports.updateBureauRequest = async (gen_request_id, bureau_request) => {
  return await BureauScorecard.findOneAndUpdate(
    { gen_request_id: gen_request_id },
    {
      $set: {
        bureau_request: bureau_request,
      },
    }
  );
};

module.exports.updateBureauResponse = async (gen_request_id, bureau_response) => {
  return await BureauScorecard.findOneAndUpdate(
    { gen_request_id: gen_request_id },
    {
      $set: {
        bureau_response: bureau_response,
      },
    }
  );
};


module.exports.updateMappedResponse = async (gen_request_id, mapped_response, status) => {
  return await BureauScorecard.findOneAndUpdate(
    { gen_request_id: gen_request_id },
    {
      $set: {
        mapped_response: mapped_response,
        status: status,
      },
    }
  );
};
