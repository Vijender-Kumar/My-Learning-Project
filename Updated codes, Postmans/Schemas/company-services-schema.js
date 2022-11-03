var autoIncrement = require("mongoose-auto-increment");
var mongoose = require("mongoose");
const cache = require("memory-cache");
// cache bearer token for 30 mins
const CACHE_EXPIRE = 30 * 60 * 1000;
const CompanyServicesSchema = mongoose.Schema({
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
  company_id: {
    type: Number,
    allowNull: false,
  },
  services: {
    type: String,
    allowNull: false,
  },
});

autoIncrement.initialize(mongoose.connection);
CompanyServicesSchema.plugin(autoIncrement.plugin, "id");
var CompanyServices = (module.exports = mongoose.model("company_services", CompanyServicesSchema));

module.exports.addNew = (data) => {
  var insertdata = new CompanyServices(data);
  return insertdata.save();
};

module.exports.listAll = () => {
  return CompanyServices.find();
};

module.exports.findOneWithCompanyId = async (company_id) => {
  try {
    const cacheKey = "company-services-findone." + company_id;
    var recentCachedData = cache.get(cacheKey);
    if (recentCachedData) return recentCachedData;
    const response = await CompanyServices.findOne({
      company_id
    });
    cache.put(cacheKey, response, CACHE_EXPIRE);
    return response;
  } catch (error) {
    return error;
  }
};

module.exports.updateServices = (data) => {
  const query = {
    company_id: data.company_id
  };
  return CompanyServices.findOneAndUpdate(query, data, {});
};