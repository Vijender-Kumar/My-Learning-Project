const datajson = require('./data.json');
let accounts = datajson.result.consumerCreditData[0].accounts;
console.log(accounts);
let date_account = accounts[accounts.length - 1].dateOpened;
console.log(date_account);
// let last_account = accounts[accounts.length - 1].paymentHistory;
// console.log(last_account);
// let arr = last_account.match(/.{1,3}/g);
// let x = 0;
// let z = 0;
// for (let i = 0; i < arr.length; i++) {
//     if (arr[i] == 'XXX') {
//         x++;
//     }
//     else if (arr[i] == '000') {
//         z++;
//     }
// }
// console.log("Number of not reported data: " + x);
// console.log("Number of success payments: " + z);
var todayDate = new Date();
let year = todayDate.getFullYear();
let month = ("0" + (todayDate.getMonth() + 1)).slice(-2);
let day = ("0" + todayDate.getDate()).slice(-2);
var formattedTodayDate = day + month + year;
// console.log(formattedTodayDate);
let curr = Date(formattedTodayDate.substring(2, 4) + "-" + formattedTodayDate.substring(0, 2) + "-" + formattedTodayDate.substring(4));
function convert(curr) {
    var date = new Date(curr),
        mnth = ("0" + (date.getMonth() + 1)).slice(-2),
        day = ("0" + date.getDate()).slice(-2);
    return [date.getFullYear(), mnth, day].join("-");
}
const crr = convert(curr);
console.log(crr);

const cibilDateFormater = (date_account) => {
    if (date_account) {
        return new Date(date_account.substring(2, 4) + "-" + date_account.substring(0, 2) + "-" + date_account.substring(4))
    } else {
        return null
    }
}

let OpenedDate = new Date(cibilDateFormater(accounts[accounts.length - 1].dateOpened));
// console.log(OpenedDate);
const formatYmd = date => date.toISOString().slice(0, 10);
const ydate = formatYmd(OpenedDate);
console.log(ydate);

function getMonthDifference(startDate, endDate) {
    return (endDate.getMonth() - startDate.getMonth() + 12 * (endDate.getFullYear() - startDate.getFullYear()));
}
console.log(getMonthDifference(
    new Date(ydate), new Date(crr))
);



// const paymentHistoryParse = (history)=>{
//     if(history){
//         assetClassification = cibilAssetClassificationMapper[history]
//         if (assetClassification){
//             return assetClassification
//         }else{
//             return history
//         }
//     }
// }

// const accounts = (accounts=[])=>{
//     const tradelines = []

//     accounts.forEach((account)=>{
//         const tradeline = {}
//         tradeline.AccType =  accountTypeMapper[account.accountType]
//         tradeline.AccountNumber = account.accountNumber
//         tradeline.OwnerIndicator = cibilOwnerIndicatorMapper[account.ownershipIndicator]
//         tradeline.CurrentBalance = account.currentBalance
//         tradeline.ReportDate = new Date(cibilDateFormater(account.dateReported))
//         tradeline.CloseDate = new Date(cibilDateFormater(account.paymentEndDate))
//         tradeline.ShortName = account.memberShortName
//         tradeline.OpenedDate = new Date(cibilDateFormater(account.dateOpened))
//         tradeline.CreditLimit = account.CreditLimit
//         tradeline.HighestCredit = account.highCreditAmount
//         tradeline.AmountPastDue = account.amountOverdue
//         tradeline.PaymentHistoryStartDate = new Date(cibilDateFormater(account.paymentStartDate))
//         tradeline.PaymentHistoryEndDate = new Date(cibilDateFormater(account.paymentEndDate))
//         tradeline.SuitFiled =  cibilSuitFieldMapper[account.suitFiled]
//         tradeline.ROI = account.interestRate
//         tradeline.Tenure = account.paymentTenure
//         tradeline.EmiAmt=account.emiAmount
//         tradeline.PaymentTminus1 = paymentHistoryParse(account.paymentHistory.slice(-3))
//         tradeline.PaymentTminus2 = paymentHistoryParse(account.paymentHistory.slice(-6,-3))
//         tradeline.PaymentTminus3 = paymentHistoryParse(account.paymentHistory.slice(-9,-6))
//         tradeline.PaymentTminus4 = paymentHistoryParse(account.paymentHistory.slice(-12,-9))
//         tradeline.PaymentTminus5 = paymentHistoryParse(account.paymentHistory.slice(-15,-12))
//         tradeline.PaymentTminus6 = paymentHistoryParse(account.paymentHistory.slice(-18,-15))
//         tradeline.PaymentTminus7 = paymentHistoryParse(account.paymentHistory.slice(-21,-18))
//         tradeline.PaymentTminus8 = paymentHistoryParse(account.paymentHistory.slice(-24,-21))
//         tradeline.PaymentTminus9 = paymentHistoryParse(account.paymentHistory.slice(-27,-24))
//         tradeline.PaymentTminus10 =paymentHistoryParse( account.paymentHistory.slice(-30,-27))
//         tradeline.PaymentTminus11 =paymentHistoryParse( account.paymentHistory.slice(-33,-30))
//         tradeline.PaymentTminus12 =paymentHistoryParse( account.paymentHistory.slice(-36,-33))
//         tradeline.PaymentTminus13 =paymentHistoryParse( account.paymentHistory.slice(-39,-36))
//         tradeline.PaymentTminus14 =paymentHistoryParse( account.paymentHistory.slice(-42,-39))
//         tradeline.PaymentTminus15 =paymentHistoryParse( account.paymentHistory.slice(-45,-42))
//         tradeline.PaymentTminus16 =paymentHistoryParse( account.paymentHistory.slice(-48,-45))
//         tradeline.PaymentTminus17 =paymentHistoryParse( account.paymentHistory.slice(-51,-48))
//         tradeline.PaymentTminus18 =paymentHistoryParse( account.paymentHistory.slice(-54,-51))
//         tradeline.PaymentTminus19 =paymentHistoryParse( account.paymentHistory.slice(-57,-54))
//         tradeline.PaymentTminus20 =paymentHistoryParse( account.paymentHistory.slice(-60,-57))
//         tradeline.PaymentTminus21 =paymentHistoryParse( account.paymentHistory.slice(-63,-60))
//         tradeline.PaymentTminus22 =paymentHistoryParse( account.paymentHistory.slice(-66,-63))
//         tradeline.PaymentTminus23 =paymentHistoryParse( account.paymentHistory.slice(-69,-66))
//         tradeline.PaymentTminus24 =paymentHistoryParse( account.paymentHistory.slice(-72,-69))
//         tradelines.push(tradeline)
//     })
//     return tradelines
// }
