const datajson = require('./data.json');
let accounts = datajson.result.consumerCreditData[0].accounts;
var todayDate = new Date();
let year = todayDate.getFullYear();
let month = ("0" + (todayDate.getMonth() + 1)).slice(-2);
let day = ("0" + todayDate.getDate()).slice(-2);
var formattedTodayDate = day + month + year;
let curr = Date(formattedTodayDate.substring(2, 4) + "-" + formattedTodayDate.substring(0, 2) + "-" + formattedTodayDate.substring(4));
function convert(curr) {
    var date = new Date(curr),
        mnth = ("0" + (date.getMonth() + 1)).slice(-2),
        day = ("0" + date.getDate()).slice(-2);
    return [date.getFullYear(), mnth, day].join("-");
}
const crr = convert(curr);
console.log("Today's Date: " + crr);

const cibilDateFormater = (date_account) => {
  if (date_account) {
      return new Date(date_account.substring(2, 4) + "-" + date_account.substring(0, 2) + "-" + date_account.substring(4))
  } else {
      return null
  }
}

let OpenedDate = new Date(cibilDateFormater(accounts[accounts.length - 1].dateOpened));
const formatYmd = date => date.toISOString().slice(0, 10);
const ydate = formatYmd(OpenedDate);
console.log("First Account opened on Date: " + ydate);

function getMonthDifference(startDate, endDate) {
  return (endDate.getMonth() - startDate.getMonth() + 12 * (endDate.getFullYear() - startDate.getFullYear()));
}
console.log("Vintage in Months: "+ getMonthDifference(
  new Date(ydate), new Date(crr))
);