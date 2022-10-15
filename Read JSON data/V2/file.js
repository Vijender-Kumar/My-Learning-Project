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
