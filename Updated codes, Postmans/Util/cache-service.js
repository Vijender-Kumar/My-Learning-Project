"use strict";
const helper = require('../util/s3helper.js');
const bureaurReqResLogSchema = require('../models/service-req-res-log-schema');
const bureau_data = require("../models/bureau-data-schema");  
  
  // Caching mechanism for getting request data from server.
  const callCachedResponseIfExist = async (loanAppID,pan,bureauType,requestID,objData,res) => {         
  var cachedBureau = await bureau_data.findIfExists(loanAppID,pan,"SUCCESS",bureauType);
  if(cachedBureau[0]){
  var cachedUrl = cachedBureau[0].res_url;
  var xmlS3Response = "";
  if(bureauType === "CRIF"){
    xmlS3Response = await helper.fetchXMLFromS3(
    cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
       );
  objData.request_type = 'response';
  objData.raw_data = cachedUrl;
  objData.is_cached_response = 'TRUE';
  //insert request data s3 upload response to database
  await bureaurReqResLogSchema.addNew(objData);    

  return res.status(200).send({
    request_id:requestID,
    data: xmlS3Response
  });
    }
  else if(bureauType === "CIBIL"){
    xmlS3Response = await helper.fetchJsonFromS3(
        cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
           );
  objData.request_type = 'response';
  objData.raw_data = cachedUrl;
  objData.is_cached_response = 'TRUE';
  //insert request data s3 upload response to database
  await bureaurReqResLogSchema.addNew(objData);    

  return res.status(200).send({
    request_id:requestID,
    result: xmlS3Response
  });
  } 
  else if(bureauType === "EXPERIAN"){
    const rawXmlS3Response = await helper.fetchJsonFromS3(
      cachedUrl.substring(cachedUrl.indexOf(cachedBureau[0].bureau_type))
         );
    const regXmlS3Response = rawXmlS3Response.replace(/[\n]/gm, '');
    const find = ["&lt;", "&gt;"];
              const replace = ["<", ">"];
              xmlS3Response = regXmlS3Response.replace(
                  new RegExp(
                      "(" +
                      find
                          .map(function (i) {
                              return i.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
                          })
                          .join("|") +
                      ")",
                      "g"
                  ),
                  function (s) {
                      return replace[find.indexOf(s)];
                  }
              );
  }
  objData.request_type = 'response';
  objData.raw_data = cachedUrl;
  objData.is_cached_response = 'TRUE';
  //insert request data s3 upload response to database
  await bureaurReqResLogSchema.addNew(objData);    

  return res.status(200).send({
    request_id:requestID,
    data: xmlS3Response
  });
}
else return;
  };
module.exports = { callCachedResponseIfExist: callCachedResponseIfExist };

