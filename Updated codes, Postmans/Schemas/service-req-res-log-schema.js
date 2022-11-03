var autoIncrement = require("mongoose-auto-increment");
var mongoose = require("mongoose");
mongoose.Promise = global.Promise;
const Company = require("./company-schema");

var ServiceReqResLogSchema = mongoose.Schema({
  id: {
    type: Number,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  request_id: {
    type: String,
    allowNull: true,
  },
  book_entity_id: {
    type: Number,
    allowNull: true,
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
  loan_id: {
    type: String,
    allowNull: true,
  },
  loan_app_id: {
    type: String,
    allowNull: false
  },
  borrower_id: {
    type: String,
    allowNull: true,
  },
  partner_loan_id: {
    type: String,
    allowNull: true,
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
  is_cached_response: {
    type: String,
    allowNull: true,
    defaultValue: "FALSE",
  },
  pan_card: {
    type: String,
    allowNull: true,
  },
  id_number: {
    type: String,
    allowNull: true,
  },
  consent: {
    type: String,
    enum: ["Y", "N"],
    allowNull: true,
  },
  consent_timestamp: {
    type: Date,
    allowNull: true,
  },
  document_uploaded_s3: {
    type: String,
    allowNull: false,
    defaultValue: 0,
  },
  api_response_type: {
    type: String,
    allowNull: false,
    defaultValue: "FAIL",
  },
  api_response_status: {
    type: String,
    allowNull: false,
    defaultValue: "FAIL",
  },
  is_cache: {
    type: String,
    allowNull: true,
    defaultValue: 0,
  },
});
autoIncrement.initialize(mongoose.connection);
ServiceReqResLogSchema.plugin(autoIncrement.plugin, "id");
var ServiceReqResLog = (module.exports = mongoose.model(
  "service_req_res_log",
  ServiceReqResLogSchema
));

//insert single
module.exports.addNew = (serviceData) => {
  const companyFindRes = Company.findById(serviceData.company_id);
  if (!companyFindRes) return null;
  serviceData["company_name"] = companyFindRes.name;
  var insertdata = new ServiceReqResLog(serviceData);
  return insertdata.save();
};

module.exports.addInBulk = (serviceReqResData, callback) => {
  ServiceReqResLog.insertMany(serviceReqResData)
    .then((result) => {
      callback(null, result);
    })
    .catch((err) => {
      callback(err, null);
    });
  /* ServiceReqResLog.bulkCreate(serviceReqResData).then((response) => {
      callback(null, response)
    }).catch((err) => {
      callback(err, null)
    }) */
};

module.exports.tryNew = async (bureauData) => {
  try {
    return ServiceReqResLog.create(bureauData);
  } catch (err) {
    console.log(err);
  }
};

module.exports.findByKycId = (kyc_id, callback) => {
  ServiceReqResLog.findOne({
      kyc_id: kyc_id,
    },
    function(err, result) {
      if (err) callback(err, null);
      callback(null, result);
    }
  );
};

//get filtered service records
module.exports.getRecords = (data) => {
  var query = {};
  const {
    company_id,
    service_id,
    from_date,
    to_date,
    type
  } = data;
  if (company_id) {
    query["$and"] = [];
    query["$and"].push({
      company_id
    });
  }
  if (service_id) query["$and"].push({
    service_id
  });
  if (type) query["$and"].push({
    request_type: type
  });
  if (
    from_date !== "null" &&
    from_date !== "undefined" &&
    from_date !== undefined &&
    from_date !== ""
  ) {
    let date = new Date(from_date);
    date.setHours(0, 0, 0, 0);
    query["$and"].push({
      timestamp: {
        $gte: date,
      },
    });
  }
  if (
    to_date !== "null" &&
    to_date !== "undefined" &&
    to_date !== undefined &&
    to_date !== ""
  ) {
    let date = new Date(to_date);
    date.setHours(23, 59, 59, 999);
    query["$and"].push({
      timestamp: {
        $lte: date,
      },
    });
  }
  return ServiceReqResLog.find(query);
};

//get daily or daywise cibil,experian and crif hit count
module.exports.getDailyServiceHitCount = (date, callback) => {
  ServiceReqResLog.findOne({
      attributes: [
        [
          Sequelize.literal(
            `COUNT(CASE WHEN api_name = 'CIBIL' THEN 1 ELSE NULL END)`
          ),
          "cibil",
        ],
        [
          Sequelize.literal(
            `COUNT(CASE WHEN api_name = 'EXPERIAN' THEN 1 ELSE NULL END)`
          ),
          "experian",
        ],
        [
          Sequelize.literal(
            `COUNT(CASE WHEN api_name = 'CRIF' THEN 1 ELSE NULL END)`
          ),
          "crif",
        ],
      ],
      where: {
        request_type: "response",
        api_response_status: "SUCCESS",
        api_name: ["CIBIL", "EXPERIAN", "CRIF"],
        $and: sequelize.where(
          sequelize.fn("date", sequelize.col("timestamp")),
          "=",
          date
        ),
      },
    })
    .then((response) => {
      callback(null, response);
    })
    .catch((err) => {
      callback(err, null);
    });
};

//get monthly cibil,experian and crif hit count
module.exports.getMonthlyServiceHitCount = (month, callback) => {
  ServiceReqResLog.findAll({
      attributes: [
        [
          Sequelize.literal(
            `COUNT(CASE WHEN api_name = 'CIBIL' THEN 1 ELSE NULL END)`
          ),
          "cibil",
        ],
        [
          Sequelize.literal(
            `COUNT(CASE WHEN api_name = 'EXPERIAN' THEN 1 ELSE NULL END)`
          ),
          "experian",
        ],
        [
          Sequelize.literal(
            `COUNT(CASE WHEN api_name = 'CRIF' THEN 1 ELSE NULL END)`
          ),
          "crif",
        ],
      ],
      where: {
        request_type: "response",
        api_response_status: "SUCCESS",
        api_name: ["CIBIL", "EXPERIAN", "CRIF"],
        $and: sequelize.where(
          sequelize.fn("month", sequelize.col("timestamp")),
          "=",
          month
        ),
      },
    })
    .then((response) => {
      callback(null, response);
    })
    .catch((err) => {
      callback(err, null);
    });
};

//get daily partnerwise service count
module.exports.getDailyPartnerwiseServiceCount = (date, callback) => {
  ServiceReqResLog.findAll({
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("id")), "totalServiceCount"],
        `company_id`,
        `service_id`,
      ],
      where: [
        sequelize.where(
          sequelize.fn("date", sequelize.col("timestamp")),
          "=",
          date
        ),
        {
          request_type: "response",
          api_response_status: "SUCCESS",
        },
      ],
      group: ["company_id", "service_id"],
    })
    .then((response) => {
      callback(null, response);
    })
    .catch((err) => {
      callback(err, null);
    });
};

//get monthly partnerwise service count
module.exports.getMonthlyPartnerwiseServiceCount = (month, year, callback) => {
  ServiceReqResLog.findAll({
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("id")), "totalServiceCount"],
        `company_id`,
        `service_id`,
      ],
      where: [
        sequelize.where(
          sequelize.fn("month", sequelize.col("timestamp")),
          "=",
          month
        ),
        sequelize.where(
          sequelize.fn("year", sequelize.col("timestamp")),
          "=",
          year
        ),
        {
          request_type: "response",
          api_response_status: "SUCCESS",
        },
      ],
      group: ["company_id", "service_id"],
    })
    .then((response) => {
      callback(null, response);
    })
    .catch((err) => {
      callback(err, null);
    });
};

//get daily or daywise cibil,experian and PAN hit count
module.exports.getDailyServicePanCount = (date, callback) => {
  ServiceReqResLog.findAll({
      attributes: [
        [
          Sequelize.literal(
            `COUNT(CASE WHEN (api_name = 'CIBIL' OR api_name = 'CIBIL-V3') THEN 1 ELSE NULL END)`
          ),
          "cibil",
        ],
        [
          Sequelize.literal(
            `COUNT(CASE WHEN api_name = 'EXPERIAN' THEN 1 ELSE NULL END)`
          ),
          "experian",
        ],
        [
          Sequelize.literal(
            `COUNT(CASE WHEN (api_name = 'PAN' OR api_name = 'PAN-KYC' OR api_name = 'PAN-BOOKKING') THEN 1 ELSE NULL END)`
          ),
          "pan",
        ],
      ],
      where: {
        request_type: "response",
        api_response_status: "SUCCESS",
        api_name: [
          "CIBIL",
          "CIBIL-V3",
          "EXPERIAN",
          "PAN",
          "PAN-KYC",
          "PAN-BOOKKING",
        ],
        $and: sequelize.where(
          sequelize.fn("date", sequelize.col("timestamp")),
          "=",
          date
        ),
      },
    })
    .then((response) => {
      callback(null, response);
    })
    .catch((err) => {
      callback(err, null);
    });
};

//get monthly cibil,experian and PAN hit count
module.exports.getMonthlyServicePanCount = (month, year, callback) => {
  ServiceReqResLog.findAll({
      attributes: [
        [
          Sequelize.literal(
            `COUNT(CASE WHEN (api_name = 'CIBIL' OR api_name = 'CIBIL-V3') THEN 1 ELSE NULL END)`
          ),
          "cibil",
        ],
        [
          Sequelize.literal(
            `COUNT(CASE WHEN api_name = 'EXPERIAN' THEN 1 ELSE NULL END)`
          ),
          "experian",
        ],
        [
          Sequelize.literal(
            `COUNT(CASE WHEN (api_name = 'PAN' OR api_name = 'PAN-KYC' OR api_name = 'PAN-BOOKKING') THEN 1 ELSE NULL END)`
          ),
          "pan",
        ],
      ],
      where: [
        sequelize.where(
          sequelize.fn("month", sequelize.col("timestamp")),
          "=",
          month
        ),
        sequelize.where(
          sequelize.fn("year", sequelize.col("timestamp")),
          "=",
          year
        ),
        sequelize.where(sequelize.col("request_type"), "=", "response"),
        sequelize.where(sequelize.col("api_response_status"), "=", "SUCCESS"),
        {
          api_name: [
            "CIBIL",
            "CIBIL-V3",
            "EXPERIAN",
            "PAN",
            "PAN-KYC",
            "PAN-BOOKKING",
          ],
        },
      ],
    })
    .then((response) => {
      callback(null, response);
    })
    .catch((err) => {
      callback(err, null);
    });
};

module.exports.getDateRangeServices = (
  startdate,
  enddate,
  company_id,
  service_id,
  callback
) => {
  ServiceReqResLog.findOne({
      attributes: [
        [
          Sequelize.literal(
            `COUNT(CASE WHEN service_id =${service_id} THEN 1 ELSE NULL END)`
          ),
          "total_count",
        ],
      ],
      where: [
        sequelize.where(
          sequelize.fn("date", sequelize.col("timestamp")),
          ">=",
          startdate
        ),
        sequelize.where(
          sequelize.fn("date", sequelize.col("timestamp")),
          "<=",
          enddate
        ),
        sequelize.where(sequelize.col("request_type"), "=", "response"),
        sequelize.where(sequelize.col("api_response_status"), "=", "SUCCESS"),
        sequelize.where(sequelize.col("company_id"), "=", company_id),
        sequelize.where(sequelize.col("service_id"), "=", service_id),
      ],
    })
    .then((response) => {
      callback(null, response);
    })
    .catch((err) => {
      callback(err, null);
    });
};

module.exports.getByPanCard = (pan_card, service_id, callback) => {
  ServiceReqResLog.find({
    request_type: "response",
    api_response_status: "SUCCESS",
    service_id: service_id,
    pan_card: pan_card,
  }).sort({
      _id: -1,
    },
    callback
  );
  //    ServiceReqResLog.findOne({
  //   where: {
  //     request_type: 'response',
  //     api_response_status: 'SUCCESS',
  //     service_id: service_id,
  //     pan_card: pan_card
  //   },
  //   order: [
  //     ['id', 'DESC']
  //   ]
  // }).then((response) => {
  //   callback(null, response)
  // }).catch((err) => {
  //   callback(err, null)
  // })
};