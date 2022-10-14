const datajson = require('./data.json');
let accounts = datajson.result.consumerCreditData[0].accounts;
let last_account = accounts[accounts.length-1];
console.log(last_account.dateOpened);
