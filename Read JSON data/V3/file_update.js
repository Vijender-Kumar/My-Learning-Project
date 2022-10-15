const datajson = require('./data.json');

const cibilAssetClassificationMapper = {
    'STD': '000',
    'SMA': '060',
    'SUB': '090',
    'DBT': '090',
    'LSS': '090',
    'XXX': '000'
}

const cibilDateFormater = (date_account) => {
    if (date_account) {
        return new Date(date_account.substring(2, 4) + "-" + date_account.substring(0, 2) + "-" + date_account.substring(4))
    } else {
        return null
    }
}

const formatYmd = (date) => {
    if (date) {
        return date.toISOString().slice(0, 10);
    } else {
        return null
    }
}

const paymentHistoryParse = (history) => {
    if (history) {
        assetClassification = cibilAssetClassificationMapper[history]
        if (assetClassification) {
            return assetClassification
        } else {
            return history
        }
    }
}

const result = (accounts = []) => {
    const payHistory = []
    accounts.forEach((account) => {
        const payHistorys = {}
        payHistorys.OpenedDate = formatYmd(cibilDateFormater(account.dateOpened))
        payHistorys.PaymentHistoryStartDate = formatYmd(cibilDateFormater(account.paymentStartDate))
        payHistorys.PaymentHistoryEndDate = formatYmd(cibilDateFormater(account.paymentEndDate))
        payHistorys.PaymentTminus1 = paymentHistoryParse(account.paymentHistory.slice(-3))
        payHistorys.PaymentTminus2 = paymentHistoryParse(account.paymentHistory.slice(-6, -3))
        payHistorys.PaymentTminus3 = paymentHistoryParse(account.paymentHistory.slice(-9, -6))
        payHistorys.PaymentTminus4 = paymentHistoryParse(account.paymentHistory.slice(-12, -9))
        payHistorys.PaymentTminus5 = paymentHistoryParse(account.paymentHistory.slice(-15, -12))
        payHistorys.PaymentTminus6 = paymentHistoryParse(account.paymentHistory.slice(-18, -15))
        payHistorys.PaymentTminus7 = paymentHistoryParse(account.paymentHistory.slice(-21, -18))
        payHistorys.PaymentTminus8 = paymentHistoryParse(account.paymentHistory.slice(-24, -21))
        payHistorys.PaymentTminus9 = paymentHistoryParse(account.paymentHistory.slice(-27, -24))
        payHistorys.PaymentTminus10 = paymentHistoryParse(account.paymentHistory.slice(-30, -27))
        payHistorys.PaymentTminus11 = paymentHistoryParse(account.paymentHistory.slice(-33, -30))
        payHistorys.PaymentTminus12 = paymentHistoryParse(account.paymentHistory.slice(-36, -33))
        payHistorys.PaymentTminus13 = paymentHistoryParse(account.paymentHistory.slice(-39, -36))
        payHistorys.PaymentTminus14 = paymentHistoryParse(account.paymentHistory.slice(-42, -39))
        payHistorys.PaymentTminus15 = paymentHistoryParse(account.paymentHistory.slice(-45, -42))
        payHistorys.PaymentTminus16 = paymentHistoryParse(account.paymentHistory.slice(-48, -45))
        payHistorys.PaymentTminus17 = paymentHistoryParse(account.paymentHistory.slice(-51, -48))
        payHistorys.PaymentTminus18 = paymentHistoryParse(account.paymentHistory.slice(-54, -51))
        payHistorys.PaymentTminus19 = paymentHistoryParse(account.paymentHistory.slice(-57, -54))
        payHistorys.PaymentTminus20 = paymentHistoryParse(account.paymentHistory.slice(-60, -57))
        payHistorys.PaymentTminus21 = paymentHistoryParse(account.paymentHistory.slice(-63, -60))
        payHistorys.PaymentTminus22 = paymentHistoryParse(account.paymentHistory.slice(-66, -63))
        payHistorys.PaymentTminus23 = paymentHistoryParse(account.paymentHistory.slice(-69, -66))
        payHistorys.PaymentTminus24 = paymentHistoryParse(account.paymentHistory.slice(-72, -69))

        payHistory.push(payHistorys)
    })
    return payHistory
}

const cibilMapper = (datajson) => {
    try {
        payHistory = result(datajson.result.consumerCreditData[0].accounts);
        // console.log(payHistory);
    } catch (e) {
        payHistory = null;
        // console.log(payHistory);
    }
    return {
        payHistorys: payHistory
    }
}
console.log(cibilMapper(datajson));



// let accounts = datajson.result.consumerCreditData[0].accounts;
// // console.log(accounts);
// accounts.forEach((account) =>{
//     let arr = account.paymentHistory.match(/.{1,3}/g);
//     // console.log(paymentHistoryParse(arr));
//     arr.forEach((al)=>{
//         console.log(paymentHistoryParse(al));
//     })
//     console.log();
// })
// let last_account = accounts[0].paymentHistory;
// console.log(last_account);

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
// console.log(arr);
// console.log("Number of not reported data: " + x);
// console.log("Number of success payments: " + z);

// var todayDate = new Date();
// let year = todayDate.getFullYear();
// let month = ("0" + (todayDate.getMonth() + 1)).slice(-2);
// let day = ("0" + todayDate.getDate()).slice(-2);
// var formattedTodayDate = day + month + year;
// console.log(formattedTodayDate);


// const cibilDateFormater = (dateString) => {
//     if (dateString) {
//         return new Date(dateString.substring(2, 4) + "-" + dateString.substring(0, 2) + "-" + dateString.substring(4))
//     } else {
//         return null
//     }
// }

