var autoIncrement = require("mongoose-auto-increment");
var mongoose = require("mongoose");
mongoose.Promise = global.Promise;
const biSchema = require("../maps/borrowerinfo");
const BorrowerinfoCommonSchema = mongoose.Schema(biSchema.data);
autoIncrement.initialize(mongoose.connection);
BorrowerinfoCommonSchema.plugin(autoIncrement.plugin, "id");
var BorrowerinfoCommon = (module.exports = mongoose.model(
  "borrowerinfo_common",
  BorrowerinfoCommonSchema
));

const handleCreateFilterQuery = data => {
  const {
    company_id,
    product_id,
    from_date,
    to_date,
    str,
    loan_status,
    minAmount,
    maxAmount
  } = data;
  let obj = {};
  if (company_id) {
    obj = {
      ...obj,
      company_id: company_id
    };
  }
  if (product_id) {
    obj = {
      ...obj,
      product_id: product_id
    };
  }
  if (from_date && to_date) {
    let fromDate = new Date(from_date);
    fromDate.setHours(0, 0, 0, 0);
    let toDate = new Date(to_date);
    toDate.setHours(23, 59, 59, 999);
    obj = {
      ...obj,
      created_at: {
        $gte: fromDate,
        $lte: toDate
      }
    };
  }
  if (minAmount && maxAmount) {
    obj = {
      ...obj,
      sanction_amount: {
        $gte: Number(minAmount),
        $lte: Number(maxAmount)
      }
    };
  }
  if (minAmount && !maxAmount) {
    obj = {
      ...obj,
      sanction_amount: {$gte: Number(minAmount)}
    };
  }
  if (!minAmount && maxAmount) {
    obj = {
      ...obj,
      sanction_amount: {$lte: Number(maxAmount)}
    };
  }
  if (loan_status) {
    obj = {
      ...obj,
      status: loan_status?.value
    };
  }
  if (data.str) {
    obj = {
      ...obj,
      $or: [
        {
          loan_id: {
            $regex: str,
            $options: "i"
          }
        },
        {
          partner_loan_id: {
            $regex: str,
            $options: "i"
          }
        },
        {
          borrower_id: {
            $regex: str,
            $options: "i"
          }
        }
      ]
    };
  }
  return obj;
};

const filterAggregate = async filter => {
  const count = await BorrowerinfoCommon.aggregate([
    conversionStage,
    {
      $match: handleCreateFilterQuery(filter)
    }
  ]);

  const result = await BorrowerinfoCommon.aggregate([
    conversionStage,
    {
      $match: handleCreateFilterQuery(filter)
    }
  ])
    .sort({created_at: -1})
    .skip(filter.pagination.page * filter.pagination.limit)
    .limit(filter.pagination.limit);
  return {rows: result, count: count?.length ?? 0};
};

module.exports.getAllByFilter = async filter => {
  conversionStage = {
    $addFields: {
      sanction_amount: {$toDouble: "$sanction_amount"}
    }
  };

  var query = {};
  const {
    company_id,
    product_id,
    from_date,
    to_date,
    str,
    book_entity_id,
    loan_status,
    minAmount,
    maxAmount
  } = filter;

  let page = 0;
  let limit = 1;

  const isPagination = filter.hasOwnProperty("pagination");
  if (isPagination) {
    page = filter.pagination.page;
    limit = filter.pagination.limit;
  }

  if (company_id) {
    query["$and"] = [];
    query["$and"].push({
      company_id
    });
  }
  if (product_id)
    query["$and"].push({
      product_id
    });
  if (book_entity_id)
    query["$and"].push({
      book_entity_id
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
      created_at: {
        $gte: date
      }
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
      created_at: {
        $lte: date
      }
    });
  }
  if (str !== "" && str !== null && str !== "null" && str !== undefined) {
    query["$and"].push({
      $or: [
        {
          loan_app_id: {
            $regex: str,
            $options: "i"
          }
        },
        {
          partner_loan_id: {
            $regex: str,
            $options: "i"
          }
        },
        {
          loan_id: {
            $regex: str,
            $options: "i"
          }
        }
      ]
    });
  }
  if (isPagination) {
    // const count = await BorrowerinfoCommon.count(query);
    // const records = await BorrowerinfoCommon.find(query)
    //   .skip(page * limit)
    //   .limit(limit)
    //   .sort({
    //     created_at: -1
    //   });
    // return { rows: records, count, count };
    return filterAggregate(filter);
  } else {
    return BorrowerinfoCommon.find(query);
  }
};

module.exports.fastFind = partnerLoanIds => {
  if (partnerLoanIds.length == 1) {
    return BorrowerinfoCommon.findOne({
      partner_loan_id: partnerLoanIds[0]
    });
  } else {
    return BorrowerinfoCommon.find({
      partner_loan_id: {
        $in: partnerLoanIds
      }
    });
  }
};

//bulk insert
module.exports.addInBulk = data => {
  let counter = 0;
  let responseArray = [];
  const myPromise = new Promise((resolve, reject) => {
    data.forEach(record => {
      BorrowerinfoCommon.create(record)
        .then(response => {
          counter++;
          responseArray.push(response);
          if (counter >= data.length);
          resolve(responseArray);
        })
        .catch(err => {
          reject(err);
        });
    });
  });
  return myPromise;
};

module.exports.addNew = data => {
  return BorrowerinfoCommon.create(data);
};

module.exports.findOneWithKLID = loan_id => {
  let query = {
    loan_id: loan_id
  };
  return BorrowerinfoCommon.findOne(query);
};

module.exports.getDisbursementStatusByKLId = loan_id => {
  let query = {
    loan_id: loan_id
  };
  return BorrowerinfoCommon.findOne(query).select("disb_status");
};

module.exports.findOneWithKBI = borrower_id => {
  let query = {
    borrower_id: borrower_id
  };
  return BorrowerinfoCommon.findOne(query);
};

module.exports.findOneWithKBIORKLI = id => {
  let query = {
    $or: [
      {
        loan_id: id
      },
      {
        borrower_id: id
      }
    ]
  };

  return BorrowerinfoCommon.findOne(query);
};

module.exports.updateBI = (biData, loanId) => {
  let query = {
    loan_id: loanId
  };
  return BorrowerinfoCommon.findOneAndUpdate(query, biData, {new: true});
};

module.exports.updateLoanStatus = (data, loan_id) => {
  let query = {
    loan_id: loan_id
  };
  return BorrowerinfoCommon.findOneAndUpdate(query, data, {
    new: true
  });
};

module.exports.updateClStatus = data => {
  let query = {
    loan_id: data.loan_id
  };
  return BorrowerinfoCommon.findOneAndUpdate(query, data, {});
};

module.exports.updateBulk = data => {
  const promise = new Promise((resolve, reject) => {
    try {
      let counter = 0;
      data.forEach(row => {
        let query = {
          loan_app_id: row.loan_app_id,
          borrower_id: row.borrower_id
        };
        delete row.partner_loan_app_id;
        delete row.partner_borrower_id;
        delete row.loan_app_id;
        delete row.borrower_id;
        return BorrowerinfoCommon.findOneAndUpdate(query, row, {new: true})
          .then(result => {
            counter++;
            if (counter == data.length) resolve(result);
          })
          .catch(error => {
            reject(error);
          });
      });
    } catch (error) {
      reject(error);
    }
  });
  return promise;
};

module.exports.updateDisburseDates = data => {
  const promise = new Promise((resolve, reject) => {
    try {
      let counter = 0;
      data.forEach(row => {
        let query = {
          loan_id: row.loan_id
        };
        BorrowerinfoCommon.findOneAndUpdate(query, {
          disburse_date: row.disbursement_date
        })
          .then(result => {
            counter++;
            if (counter == data.length) resolve(result);
          })
          .catch(error => {
            reject(error);
          });
      });
    } catch (error) {
      reject(error);
    }
  });
  return promise;
};

module.exports.updateDisbStatus = (disb_status, id) => {
  let query = {
    _id: id
  };
  return BorrowerinfoCommon.findOneAndUpdate(
    query,
    {
      disb_status: disb_status
    },
    {}
  );
};

module.exports.updateDisbStatusAndUTR = (
  disb_status,
  status,
  disburse_date,
  id
) => {
  let query = {
    _id: id
  };
  return BorrowerinfoCommon.findOneAndUpdate(
    query,
    {
      disb_status: disb_status,
      status: status,
      disburse_date: disburse_date
    },
    {}
  );
};

module.exports.updateEnachData = (data, loan_id, borrower_id) => {
  let query = {
    loan_id: row.loan_id,
    borrower_id: row.borrower_id
  };
  return BorrowerinfoCommon.findOneAndUpdate(query, data, {});
};

module.exports.updateDisbStatusByKLBIId = (
  updateStatus,
  loan_id,
  borrower_id,
  callback
) => {
  let query = {
    loan_id: loan_id,
    borrower_id: borrower_id
  };
  return BorrowerinfoCommon.findOneAndUpdate(query, updateStatus, {})
    .then(response => {
      callback(null, response);
    })
    .catch(err => {
      callback(err, null);
    });
};

module.exports.findByKLBId = (loan_app_id, borrower_id) => {
  let query = {
    loan_app_id: loan_app_id,
    borrower_id: borrower_id
  };
  return BorrowerinfoCommon.findOne(query);
};

module.exports.findKLIByIds = ids => {
  return BorrowerinfoCommon.find({
    loan_id:
      ids.length == 1
        ? ids[0]
        : {
            $in: ids
          }
  });
};

module.exports.getLoanList = async (data, paginate) => {
  try {
    const response = await BorrowerinfoCommon.find(data)
      .skip(paginate.offset)
      .limit(paginate.limit)
      .sort({
        _id: -1
      });
    let count = response.length;
    return {
      count: count,
      rows: response
    };
  } catch (error) {
    return error;
  }
};

module.exports.getBulkLoanData = data => {
  return BorrowerinfoCommon.find(data);
};

module.exports.findByCondition = condition => {
  return BorrowerinfoCommon.findOne(condition);
};

module.exports.findByIds = (ids, callback) => {
  BorrowerinfoCommon.find(
    {
      loan_id:
        ids.length == 1
          ? ids[0]
          : {
              $in: ids
            }
    },
    callback
  ).select(
    "id",
    "company_id",
    "product_id",
    "loan_schema_id",
    "loan_id",
    "borrower_id",
    "partner_loan_id",
    "partner_borrower_id",
    "sanction_amount",
    "disburse_date"
  );
};

module.exports.findKLIByIdsWithCompanyId = (ids, company_id) => {
  return BorrowerinfoCommon.find({
    loan_id: {
      $in: ids
    },
    company_id: company_id
  });
};

module.exports.findAllWithCondition = (condition, callback) => {
  BorrowerinfoCommon.find(condition, callback);
};

module.exports.updateDuesAndIntrestConfiguration = (data, loan_id) => {
  return BorrowerinfoCommon.findOneAndUpdate(
    {
      loan_id: loan_id
    },
    data,
    {}
  );
};

module.exports.getTotal = (data, callback) => {
  BorrowerinfoCommon.find(data, callback);
};

module.exports.updatedBulk = (data, callback) => {
  let counter = 0;
  data.forEach(row => {
    let query = {
      loan_id: row.loan_id
    };
    BorrowerinfoCommon.findOneAndUpdate(query, {
      disb_status: "idfc_initiated"
    })
      .then(result => {
        counter++;
        if (counter == data.length) return callback(null, data);
      })
      .catch(error => {
        return callback(error, null);
      });
  });
};

module.exports.fastFindExistingKLIByIds = loanIds => {
  let counter = 0;
  let responseData = [];
  const myPromise = new Promise((resolve, reject) => {
    loanIds.forEach(record => {
      BorrowerinfoCommon.findOne({
        loan_app_id: record,
        status: "open",
        stage: "0"
      })
        .then(response => {
          responseData.push(response);
          counter++;
          if (counter >= loanIds.length) {
            resolve(responseData);
          }
        })
        .catch(err => {
          reject(err);
        });
    });
  });
  return myPromise;
};

module.exports.updateSanctionAmount = data => {
  let query = {
    loan_id: data.loan_id
  };
  const sanction_amount_val = {
    sanction_amount: data.sanction_amount
  };
  return BorrowerinfoCommon.findOneAndUpdate(query, sanction_amount_val, {});
};

module.exports.updateNfc = (nfc_status, loan_id) => {
  let query = {
    loan_id: loan_id
  };
  const data = {
    nfc_status
  };
  return BorrowerinfoCommon.findOneAndUpdate(query, data, {
    new: true
  });
};

module.exports.updateLoanUsageStatus = (loan_usage_status, loan_id) => {
  let query = {
    loan_id: loan_id
  };
  const data = {
    loan_usage_status
  };
  return BorrowerinfoCommon.findOneAndUpdate(query, data, {
    new: true
  });
};

module.exports.onlineTransactionStatusUpdate = (
  online_transaction_status,
  loan_id
) => {
  let query = {
    loan_id: loan_id
  };
  const data = {
    online_transaction_status
  };
  return BorrowerinfoCommon.findOneAndUpdate(query, data, {
    new: true
  });
};

module.exports.findOpenLoans = loanAppIds => {
  let counter = 0;
  let responseData = [];
  const myPromise = new Promise((resolve, reject) => {
    loanAppIds.forEach(record => {
      BorrowerinfoCommon.findOne({
        loan_app_id: record,
        status: "open",
        stage: "0"
      })
        .then(response => {
          responseData.push(response);
          counter++;
          if (counter >= loanAppIds.length) {
            resolve(responseData);
          }
        })
        .catch(err => {
          reject(err);
        });
    });
  });
  return myPromise;
};

module.exports.checkMultipleSanctionLimit = ids => {
  if (ids.length === 1) {
    return BorrowerinfoCommon.find({
      loan_id: ids[0]
    }).select("loan_id sanction_amount");
  } else {
    return BorrowerinfoCommon.find({
      loan_id: {
        $in: ids
      }
    }).select("loan_id limit_amount");
  }
};

module.exports.findByLId = loan_app_id => {
  let query = {
    loan_app_id: loan_app_id
  };
  return BorrowerinfoCommon.findOne(query);
};

module.exports.findByPartnerLoanAppIds = partnerLoanAppIds => {
  let counter = 0;
  let responseData = [];
  const myPromise = new Promise((resolve, reject) => {
    partnerLoanAppIds.forEach(record => {
      BorrowerinfoCommon.findOne({
        partner_loan_app_id: record
      })
        .then(response => {
          responseData.push(response);
          counter++;
          if (counter >= partnerLoanAppIds.length) {
            resolve(responseData);
          }
        })
        .catch(err => {
          reject(err);
        });
    });
  });
  return myPromise;
};

module.exports.findByLoanAppIds = loanAppIds => {
  let counter = 0;
  let responseData = [];
  const myPromise = new Promise((resolve, reject) => {
    loanAppIds.forEach(record => {
      BorrowerinfoCommon.findOne({
        loan_app_id: record
      })
        .then(response => {
          responseData.push(response);
          counter++;
          if (counter >= loanAppIds.length) {
            resolve(responseData);
          }
        })
        .catch(err => {
          reject(err);
        });
    });
  });
  return myPromise;
};

module.exports.findDisbursedLoan = loan_id => {
  var query = {};
  query["$and"] = [];
  query["$and"].push({
    loan_id,
    status: "disbursed",
    stage: "4"
  });
  return BorrowerinfoCommon.findOne(query);
};

module.exports.findByCIDPID = (loan_id, company_id, product_id) => {
  var query = {};
  query["$and"] = [];
  query["$and"].push({
    loan_id,
    company_id,
    product_id
  });
  return BorrowerinfoCommon.findOne(query);
};

module.exports.getFilteredDisbursalApprovedalRecords = async filter => {
  var query = {};
  const {company_id, product_id, page, limit, status, stage} = filter;

  query["$and"] = [];
  if (company_id) {
    query["$and"].push({
      company_id
    });
  }
  if (product_id) {
    query["$and"].push({
      product_id
    });
  }
  query["$and"].push({
    status: status,
    stage: stage
  });

  const handleCreateQuery = data => {
    const {company_id, product_id, status, stage} = data;
    let obj = {};
    if (company_id) {
      obj = {
        ...obj,
        company_id: company_id
      };
    }
    if (product_id) {
      obj = {
        ...obj,
        product_id: product_id
      };
    }
    if (status) {
      obj = {
        ...obj,
        status: status
      };
    }
    if (stage) {
      obj = {
        ...obj,
        stage: stage
      };
    }
    return obj;
  };

  const count = await BorrowerinfoCommon.find(query).count();
  const rows = await BorrowerinfoCommon.aggregate([
    {
      $match: handleCreateQuery({
        company_id: company_id,
        product_id: product_id,
        status: status,
        stage: Number(stage)
      })
    },
    {
      $lookup: {
        from: "loanrequests",
        localField: "loan_app_id",
        foreignField: "loan_app_id",
        as: "loan_request"
      }
    },
    {
      $lookup: {
        from: "companies",
        localField: "company_id",
        foreignField: "_id",
        as: "company"
      }
    },
    {
      $lookup: {
        from: "products",
        localField: "product_id",
        foreignField: "_id",
        as: "product"
      }
    }
  ])
    .sort({created_at: -1})
    .skip(page * limit)
    .limit(limit);
  return {
    rows: rows,
    count: count
  };
};

module.exports.getFilteredSubventionInvoiceRecords = filter => {
  var query = {};
  const {company_id, product_id, fromDate, toDate, from_date, to_date} = filter;
  query["$and"] = [];
  if (company_id) {
    query["$and"].push({
      company_id
    });
  }
  if (product_id) {
    query["$and"].push({
      product_id
    });
  }
  if (
    from_date !== "null" &&
    from_date !== "undefined" &&
    from_date !== undefined &&
    from_date !== ""
  ) {
    query["$and"].push({
      disbursement_date_time: {
        $gte: fromDate
      }
    });
  }
  if (
    to_date !== "null" &&
    to_date !== "undefined" &&
    to_date !== undefined &&
    to_date !== ""
  ) {
    query["$and"].push({
      disbursement_date_time: {
        $lte: toDate
      }
    });
  }
  return BorrowerinfoCommon.find(query);
};

module.exports.getRecordsOnFilter = filter => {
  let fromDate = new Date(filter.from_date);
  fromDate.setHours(0, 0, 0, 0);
  let toDate = new Date(filter.to_date);
  toDate.setHours(23, 59, 59, 999);
  let query = {
    company_id: filter.company_id,
    product_id: filter.product_id,
    created_at: {$gte: fromDate, $lte: toDate}
  };
  return BorrowerinfoCommon.find(query);
};
