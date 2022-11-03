var autoIncrement = require("mongoose-auto-increment");
var mongoose = require("mongoose");
mongoose.Promise = global.Promise;
const Company = require('./company-schema');

var BureauReqResLogSchema = mongoose.Schema({
  id: {
    type: Number,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  company_id: {
    type: Number,
    allowNull: true,
  },
  company_code: {
    type: String,
    allowNull: true,
  },
  company_name: {
    type: String,
    allowNull: true,
  },
  sub_company_code: {
    type: String,
    allowNull: true,
  },
  pan_id: {
    type: String,
    allowNull: true,
  },
  borrower_id: {
    type: String,
    allowNull: true,
  },
  partner_loan_app_id: {
    type: String,
    allowNull: true,
  },
  loan_id: {
    type: String,
    allowNull: true
  },
  loan_app_id: {
    type: String,
    allowNull: true
  },
  partner_borrower_id: {
    type: String,
    allowNull: true,
  },
  kyc_id: {
    type: String,
    allowNull: true,
  },
  vendor_name: {
    type: String,
    allowNull: true,
  },
  service_id: {
    type: Number,
    allowNull: false,
  },
  api_name: {
    type: String,
    allowNull: true,
  },
  raw_data: {
    type: String,
    allowNull: true,
  },
  response_type: {
    type: String,
    enum: ["success", "error"],
    allowNull: true,
  },
  request_type: {
    type: String,
    enum: ["request", "response"],
    allowNull: true,
  },
  timestamp: {
    type: Date,
    allowNull: true,
    defaultValue: Date.now,
  },
  pan_card: {
    type: String,
    allowNull: true
  },
  document_uploaded_s3: {
    type: String,
    allowNull: false,
    defaultValue: 0
  },
  api_response_type: {
    type: String,
    allowNull: false,
    defaultValue: 'FAIL'
  },
  api_response_status: {
    type: String,
    allowNull: false,
    defaultValue: 'FAIL'
  },
  is_cache: {
    type: String,
    allowNull: true,
    defaultValue: 0
  },
});
autoIncrement.initialize(mongoose.connection);
BureauReqResLogSchema.plugin(autoIncrement.plugin, "id");
var BureauReqResLog = (module.exports = mongoose.model(
  "bureau_req_res_log",
  BureauReqResLogSchema
));

//insert single
module.exports.addNew = async (bureauData) => {
  const companyFindRes = await Company.findById(bureauData.company_id);
  if (!companyFindRes) {
    bureauData['company_name'] = companyFindRes.name;
  }
  return BureauReqResLog.create(bureauData);
}

module.exports.addInBulk = (bureauReqResData) => {
  return BureauReqResLog.bulkCreate(bureauReqResData);
}

module.exports.findByKycId = (kyc_id, callback) => {
  ReadOnly.findOne({
    where: {
      kyc_id
    }
  }).then((response) => callback(null, response)).catch((err) => callback(err, null))
}

module.exports.findBureau = (pan_card, service_id) => {
  let query = {
    pan_card,
    service_id,
    request_type: 'response',
    api_response_status: 'SUCCESS',
  };
  return BureauReqResLog.findOne(query);

}

module.exports.getRecords = (data, callback) => {
  ReadOnly.findAndCountAll({
    attributes: ['company_code', 'company_name', 'oan_id', 'borrower_id', 'partner_loan_id', 'partner_borrower_id', 'vendor_name', 'api_name', 'request_type', 'api_response_status', 'timestamp'],
    where: data,
  }).then((response) => {
    callback(null, response);
  }).catch((err) => {
    callback(err, null);
  });
}

//get daily or daywise cibil,experian and crif hit count
module.exports.getDailyBureauHitCount = (date, callback) => {
  ReadOnly.findOne({
      attributes: [
        [Sequelize.literal(`COUNT(CASE WHEN api_name = 'CIBIL' THEN 1 ELSE NULL END)`), 'cibil'],
        [Sequelize.literal(`COUNT(CASE WHEN api_name = 'EXPERIAN' THEN 1 ELSE NULL END)`), 'experian'],
        [Sequelize.literal(`COUNT(CASE WHEN api_name = 'CRIF' THEN 1 ELSE NULL END)`), 'crif']
      ],
      where: {
        request_type: 'response',
        api_response_status: 'SUCCESS',
        api_name: ['CIBIL', 'EXPERIAN', 'CRIF'],
        $and: sequelize.where(sequelize.fn('date', sequelize.col('timestamp')), '=', date),
      }
    })
    .then((response) => {
      callback(null, response)
    })
    .catch((err) => {
      callback(err, null)
    })
}

//get monthly cibil,experian and crif hit count
module.exports.getMonthlyBureauHitCount = (month, callback) => {
  ReadOnly.findAll({
      attributes: [
        [Sequelize.literal(`COUNT(CASE WHEN api_name = 'CIBIL' THEN 1 ELSE NULL END)`), 'cibil'],
        [Sequelize.literal(`COUNT(CASE WHEN api_name = 'EXPERIAN' THEN 1 ELSE NULL END)`), 'experian'],
        [Sequelize.literal(`COUNT(CASE WHEN api_name = 'CRIF' THEN 1 ELSE NULL END)`), 'crif']
      ],
      where: {
        request_type: 'response',
        api_response_status: 'SUCCESS',
        api_name: ['CIBIL', 'EXPERIAN', 'CRIF'],
        $and: sequelize.where(sequelize.fn('month', sequelize.col('timestamp')), '=', month),
      }
    })
    .then((response) => {
      callback(null, response)
    })
    .catch((err) => {
      callback(err, null)
    })
}

//get daily partnerwise service count
module.exports.getDailyPartnerwiseServiceCount = (date, callback) => {
  ReadOnly.findAll({
    attributes: [
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalServiceCount'], `company_id`, `service_id`
    ],
    where: [
      sequelize.where(sequelize.fn('date', sequelize.col('timestamp')), '=', date),
      {
        request_type: 'response',
        api_response_status: 'SUCCESS'
      }
    ],
    group: ['company_id', 'service_id']
  }).then((response) => {
    callback(null, response)
  }).catch((err) => {
    callback(err, null)
  })
}

//get monthly partnerwise service count
module.exports.getMonthlyPartnerwiseServiceCount = (month, year, callback) => {
  ReadOnly.findAll({
    attributes: [
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalServiceCount'], `company_id`, `service_id`
    ],
    where: [
      sequelize.where(sequelize.fn('month', sequelize.col('timestamp')), '=', month),
      sequelize.where(sequelize.fn('year', sequelize.col('timestamp')), '=', year),
      {
        request_type: 'response',
        api_response_status: 'SUCCESS'
      }
    ],
    group: ['company_id', 'service_id']
  }).then((response) => {
    callback(null, response)
  }).catch((err) => {
    callback(err, null)
  })
}

//get daily or daywise cibil,experian and PAN hit count
module.exports.getDailyBureauPanCount = (date, callback) => {
  ReadOnly.findAll({
      attributes: [
        [Sequelize.literal(`COUNT(CASE WHEN (api_name = 'CIBIL' OR api_name = 'CIBIL-V3') THEN 1 ELSE NULL END)`), 'cibil'],
        [Sequelize.literal(`COUNT(CASE WHEN api_name = 'EXPERIAN' THEN 1 ELSE NULL END)`), 'experian'],
        [Sequelize.literal(`COUNT(CASE WHEN (api_name = 'PAN' OR api_name = 'PAN-KYC') THEN 1 ELSE NULL END)`), 'pan']
      ],
      where: {
        request_type: 'response',
        api_response_status: 'SUCCESS',
        api_name: ['CIBIL', 'CIBIL-V3', 'EXPERIAN', 'PAN', 'PAN-KYC'],
        $and: sequelize.where(sequelize.fn('date', sequelize.col('timestamp')), '=', date),
      }
    })
    .then((response) => {
      callback(null, response)
    })
    .catch((err) => {
      callback(err, null)
    })
}

//get monthly cibil,experian and PAN hit count
module.exports.getMonthlyBureauPanCount = (month, year, callback) => {
  ReadOnly.findAll({
      attributes: [
        [Sequelize.literal(`COUNT(CASE WHEN (api_name = 'CIBIL' OR api_name = 'CIBIL-V3') THEN 1 ELSE NULL END)`), 'cibil'],
        [Sequelize.literal(`COUNT(CASE WHEN api_name = 'EXPERIAN' THEN 1 ELSE NULL END)`), 'experian'],
        [Sequelize.literal(`COUNT(CASE WHEN (api_name = 'PAN' OR api_name = 'PAN-KYC' ) THEN 1 ELSE NULL END)`), 'pan']
      ],
      where: [
        sequelize.where(sequelize.fn('month', sequelize.col('timestamp')), '=', month),
        sequelize.where(sequelize.fn('year', sequelize.col('timestamp')), '=', year),
        sequelize.where(sequelize.col('request_type'), '=', 'response'),
        sequelize.where(sequelize.col('api_response_status'), '=', 'SUCCESS'),
        {
          api_name: ['CIBIL', 'CIBIL-V3', 'EXPERIAN', 'PAN', 'PAN-KYC']
        }

      ]
    })
    .then((response) => {
      callback(null, response)
    })
    .catch((err) => {
      callback(err, null)
    })
}

module.exports.getDateRangeServices = (startdate, enddate, company_id, service_id, callback) => {
  ReadOnly.findOne({
      attributes: [
        [Sequelize.literal(`COUNT(CASE WHEN service_id =${service_id} THEN 1 ELSE NULL END)`), 'total_count']
      ],
      where: [
        sequelize.where(sequelize.fn('date', sequelize.col('timestamp')), '>=', startdate),
        sequelize.where(sequelize.fn('date', sequelize.col('timestamp')), '<=', enddate),
        sequelize.where(sequelize.col('request_type'), '=', 'response'),
        sequelize.where(sequelize.col('api_response_status'), '=', 'SUCCESS'),
        sequelize.where(sequelize.col('company_id'), '=', company_id),
        sequelize.where(sequelize.col('service_id'), '=', service_id),
      ]
    })
    .then((response) => {
      callback(null, response)
    })
    .catch((err) => {
      callback(err, null)
    })
}
module.exports.getByPanCard = (pan_card, service_id, callback) => {
  ReadOnly.findOne({
      where: {
        request_type: 'response',
        api_response_status: 'SUCCESS',
        service_id: service_id,
        pan_card: pan_card
      },
      order: [
        ['id', 'DESC'],
      ]
    })
    .then((response) => {
      callback(null, response)
    })
    .catch((err) => {
      callback(err, null)
    })
}

module.exports.tryNew = function(bureauData) {
  return new Promise(function(resolve, reject) {
    BureauReqResLog.create(bureauData)
      .then(resolve)
      .catch(reject)
  });
};