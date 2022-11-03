var autoIncrement = require("mongoose-auto-increment");
var mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const CompanySchema = mongoose.Schema({
  id: {
    type: Number,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  book_entity_id: {
    type: Number,
    allowNull: true
  },
  code: {
    type: String,
    allowNull: false,
    required: true
  },
  va_num: {
    type: String,
    allowNull: false,
    required: true
  },
  partner_id: {
    type: Number,
    allowNull: false,
    required: true
  },
  name: {
    type: String,
    allowNull: false,
    required: true
  },
  billing_name: {
    type: String,
    allowNull: true
  },
  email: {
    type: String,
    allowNull: false
  },
  cin: {
    type: String,
    allowNull: false,
    required: true
  },
  directors: {
    type: Array,
    allowNull: false,
    required: true
  },
  check_sub_company_exists: {
    type: Number,
    allowNull: true,
    required: true
  },
  status: {
    type: Number,
    allowNull: false,
    default: 1
  },
  business_phone: {
    type: String,
    allowNull: false
  },
  company_address: {
    type: String,
    allowNull: false
  },
  billing_address: {
    type: String,
    allowNull: true
  },
  pin_code: {
    type: Number,
    allowNull: false
  },
  city: {
    type: String,
    allowNull: false
  },
  state: {
    type: String,
    allowNull: false
  },
  service_delivery_state: {
    type: String,
    allowNull: false
  },
  is_igst_applicable: {
    type: Number,
    allowNull: false
  },
  website: {
    type: String,
    allowNull: true
  },
  gstin: {
    type: String,
    allowNull: false
  },
  tin: {
    type: String,
    allowNull: true
  },
  lms_version: {
    type: String,
    allowNull: false
  },
  country_flag: {
    type: String,
    allowNull: true
  },
  bulk_disburse_flag: {
    type: Number,
    default: 1
  },
  custom_code: {
    type: String,
    allowNull: true
  },
  auto_loan_status_change: {
    type: Number,
    allowNull: true
  },
  created_at: {
    type: Date,
    allowNull: true,
    default: Date.now
  },
  updated_at: {
    type: Date,
    allowNull: true,
    default: Date.now
  }
});
autoIncrement.initialize(mongoose.connection);
CompanySchema.plugin(autoIncrement.plugin, "id");
var Company = (module.exports = mongoose.model("company", CompanySchema));

module.exports.getAll = () => {
  return Company.find({});
};

module.exports.addNew = data => {
  return Company.create(data);
};

//Add bulk brands
module.exports.addBulk = function(data) {
  const matchFields = ["name", "email", "business_phone", "va_num"];
  return Company.upsertMany(data, matchFields);
};

//Delete Brand
module.exports.deleteById = function(id) {
  return Company.remove({
    _id: id
  });
};

module.exports.getbyStatus = status => {
  return Company.find({
    status: status
  });
};

module.exports.findByCode = code => {
  return Company.findOne({
    code: code
  });
};

module.exports.getById = id => {
  return Company.findOne({
    _id: id
  });
};

module.exports.updateStatus = (id, status) => {
  return Company.findOneAndUpdate(
    {
      _id: id
    },
    status,
    {}
  );
};

module.exports.updateById = (id, data) => {
  return Company.findOneAndUpdate(
    {
      _id: id
    },
    data,
    {}
  );
};

module.exports.searchByStr = namdatae => {
  return Company.find({
    $or: [
      {
        _id: data._id
      },
      {
        name: data.name
      },
      {
        email: data.email
      },
      {
        business_phone: data.business_phone
      },
      {
        va_num: data.va_num
      }
    ]
  });
};

module.exports.search = data => {
  //Find record by name, email,phone, va num
  return Company.findOne({
    $or: [
      {
        name: data.name
      },
      {
        email: data.email
      },
      {
        business_phone: data.business_phone
      },
      {
        va_num: data.va_num
      }
    ]
  });
};

module.exports.getCompanyCode = id => {
  return Company.find({
    _id: id
  }).select("code");
};

module.exports.findByIds = ids => {
  return Company.find({
    _id: {
      $in: ids
    }
  });
};

module.exports.findCompanyCodes = ids => {
  return Company.find({
    code: {
      $in: ids
    }
  });
};

module.exports.findByVaNum = va_num => {
  return Company.findOne({
    va_num: va_num
  });
};

module.exports.getCompanyCount = () => {
  return Company.find({}).count();
};

module.exports.findByName = name => {
  return Company.findOne({
    name: name
  });
};
