var autoIncrement = require("mongoose-auto-increment");
const cache = require("memory-cache");
const CACHE_EXPIRE = 30 * 60 * 1000;
var mongoose = require("mongoose");
const ServicesSchema = mongoose.Schema({
  id: {
    type: Number,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  book_entity_id: {
    type: Number,
    allowNull: true,
  },
  service_name: {
    type: String,
    allowNull: false,
  },
  vendor_name: {
    type: String,
    allowNull: false,
  },
  section: {
    type: String,
    allowNull: false,
  },
  url: {
    type: String,
    allowNull: false,
  },
  type: {
    type: String,
    allowNull: false,
  },
  file_s3_path: {
    type: String,
    allowNull: false,
  },
  status: {
    type: Number,
    default: 0,
  },
});

autoIncrement.initialize(mongoose.connection);
ServicesSchema.plugin(autoIncrement.plugin, "id");
var Services = (module.exports = mongoose.model("services", ServicesSchema));

module.exports.addNew = async (data) => {
  try {
    var insertdata = new Services(data);
    return insertdata.save();
  } catch (err) {
    console.log(err);
  }
};

module.exports.listAll = async () => {
  try {
    return await Services.find();
  } catch (err) {
    console.log(err);
  }

  return Services.find(callback);
};

module.exports.findOneWithId = (id) => {
  return Services.findOne({
    _id: id
  });
};

module.exports.findOneWithName = async (service_name) => {
  try {
    return await Services.findOne({
      service_name
    });
  } catch (err) {
    console.log(err);
  }
};

module.exports.updateStatus = (id, status) => {
  const query = {
    _id: id
  };
  return Services.findOneAndUpdate(query, {
    status
  }, {});
};

module.exports.updateService = async (id, data) => {
  try {
    return Services.findOneAndUpdate({
      _id: id
    }, {
      $set: {
        service_name: data.service_name,
        vendor_name: data.vendor_name,
        section: data.section,
        type: data.type,
        url: data.url,
      },
    });
  } catch (err) {
    console.log(err);
  }
};

module.exports.findBySection = (section) => {
  return Services.find({
    section: section
  });
};

module.exports.findOneWithCachedId = (id) => {
  var cacheKeysid = "model-services-schema-verify-company_sid." + id;
  try {
    var recentCachedDataSid = cache.get(cacheKeysid);
    if (recentCachedDataSid) return recentCachedDataSid;
    const serviceIdPresent = Services.findOne({
      _id: id
    }).then((service) => {
      return service;
    });
    if (!serviceIdPresent) return !serviceIdPresent;
    cache.put(cacheKeysid, serviceIdPresent, CACHE_EXPIRE);
    return serviceIdPresent;
  } catch (err) {
    console.log("err", err);
    return err;
  }
};

module.exports.findByIds = (id) => {
  return Services.find({
    _id: id
  });
};