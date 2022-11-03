const {
  reject
} = require('lodash');
const cache = require('memory-cache');
// cache a loan_id for 60 secs
const CACHE_EXPIRE = 60 * 1000;
var cacheRecentlyExistingColumn = function(schema, column, row, expiry) {
  var tableName = schema.TableName;
  const cacheKey = `${tableName}.${column}.${row[column]}.exists`;
  console.log(`cacheRecentlyExisting, setting ${cacheKey} to true`);
  cache.put(cacheKey, row, expiry || CACHE_EXPIRE);
};

var bustRecentlyExisting = function(schema, column, ids) {
  var tableName = schema.TableName;
  ids = Array.isArray(ids) ? ids : [ids];
  ids.map(id => {
    //bust cache
    const cacheKey = `${tableName}.${column}.${id}.exists`;
    console.log(`cacheRecentlyExisting, busting ${cacheKey}`);
    cache.del(cacheKey);
    checkRecentlyExisting(schema, column, ids);
  });
};

var checkRecentlyExisting = async function(schema, column, ids, callback) {
  var tableName = schema.TableName;
  var acc = [];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    const cacheKey = `${tableName}.${column}.${id}.exists`;
    var recentCachedData = cache.get(cacheKey);
    if (recentCachedData) {
      console.log(`checkcacheRecentlyExisting: got cache HIT for ${cacheKey}`);
      acc.push(recentCachedData);
    } else {
      var q = schema.fastFind ? schema.fastFind : schema.find;
      await q(column, id)
        .then((row) => {
          if (row) {
            acc.push(row);
            cacheRecentlyExistingColumn(schema, column, row);
          }
        })
        .catch(err => console.log('checkRecentlyExisting: nothing in db for ', id, ' err:', err))
    }
  }
  if (callback) {
    callback(null, acc)
  }
};

module.exports = {
  cacheRecentlyExistingColumn,
  bustRecentlyExisting,
  checkRecentlyExisting
};