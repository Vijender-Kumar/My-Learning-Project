const datajson = require('./data.json');
let accounts = datajson.result.consumerCreditData[0].accounts;
const cibilDateFormater = (date_account) => {
    if (date_account) {
        return new Date(date_account.substring(2, 4) + "-" + date_account.substring(0, 2) + "-" + date_account.substring(4))
    } else {
        return null
    }
}

let OpenedDate = new Date(cibilDateFormater(accounts[0].dateOpened));
const formatYmd = date => date.toISOString().slice(0, 10);
const ldate = formatYmd(OpenedDate);
console.log("Last Account opened on Date: " + ldate);

const cdate = new Date();
function getMonthDifference(startDate, endDate) {
    return (endDate.getMonth() - startDate.getMonth() + 12 * (endDate.getFullYear() - startDate.getFullYear()));
}
const vin_diff = getMonthDifference(new Date(ldate), new Date(cdate));
console.log("Vintage in Months for latest account: " + vin_diff);
if(vin_diff > 24){
    console.log("Vintage difference is greater than 24 months !!!! Hence no dpd calculations for this account");
}

let firstOpenedDate = new Date(cibilDateFormater(accounts[accounts.length -1].dateOpened));
const formatfYmd = date => date.toISOString().slice(0, 10);
const fdate = formatfYmd(firstOpenedDate);
console.log("Last Account opened on Date: " + fdate);
const vin_f_diff = getMonthDifference(new Date(fdate), new Date(cdate));
console.log("Vintage in Months for first account: " + vin_f_diff);


// function subMonths(numOfMonths, date = new Date()) {
//     date.setMonth(date.getMonth() - numOfMonths);
//     return date;
// }
// const date = new Date();
// const strtDate = 24;
// for (let index = 0; index <= strtDate-1; index++) {
//     const ndate = subMonths(1, date);
//     const formatYmd = date => date.toISOString().slice(0, 10);
//     const ydate = formatYmd(ndate);
//     console.log(ydate);
// }