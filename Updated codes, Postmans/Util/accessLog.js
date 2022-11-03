'use strict';
const maintainAcessLog = require('../models/acess-log-schema');
const helper = require('../util/helper.js');
var uuid = require('uuid');
const moment = require('moment');

const maintainAccessLog = async (req, res, next) => {
  try {
    let data = {};
    data.method = `${Object.keys(req.route.methods)}`
    data.user_domain = req.get('host') ? req.get('host') : '';
    data.user_ip = req.connection.remoteAddress;
    data.request_path = req.route.path;
    const authData = req.authData;
    data.api_type = authData ? authData.type : '';
    data.company_code = authData && authData.type === 'api' || authData && authData.type === 'service' || authData && authData.type === 'dash-api' ? authData.company_code : authData && authData.type === 'dash' ? 'Null' : 'Null';
    data.user = authData && authData.user ? req.user.name : 'Null';
    const MaintainAcessLog = await maintainAcessLog.addNew(data);
    if (!MaintainAcessLog) throw ({
      message: 'Error while adding access log'
    })
    next();
  } catch (err) {
    return res.status(400).send({
      err
    });
  }
}

const queueMaintainAccessLog = (req, res, next) => {
  let data = {};
  data.method = `${Object.keys(req.route.methods)}`
  data.user_domain = req.get('host') ? req.get('host') : '';
  data.user_ip = req.connection.remoteAddress;
  data.request_path = req.route.path;
  const authData = req.authData;
  data.api_type = authData ? authData.type : '';
  data.company_code = authData && authData.type === 'api' || authData && authData.type === 'service' || authData && authData.type === 'dash-api' ? authData.company_code : authData && authData.type === 'dash' ? 'Null' : 'Null';
  data.user = authData && authData.user ? req.user.name : 'Null';
  data.timestamp = Date.now();
  const accessLogpath = `pan-service-api-accesslog/${data.company_code}/${moment().format('YYYY-MM-DD')}/${uuid.v4()}.json`;
  helper.uploadFileToS3(data, accessLogpath, (uploadError, uploadResponse) => {
    if (uploadError || !uploadResponse) return res.status(400).send({
      message: 'Error while adding access log to s3'
    });
    next();
  })
}

const billingAccesslog = (data, callback) => {
  const billingLogpath = `pan-service-api-billinglog/${data.company_code}/${moment().format('YYYY-MM-DD')}/${uuid.v4()}.json`;
  helper.uploadFileToS3(data, billingLogpath, (uploadError, uploadResponse) => {
    if (uploadError || !uploadResponse) {
      callback(uploadError, null)
    } {
      callback(null, uploadResponse)
    }
  })

}

const ekyProcessStoreAccessLog = (data, panData, callback) => {
  data.kyc_date = Date.now();
  const ekyProcessStoreAceessLogPath = `pan-ekyprocess-store/${panData.company_code}/${moment().format('YYYY-MM-DD')}/${uuid.v4()}.json`
  helper.uploadFileToS3(data, ekyProcessStoreAceessLogPath, (uploadError, uploadResponse) => {
    if (uploadError || !uploadResponse) {
      callback(uploadError, null)
    } {
      callback(null, uploadResponse)
    }
  })

}

module.exports = {
  maintainAccessLog,
  queueMaintainAccessLog,
  billingAccesslog,
  ekyProcessStoreAccessLog
}