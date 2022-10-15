const datajson = require('./data.json');

const cibilAssetClassificationMapper = {
    "STD":"000",
    "SMA":"060",
    "SUB":"090",
    "DBT":"090",
    "LSS":"090",
    'XXX':"000"  
}

const paymentHistoryParse = (history)=>{
    if(history){
        assetClassification = cibilAssetClassificationMapper[history]
        if (assetClassification){
            return assetClassification
        }else{
            return history
        }
    }
}

let accounts = datajson.result.consumerCreditData[0].accounts;
// console.log(accounts);
accounts.forEach((account) =>{
    let arr = account.paymentHistory.match(/.{1,3}/g);
    // console.log(paymentHistoryParse(arr));
    arr.forEach((al)=>{
        console.log(paymentHistoryParse(al));
    })
    console.log();
})



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


const cibilDateFormater = (dateString)=>{
    if(dateString){
        return new Date(dateString.substring(2,4)+"-"+dateString.substring(0,2)+"-"+dateString.substring(4))
    }else {
        return null
    }    
}

