const { addData } = require("../models/common-bureau-schema")
const parser = require('xml2js').Parser()
const axios = require("axios")

const cibilGenderMapper = {
    "1":"Female",
    "2":"Male"
}

const stateCodeMapper={
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttaranchal",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Orissa",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "25": "Daman & Diu",
    "26": "Dadra & Nagar Havel & Daman & Diu",
    "27": "Maharashtra",
    "28": "Andhra Pradesh",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Pondicherry",
    "35": "Andaman & Nicobar Islands",
    "36": "Telangana",
    "99": "APO Address"
}

const cibilIdTypesMapper = {
    "01":"PAN",
    "02": "Passport Number",
    "03": "Voter ID",
    "04": "Driver's License",
    "05": "Ration Card Number",
    "06": "Aadhaar Number",
    "07": "Additional ID 1",
    "08": "Additional ID 2"
}

const accountTypeMapper= {
    "00":"Other",
    "01":"Auto Loan (Personal)",
    "02":"Housing Loan",
    "03":"Property Loan",
    "04":"Loan Against Shares / Securities",
    "05":"Personal Loan",
    "06":"Consumer Loan",
    "07":"Gold Loan",
    "08":"Education Loan",
    "09":"Loan to Professional",
    "10":"Credit Card",
    "11":"Leasing",
    "12":"Overdraft",
    "13":"Two-Wheeler Loan",
    "14":"Non-Funded Credit Facility",
    "15":"Loan Against Bank Deposits",
    "16":"Fleet Card",
    "17":"Commercial Vehicle Loan",
    "18":"Telco-Wireless",
    "19":"Telco-Broadband",
    "20":"Telco-Landline",
    "21":"Seller Financing",
    "22":"Seller Financing Soft",
    "23":"GECL Loan Secured",
    "24":"GECL Loan Unsecured",
    "31":"Secured Credit Card",
    "32":"Used Car Loan",
    "33":"Construction Equipment Loan",
    "34":"Tractor Loan",
    "35":"Corporate Credit Card",
    "36":"Kisan Credit Card",
    "37":"Loan on Credit Card",
    "38":"Prime Minister Jaan Dhan Yojana - Overdraft",
    "39":"Mudra Loans - Shishu / Kishor / Tarun",
    "40":"Microfinance - Business Loan",
    "41":"Microfinance - Personal Loan",
    "42":"Microfinance - Housing Loan",
    "43":"Microfinance - Others",
    "44":"Pradhan Mantri Awas Yojana - Credit Link Subsidy Scheme MAY CLSS",
    "45":"P2P Personal Loan",
    "46":"P2P Auto Loan",
    "47":"P2P Education Loan",
    "50":"Business Loan - Secured",
    "51":"Business Loan - General",
    "52":"Business Loan - Priority Sector - Small Business",
    "53":"Business Loan - Priority Sector - Agriculture",
    "54":"Business Loan - Priority Sector - Others",
    "55":"Business Non-Funded Credit Facility - General",
    "56":"Business Non-Funded Credit Facility-Priority Sector- Small Business",
    "57":"Business Non-Funded Credit Facility-Priority Sector-Agriculture",
    "58":"Business Non-Funded Credit Facility-Priority Sector-Others",
    "59":"Business Loan Against Bank Deposits",
    "61":"Business Loan - Unsecured"
}

const cibilOwnerIndicatorMapper = {
    "1" : "Individual",
    "2" : "Authorised User",
    "3" : "Guarantor",
    "4" : "Joint"

}
const cibilSuitFieldMapper = {
    "00": "No Suit filed",
    "01": "Suit filed",
    "02": "Wilful default",
    "03": "Suit filed Wilful default"
    }

const cibilAssetClassificationMapper = {
    "STD":"Standard",
    "SMA":"Special Mention Account",
    "SUB":"Substandard",
    "DBT":"Doubtful",
    "LSS":"Loss",
    "XXX":"Not Reported"  
}

const crifStateMapper = {
    "AP":"Andhra Pradesh ",
    "AR":"Arunachal Pradesh ",
    "AS":"Assam ",
    "BR":"Bihar ",
    "CG":"Chhattisgarh ",
    "GA":"Goa ",
    "GJ":"Gujarat ",
    "HR":"Haryana ",
    "HP":"Himachal Pradesh ",
    "JK":"Jammu & Kashmir ",
    "JH":"Jharkhand ",
    "KA":"Karnataka ",
    "KL":"Kerala",
    "MP":"Madhya Pradesh ",
    "MH":"Maharashtra ",
    "MN":"Manipur ",
    "ML":"Meghalaya",
    "MZ":"Mizoram ",
    "NL":"Nagaland ",
    "OR":"Orissa ",
    "PB":"Punjab ",
    "RJ":"Rajasthan ",
    "SK":"Sikkim ",
    "TN":"Tamil Nadu ",
    "TS":"Telangana ",
    "TR":"Tripura ",
    "UK":"Uttarakhand ",
    "UP":"Uttar Pradesh ",
    "WB":"West Bengal ",
    "AN":"Andaman & Nicobar ",
    "CH":"Chandigarh ",
    "DN":"Dadra and Nagar Haveli ",
    "DD":"Daman & Diu",
    "DL":"Delhi ",
    "LD":"Lakshadweep ",
    "PY":"Pondicherry ",
    "DNHDD":"Dadra & Nagar Haveli and Daman & Diu"
}


const experianGenderMapper= {
    "1": "Male",
    "2": "Female",
    "3": "Transgender"
}

const experianOwnerIndicatorMapper={
    "1":"Individual",
    "2":"Joint",
    "3":"Authorized User",
    "7":"Guarantor",
    "20":"Deceased"
}

const experianSuitFieldMapper = {
    "0": "No Suit filed",
    "1": "Suit filed",
    "2": "Wilful default",
    "3": "Suit filed Wilful default"
    }

const experianWrittenOffandSettledStatusMapper={
    "00":"Restructured",
    "01":"Suit Filed",
    "02":"Wilful Default",
    "03":"Suit Filed (Wilful Default)",
    "04":"Written Off",
    "05":"Suit Filed & Written Off",
    "06":"Wilful Default & Written Off",
    "07":"Suit Filed (Wilful Default) & Written Off",
    "08":"Settled",
    "09":"Post (WO) Settled"
}   

const experianPaymentHistoryMapper = {
    "0":"0-29",
    "1":"30-59",
    "2":"60-89",
    "3":"90-119",
    "4":"120-149",
    "5":"150-179",
    "6":"180+",
    "S":"Standard",
    "B":"Substandard",
    "D":"Doubtful",
    "M":"Special Mention Account",
    "L": "Loss",
    "N":"Not Reported",
    "?":"Not Reported"
}



const intParser= (number)=>{
    return isNaN(parseInt(number))?undefined:parseInt(number)
}

/**************************************************CIBIL MAPPER***********************************************/ 

const cibilProcessedTimeStamp = (header)=>{
    if(header){
        const cibilDate = header.dateProcessed
        const cibilTime = header.timeProcessed
        const timeStamp = new Date(cibilDate.substring(2,4)+"-"+cibilDate.substring(0,2)+"-"+cibilDate.substring(4)+" "+cibilTime.substring(0,2)+":"+cibilTime.substring(2,4)+":"+cibilTime.substring(4))
        return timeStamp
    }else {
        return null
    }
    
}

const cibilDateFormater = (dateString)=>{
    if(dateString){
        return new Date(dateString.substring(2,4)+"-"+dateString.substring(0,2)+"-"+dateString.substring(4))
    }else {
        return null
    }    
}

const nameSplit =  (name)=>{
    splitName = []

    function lastNameSplit(name){
        nameArray = name.split(" ")
            nameArray.shift()
            return nameArray.join(" ")
    }

    if (name){
        splitName[0]=name.split(" ")[0]
        splitName[1]= lastNameSplit(name)
        return splitName
    }else{
        return ["",""]
    }

}

const cibilAddress = (addresses)=>{
    processedAddresses = []
    if(addresses){
        addresses.forEach((address)=>{
            const tempAddress = {}
            tempAddress.line1 = address.line1,
            tempAddress.line2 = address.line2,
            tempAddress.line3 = address.line3,
            tempAddress.line4 = address.line4,
            tempAddress.line5 = address.line5,
            tempAddress.state = stateCodeMapper[address.stateCode],
            tempAddress.pinCode = address.pinCode
            processedAddresses.push(tempAddress)
        })
    }
    return processedAddresses
}

const cibilPhoneNumbers = (telephones)=>{
    processedTelephones = []
    if(telephones){
        telephones.forEach((telephon)=>{
            processedTelephones.push(telephon.telephoneNumber)
        })
    }
    return processedTelephones
}

const cibilEmails = (emails)=>{
    processedemails = []
    if(emails){
        emails.forEach((email)=>{
            processedemails.push(email.emailID)
        })
    }
    return processedemails
}

const cibilKYC = (ids=[])=>{
    kyc ={}
    ids.forEach((id)=>{
        kyc[cibilIdTypesMapper[id.idType]] = id.idNumber
    })
    return kyc
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


// TODO: look for more response data from cibil and find maping for 
// Written-off and Settled Status
// Written-off Amount (Total)
// Written-off Amount (Principal)  
// Settlement Amount

const cibilTradelines = (accounts=[])=>{
    const tradelines = []

    accounts.forEach((account)=>{
        const tradeline = {}
        tradeline.AccType =  accountTypeMapper[account.accountType]
        tradeline.AccountNumber = account.accountNumber
        tradeline.OwnerIndicator = cibilOwnerIndicatorMapper[account.ownershipIndicator]
        tradeline.CurrentBalance = account.currentBalance
        tradeline.ReportDate = new Date(cibilDateFormater(account.dateReported))
        tradeline.CloseDate = new Date(cibilDateFormater(account.paymentEndDate))
        tradeline.ShortName = account.memberShortName
        tradeline.OpenedDate = new Date(cibilDateFormater(account.dateOpened))
        tradeline.CreditLimit = account.CreditLimit
        tradeline.HighestCredit = account.highCreditAmount
        tradeline.AmountPastDue = account.amountOverdue
        tradeline.PaymentHistoryStartDate = new Date(cibilDateFormater(account.paymentStartDate))
        tradeline.PaymentHistoryEndDate = new Date(cibilDateFormater(account.paymentEndDate))
        tradeline.SuitFiled =  cibilSuitFieldMapper[account.suitFiled]
        tradeline.ROI = account.interestRate
        tradeline.Tenure = account.paymentTenure
        tradeline.EmiAmt=account.emiAmount
        tradeline.PaymentTminus1 = paymentHistoryParse(account.paymentHistory.slice(0,3))
        tradeline.PaymentTminus2 = paymentHistoryParse(account.paymentHistory.slice(3,6))
        tradeline.PaymentTminus3 = paymentHistoryParse(account.paymentHistory.slice(6,9))
        tradeline.PaymentTminus4 = paymentHistoryParse(account.paymentHistory.slice(9,12))
        tradeline.PaymentTminus5 = paymentHistoryParse(account.paymentHistory.slice(12,15))
        tradeline.PaymentTminus6 = paymentHistoryParse(account.paymentHistory.slice(15,18))
        tradeline.PaymentTminus7 = paymentHistoryParse(account.paymentHistory.slice(18,21))
        tradeline.PaymentTminus8 = paymentHistoryParse(account.paymentHistory.slice(21,24))
        tradeline.PaymentTminus9 = paymentHistoryParse(account.paymentHistory.slice(24,27))
        tradeline.PaymentTminus10 =paymentHistoryParse( account.paymentHistory.slice(27,30))
        tradeline.PaymentTminus11 =paymentHistoryParse( account.paymentHistory.slice(30,33))
        tradeline.PaymentTminus12 =paymentHistoryParse( account.paymentHistory.slice(33,36))
        tradeline.PaymentTminus13 =paymentHistoryParse( account.paymentHistory.slice(36,39))
        tradeline.PaymentTminus14 =paymentHistoryParse( account.paymentHistory.slice(39,42))
        tradeline.PaymentTminus15 =paymentHistoryParse( account.paymentHistory.slice(42,45))
        tradeline.PaymentTminus16 =paymentHistoryParse( account.paymentHistory.slice(45,48))
        tradeline.PaymentTminus17 =paymentHistoryParse( account.paymentHistory.slice(48,51))
        tradeline.PaymentTminus18 =paymentHistoryParse( account.paymentHistory.slice(51,54))
        tradeline.PaymentTminus19 =paymentHistoryParse( account.paymentHistory.slice(54,57))
        tradeline.PaymentTminus20 =paymentHistoryParse( account.paymentHistory.slice(57,60))
        tradeline.PaymentTminus21 =paymentHistoryParse( account.paymentHistory.slice(60,63))
        tradeline.PaymentTminus22 =paymentHistoryParse( account.paymentHistory.slice(63,66))
        tradeline.PaymentTminus23 =paymentHistoryParse( account.paymentHistory.slice(66,69))
        tradeline.PaymentTminus24 =paymentHistoryParse( account.paymentHistory.slice(69,72))
        tradeline.PaymentTminus25 =paymentHistoryParse( account.paymentHistory.slice(72,75))
        tradeline.PaymentTminus26 =paymentHistoryParse( account.paymentHistory.slice(75,78))
        tradeline.PaymentTminus27 =paymentHistoryParse( account.paymentHistory.slice(78,81))
        tradeline.PaymentTminus28 =paymentHistoryParse( account.paymentHistory.slice(81,84))
        tradeline.PaymentTminus29 =paymentHistoryParse( account.paymentHistory.slice(84,87))
        tradeline.PaymentTminus30 =paymentHistoryParse( account.paymentHistory.slice(87,90))
        tradeline.PaymentTminus31 =paymentHistoryParse( account.paymentHistory.slice(90,93))
        tradeline.PaymentTminus32 =paymentHistoryParse( account.paymentHistory.slice(93,96))
        tradeline.PaymentTminus33 =paymentHistoryParse( account.paymentHistory.slice(96,99))
        tradeline.PaymentTminus34 =paymentHistoryParse( account.paymentHistory.slice(99,102))
        tradeline.PaymentTminus35 =paymentHistoryParse( account.paymentHistory.slice(102,105))
        tradeline.PaymentTminus36 =paymentHistoryParse( account.paymentHistory.slice(105,108))
        tradelines.push(tradeline)
    })
    return tradelines
}

const cibilEnquiries = (enquiries=[])=>{
    const processedEnquiries = []
    enquiries.forEach((enquiry)=>{
        const tempEnquiry = {}
        tempEnquiry.DateOfEnquiry= cibilDateFormater(enquiry.enquiryDate)
        tempEnquiry.EnquiryPurpose= accountTypeMapper[enquiry.enquiryPurpose]
        tempEnquiry.EnquiryAmount= intParser(enquiry.enquiryAmount)
        processedEnquiries.push(tempEnquiry)
    })
    return processedEnquiries
}

const cibilMapper=(customerId,bureau,partnerName,response)=>{
    try{
        processedTimeStamp = cibilProcessedTimeStamp(response.consumerCreditData[0].tuefHeader)
    }catch(e){
        processedTimeStamp = null
    }
    try{
        bureauScore = intParser(response.consumerCreditData[0].scores[0].score) 
    }catch(e){
        bureauScore = null
    }
    try{
        dateOfBirth = cibilDateFormater(response.consumerCreditData[0].names[0].birthDate)
    }catch(e){
        dateOfBirth = null
    }
    try{
        gender = cibilGenderMapper[response.consumerCreditData[0].names[0].gender]
    }catch(e){
        gender = null
    }
    try{
        firstName = nameSplit(response.consumerCreditData[0].names[0].name)[0]
    }catch(e){
        firstName = null
    }
    try{
        lastName = nameSplit(response.consumerCreditData[0].names[0].name)[1]
    }catch(e){
        lastName = null
    }
    try{
        addresses = cibilAddress(response.consumerCreditData[0].addresses)
    }catch(e){
        addresses = null
    }
    try{
        phoneNumbers =cibilPhoneNumbers(response.consumerCreditData[0].telephones)
    }catch(e){
        phoneNumbers = null
    }
    try{
        emails = cibilEmails(response.consumerCreditData[0].emails)
    }catch(e){
        emails = null
    }
    try{
        kyc = cibilKYC(response.consumerCreditData[0].ids)
    }catch(e){
        kyc =null
    }
    try{    
        tradelines = cibilTradelines(response.consumerCreditData[0].accounts)
    }catch(e){
        tradelines = null
    }
    try{
        enquiries= cibilEnquiries(response.consumerCreditData[0].enquiries)
    }catch(e){
        enquiries = null
    }
    return {
        CustomerId : customerId,
        PartnerName: partnerName,
        SourceBureau: bureau,
        ProcessedTimeStamp : processedTimeStamp,
        BureauScore: bureauScore ,
        User:{
            PersonalInfo:{
                DateOfBirth : dateOfBirth,
                Gender: gender,
                FirstName: firstName,
                LastName: lastName,
                Addresses: addresses,
                PhoneNumbers:phoneNumbers,
                Emails: emails
            },
            KYC:kyc,
            ImputedIncome: null
        },
        Tradelines: tradelines,
        Enquiries: enquiries
    }
}


/**************************************************CRIF MAPPER***********************************************/

const crifDateFormater = (crifData)=>{
    if(crifData){
        dateArr = crifData.split("-")
        return new Date(dateArr[1]+"-"+dateArr[0]+"-"+dateArr[2])
    }
    
}

const crifAddress = (addresses)=>{
    processedAddresses = []

    function removeLine(address){
        addressArray = address.split(" ")
        addressArray.pop()
        addressArray.pop()
        addressArray.pop()
        return addressArray.join(" ")
    }

    addresses.forEach((address)=>{
        tempAddress = {
            line1: removeLine(address.VALUE[0]),
            city:address.VALUE[0].split(" ")[address.VALUE[0].split(" ").length-3],
            state: crifStateMapper[address.VALUE[0].split(" ")[address.VALUE[0].split(" ").length-1]],
            pinCode: address.VALUE[0].split(" ")[address.VALUE[0].split(" ").length-2]
        }
        processedAddresses.push(tempAddress)

    })
    return processedAddresses
}

const crifPhoneNumbers = (telephones)=>{
    processedTelephones = []
    if(telephones){
        telephones.forEach((telephon)=>{
            processedTelephones.push(telephon.VALUE[0])
        })
    }
    return processedTelephones
}

const crifEmails = (emails)=>{
    processedemails = []
    if(emails){
        emails.forEach((email)=>{
            processedemails.push(email.VALUE[0])
        })
    }
    return processedemails
}

const crifKyc = (kycArray)=>{
    if(kycArray){
        return kycArray[0].VALUE[0]
    }else{
        return null
    }
}

const crifPaymentHistory = (paymentHistory)=>{
    let paymenthistories = []
    let histories = []
    payments =  paymentHistory.split("|")

    payments.forEach((payment=>{
        if(payment){

        let temps = payment.split(",")
        histories.push(temps[1])
        }
    }))
    
    histories.forEach((history=>{
        let temp = history.split("/")
        paymenthistories.push(temp[0])
    }))
    return paymenthistories
    
}

const crifTradelines = (accounts)=>{
    const tradelines = []

    if(accounts){
        accounts.forEach((account)=>{
            const tradeline = {}
        
            try{
                tradeline.AccType = account["LOAN-DETAILS"][0]["ACCT-TYPE"][0]
            }catch (e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.AccountNumber = account["LOAN-DETAILS"][0]["ACCT-NUMBER"][0]
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.OwnerIndicator = account["LOAN-DETAILS"][0]["OWNERSHIP-IND"][0]
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.CurrentBalance= intParser(account["LOAN-DETAILS"][0]["CURRENT-BAL"][0].split(",").join(""))
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.ReportDate= crifDateFormater(account["LOAN-DETAILS"][0]["DATE-REPORTED"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.CloseDate = crifDateFormater(account["LOAN-DETAILS"][0]["CLOSE-DT"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.CreditLimit = intParser(account["LOAN-DETAILS"][0]["CREDIT-LIMIT"][0].split(",").join(""))
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.HighestCredit= intParser(account["LOAN-DETAILS"][0]["DISBURSED-AMT"][0].split(",").join(""))
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.AmountPastDue=  intParser(account["LOAN-DETAILS"][0]["OVERDUE-AMT"][0].split(",").join(""))
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.PaymentEndDate =  crifDateFormater(account["LOAN-DETAILS"][0]["LAST-PAYMENT-DATE"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.SuitFiled = account["LOAN-DETAILS"][0]["SUIT-FILED_WILFUL-DEFAULT"][0]
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.WrittenOffandSettledStatus = account["LOAN-DETAILS"][0]["WRITTEN-OFF_SETTLED-STATUS"][0]
            }catch(e){
                throw new Error("Tradeline not found for account");
            } 
            try{
                tradeline.WrittenOffAmtTotal = intParser(account["LOAN-DETAILS"][0]["WRITE-OFF-AMT"][0].split(",").join(""))
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.WrittenOffAmtPrincipal = intParser(account["LOAN-DETAILS"][0]["PRINCIPAL-WRITE-OFF-AMT"][0].split(",").join(""))
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
               tradeline.SettlementAmount = intParser(account["LOAN-DETAILS"][0]["SETTLEMENT-AMT"][0].split(",").join(""))     
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.ROI = intParser(account["LOAN-DETAILS"][0]["INTEREST-RATE"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.Tenure = intParser(account["LOAN-DETAILS"][0]["REPAYMENT-TENURE"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.EmiAmt =  intParser(account["LOAN-DETAILS"][0]["INSTALLMENT-AMT"][0].split(",").join(""))
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            
            try{
                paymentHistoryArr = crifPaymentHistory(account["LOAN-DETAILS"][0]["COMBINED-PAYMENT-HISTORY"][0])
            }catch(e){
                paymentHistoryArr = []
            }
            tradeline.PaymentTminus1= paymentHistoryParse(paymentHistoryArr[0])            
            tradeline.PaymentTminus2= paymentHistoryParse(paymentHistoryArr[1])            
            tradeline.PaymentTminus3= paymentHistoryParse(paymentHistoryArr[2])            
            tradeline.PaymentTminus4= paymentHistoryParse(paymentHistoryArr[3])            
            tradeline.PaymentTminus5= paymentHistoryParse(paymentHistoryArr[4])            
            tradeline.PaymentTminus6= paymentHistoryParse(paymentHistoryArr[5])            
            tradeline.PaymentTminus7= paymentHistoryParse(paymentHistoryArr[6])            
            tradeline.PaymentTminus8= paymentHistoryParse(paymentHistoryArr[7])            
            tradeline.PaymentTminus9= paymentHistoryParse(paymentHistoryArr[8])            
            tradeline.PaymentTminus10=paymentHistoryParse(paymentHistoryArr[9])            
            tradeline.PaymentTminus11=paymentHistoryParse(paymentHistoryArr[10])
            tradeline.PaymentTminus12=paymentHistoryParse(paymentHistoryArr[11])
            tradeline.PaymentTminus13=paymentHistoryParse(paymentHistoryArr[12])
            tradeline.PaymentTminus14=paymentHistoryParse(paymentHistoryArr[13])
            tradeline.PaymentTminus15=paymentHistoryParse(paymentHistoryArr[14])
            tradeline.PaymentTminus16=paymentHistoryParse(paymentHistoryArr[15])
            tradeline.PaymentTminus17=paymentHistoryParse(paymentHistoryArr[16])
            tradeline.PaymentTminus18=paymentHistoryParse(paymentHistoryArr[17])
            tradeline.PaymentTminus19=paymentHistoryParse(paymentHistoryArr[18])
            tradeline.PaymentTminus20=paymentHistoryParse(paymentHistoryArr[19])
            tradeline.PaymentTminus21=paymentHistoryParse(paymentHistoryArr[20])
            tradeline.PaymentTminus22=paymentHistoryParse(paymentHistoryArr[21])
            tradeline.PaymentTminus23=paymentHistoryParse(paymentHistoryArr[22])
            tradeline.PaymentTminus24=paymentHistoryParse(paymentHistoryArr[23])
            tradeline.PaymentTminus25=paymentHistoryParse(paymentHistoryArr[24])
            tradeline.PaymentTminus26=paymentHistoryParse(paymentHistoryArr[25])
            tradeline.PaymentTminus27=paymentHistoryParse(paymentHistoryArr[26])
            tradeline.PaymentTminus28=paymentHistoryParse(paymentHistoryArr[27])
            tradeline.PaymentTminus29=paymentHistoryParse(paymentHistoryArr[28])
            tradeline.PaymentTminus30=paymentHistoryParse(paymentHistoryArr[29])
            tradeline.PaymentTminus31=paymentHistoryParse(paymentHistoryArr[30])
            tradeline.PaymentTminus32=paymentHistoryParse(paymentHistoryArr[31])
            tradeline.PaymentTminus33=paymentHistoryParse(paymentHistoryArr[32])
            tradeline.PaymentTminus34=paymentHistoryParse(paymentHistoryArr[33])
            tradeline.PaymentTminus35=paymentHistoryParse(paymentHistoryArr[34])
            tradeline.PaymentTminus36=paymentHistoryParse(paymentHistoryArr[35])
            tradelines.push(tradeline)
        })
    }
    return tradelines

    
}

const crifEnquiries = (enquiries)=>{
    const processedEnquiries = []

    if(enquiries){
        enquiries.forEach((enquiry)=>{
            const tempEnquiry = {}
            try{
                tempEnquiry.DateOfEnquiry= crifDateFormater(enquiry["INQUIRY-DATE"][0])
            }catch(e){
                throw new Error("enquiry error");
            }
            try{
                tempEnquiry.EnquiryPurpose= enquiry["PURPOSE"][0]
            }catch(e){
                throw new Error("enquiry error");
            }
            try{
                tempEnquiry.EnquiryAmount= intParser(enquiry["AMOUNT"][0])
            }catch(e){
                throw new Error("enquiry error");
            }
            try{
                processedEnquiries.push(tempEnquiry)
            }catch(e){
                throw new Error("enquiry error");
            }
            
        })
    }
    
    return processedEnquiries

    
}

const crifMapper = (customerId,bureau,partnerName,response)=>{
    try{
        response = response["INDV-REPORT-FILE"]["INDV-REPORTS"][0]["INDV-REPORT"][0]
    }catch(e){}
    try{
        processedTimeStamp =  crifDateFormater(response["HEADER"][0]["DATE-OF-ISSUE"][0])
    }catch(e){
        processedTimeStamp = null
    }
    try{
        bureauScore = intParser(response["SCORES"][0]["SCORE"][0]["SCORE-VALUE"][0])
    }catch(e){
        bureauScore = null
    }
    try{
        dateOfBirth = crifDateFormater(response["PERSONAL-INFO-VARIATION"][0]["DATE-OF-BIRTH-VARIATIONS"][0]["VARIATION"][0]["VALUE"][0])
    }catch(e){
        dateOfBirth =null
    }
    try{
        gender = response["REQUEST"][0]["GENDER"][0]
    }catch(e){
        gender = null
    }
    try{
        firstName = nameSplit(response["PERSONAL-INFO-VARIATION"][0]["NAME-VARIATIONS"][0]["VARIATION"][0]["VALUE"][0])[0]
    }catch(e){
        firstName =null
    }
    try{
        lastName = nameSplit(response["PERSONAL-INFO-VARIATION"][0]["NAME-VARIATIONS"][0]["VARIATION"][0]["VALUE"][0])[1]
    }catch(e){
        lastName = null
    }
    try{
        addresses = crifAddress(response["PERSONAL-INFO-VARIATION"][0]["ADDRESS-VARIATIONS"][0]["VARIATION"])
    }catch(e){
        addresses = null
    }
    try{
        phoneNumbers = crifPhoneNumbers(response["PERSONAL-INFO-VARIATION"][0]["PHONE-NUMBER-VARIATIONS"][0]["VARIATION"])
    }catch(e){
        phoneNumbers =null
    }
    try{
        emails = crifEmails(response["PERSONAL-INFO-VARIATION"][0]["EMAIL-VARIATIONS"][0]["VARIATION"])
    }catch(e){
        emails =null
    }
    try{    
        pan = crifKyc(response["PERSONAL-INFO-VARIATION"][0]["PAN-VARIATIONS"][0]["VARIATION"])
    }catch(e){
        pan = null
    }
    try{
        passportNumber = crifKyc(response["PERSONAL-INFO-VARIATION"][0]["PASSPORT-VARIATIONS"][0]["VARIATION"])
    }catch(e){
        passportNumber = null
    }
    try{
        voterID = crifKyc(response["PERSONAL-INFO-VARIATION"][0]["VOTER-ID-VARIATIONS"][0]["VARIATION"])
    }catch{
        voterID = null
    }
    try{
        driverLicense = crifKyc(response["PERSONAL-INFO-VARIATION"][0]["DRIVING-LICENSE-VARIATIONS"][0]["VARIATION"])
    }catch(e){
        driverLicense = null
    }
    try{
        rationCardNumber= crifKyc(response["PERSONAL-INFO-VARIATION"][0]["RATION-CARD-VARIATIONS"][0]["VARIATION"])
    }catch(e){
        rationCardNumber = null
    }
    try{
        tradelines = crifTradelines(response["RESPONSES"][0]["RESPONSE"])
    }catch(e){
        tradelines = null
    }
    try{
        enquiries = crifEnquiries(response["INQUIRY-HISTORY"][0]["HISTORY"])
    }catch(e){
        enquiries = null
    }
    return{
        CustomerId : customerId,
        PartnerName: partnerName,
        SourceBureau: bureau,
        ProcessedTimeStamp :  processedTimeStamp,
        BureauScore : bureauScore,
        User:{
            PersonalInfo:{
                DateOfBirth : dateOfBirth,
                Gender: gender,
                FirstName: firstName,
                LastName: lastName,
                Addresses: addresses,
                PhoneNumbers: phoneNumbers,
                Emails: emails
            },
            KYC:{
                "PAN" : pan,
                "Passport Number": passportNumber,
                "Voter ID": voterID,
                "Driver's License": driverLicense,
                "Ration Card Number": rationCardNumber
            },
            ImputedIncome: null
        },
        Tradelines: tradelines,
        Enquiries: enquiries
    }
}

/**************************************************EXPERIAN MAPPER***********************************************/

    
const experianDateFormater = (dateString)=>{
    if(dateString){
        return  new Date(dateString.substring(4,6)+"-"+dateString.substring(6)+"-"+dateString.substring(0,4))
    }
    
}

const experianAddress = (addresses, additionalAddresses)=>{

    function readAdress(adress){
        return {
            line1 : (adress["FlatNoPlotNoHouseNo"]+" "+adress["BldgNoSocietyName"]+" "+adress["RoadNoNameAreaLocality"]).trim(),
            city : adress["City"][0],
            state : stateCodeMapper[adress["State"]],
            pinCode : adress["PINCode"][0]
        }
    } 

    processedAddresses = []

    if(addresses){
        addresses.forEach((address)=>{
            if(typeof address == 'object'){
                tempAdd = readAdress(address)
                processedAddresses.push(tempAdd)
            }
        })
    }
    
    if(additionalAddresses  ){
        additionalAddresses.forEach((address)=>{
            if(typeof address == 'object'){
                tempAdd = readAdress(address)
                processedAddresses.push(tempAdd)
            }     
        })
    }
    return processedAddresses    
}

const experianTradelines = (accounts)=>{
    const tradelines = []
    if(accounts){
        accounts.forEach((account)=>{
            const tradeline = {}
            try{
                tradeline.AccType = accountTypeMapper[account["Account_Type"]] 
            }catch (e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.AccountNumber = account["Account_Number"][0]
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.OwnerIndicator = experianOwnerIndicatorMapper[account["AccountHoldertypeCode"][0]]
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.CurrentBalance= intParser(account["Current_Balance"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.ReportDate= experianDateFormater(account["Date_Reported"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.CloseDate = experianDateFormater(account["Date_Closed"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.ShortName = account["Subscriber_Name"][0]
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.OpenedDate = experianDateFormater(account["Open_Date"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.HighestCredit= intParser(account["Highest_Credit_or_Original_Loan_Amount"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.AmountPastDue=  intParser(account["Amount_Past_Due"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.PaymentEndDate =  experianDateFormater(account["Date_of_Last_Payment"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.SuitFiled = experianSuitFieldMapper[account["SuitFiled_WilfulDefault"][0]]
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.WrittenOffandSettledStatus = experianWrittenOffandSettledStatusMapper[account["SuitFiledWillfulDefaultWrittenOffStatus"][0]]
            }catch(e){
                throw new Error("Tradeline not found for account");
            } 
            try{
                tradeline.WrittenOffAmtTotal = intParser(account["Written_Off_Amt_Total"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.WrittenOffAmtPrincipal = intParser(account["Written_Off_Amt_Principal"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
               tradeline.SettlementAmount = intParser(account["Settlement_Amount"][0])     
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.ROI = intParser(account["Rate_of_Interest"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.Tenure = intParser(account["Repayment_Tenure"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            try{
                tradeline.EmiAmt =  intParser(account["Scheduled_Monthly_Payment_Amount"][0])
            }catch(e){
                throw new Error("Tradeline not found for account");
            }
            tradeline.PaymentTminus1= experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[0]]             
            tradeline.PaymentTminus2= experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[1]]           
            tradeline.PaymentTminus3= experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[2]]           
            tradeline.PaymentTminus4= experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[3]]           
            tradeline.PaymentTminus5= experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[4]]           
            tradeline.PaymentTminus6= experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[5]]           
            tradeline.PaymentTminus7= experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[6]]           
            tradeline.PaymentTminus8= experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[7]]           
            tradeline.PaymentTminus9= experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[8]]           
            tradeline.PaymentTminus10=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[9]]           
            tradeline.PaymentTminus11=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[10]]
            tradeline.PaymentTminus12=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[11]]
            tradeline.PaymentTminus13=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[12]]
            tradeline.PaymentTminus14=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[13]]
            tradeline.PaymentTminus15=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[14]]
            tradeline.PaymentTminus16=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[15]]
            tradeline.PaymentTminus17=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[16]]
            tradeline.PaymentTminus18=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[17]]
            tradeline.PaymentTminus19=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[18]]
            tradeline.PaymentTminus20=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[19]]
            tradeline.PaymentTminus21=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[20]]
            tradeline.PaymentTminus22=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[21]]
            tradeline.PaymentTminus23=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[22]]
            tradeline.PaymentTminus24=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[23]]
            tradeline.PaymentTminus25=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[24]]
            tradeline.PaymentTminus26=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[25]]
            tradeline.PaymentTminus27=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[26]]
            tradeline.PaymentTminus28=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[27]]
            tradeline.PaymentTminus29=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[28]]
            tradeline.PaymentTminus30=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[29]]
            tradeline.PaymentTminus31=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[30]]
            tradeline.PaymentTminus32=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[31]]
            tradeline.PaymentTminus33=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[32]]
            tradeline.PaymentTminus34=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[33]]
            tradeline.PaymentTminus35=experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[34]]
            tradeline.PaymentTminus36 = experianPaymentHistoryMapper[(account["Payment_History_Profile"][0])[35]]
            tradelines.push(tradeline)

        })
        return tradelines
    }

}

const experianEnquiries = (enquiries)=>{
    const processedEnquiries = []

    if(enquiries){
        enquiries.forEach((enquiry)=>{
            const tempEnquiry = {}
            try{
                tempEnquiry.DateOfEnquiry= experianDateFormater(enquiry["Date_of_Request"][0])
            }catch(e){
                throw new Error("enquiry error");
            }
            try{
                tempEnquiry.EnquiryPurpose=  accountTypeMapper[enquiry["Enquiry_Reason"][0]]
            }catch(e){
                throw new Error("enquiry error");
            }
            try{
                tempEnquiry.EnquiryAmount= intParser(enquiry["Amount_Financed"][0])
            }catch(e){
                throw new Error("enquiry error");
            }
            try{
                processedEnquiries.push(tempEnquiry)
            }catch(e){
                throw new Error("enquiry error");
            }
            
        })
    }
    
    return processedEnquiries    
}

const experianMapper = (customerId,bureau,partnerName,response)=>{
    try{
        response = response["SOAP-ENV:Envelope"]["SOAP-ENV:Body"][0]["ns2:processResponse"][0]["ns2:out"][0]["INProfileResponse"][0]
    }catch(e){
        throw new Error("response error");
    }
    try{
        processedTimeStamp = new Date(intParser(response["CreditProfileHeader"][0]["ReportNumber"]))
    }catch(e){
        processedTimeStamp = null
    }
    try{
        bureauScore = intParser(response["SCORE"][0]["BureauScore"][0])
    }catch(e){
        bureauScore = null
    }
    try{
        dateOfBirth = experianDateFormater(response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["Date_Of_Birth_Applicant"][0])
    }catch(e){
        dateOfBirth = null
    }
    try{
        gender = experianGenderMapper[response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["Gender_Code"][0]]
    }catch(e){
        gender = null
    }
    try{
        firstName =  response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["First_Name"][0]
    }catch(e){
        firstName = null
    }
    try{
        lastName = response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["Last_Name"][0]
    }catch(e){
        lastName = null
    }
    try{
        addresses = experianAddress(response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Address_Details"],response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Additional_Address_Details"])
    }catch(e){
        addresses = null
    }
    try{
        phoneNumbers = [response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["Telephone_Number_Applicant_1st"][0]]
    }catch(e){
        phoneNumbers = null
    }
    try{
        emails = [response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["EMailId"][0]]
    }catch(e){
        emails = null
    }
    try{
        pan = response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["IncomeTaxPan"][0]

    }catch(e){
        pan = null
    }
    try{
        passportNumber= response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["Passport_Number"][0]
    }catch(e){
        passportNumber = null
    }
    try{
        voterID = response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["Voter_s_Identity_Card"][0]
    }catch(e){
        voterID = null
    }
    try{
        driverLicense =response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["Driver_License_Number"][0]
    }catch(e){
        driverLicense = null
    }
    try{
        rationCardNumber = response["Current_Application"][0]["Current_Application_Details"][0]["Current_Applicant_Details"][0]["Ration_Card_Number"][0]
    }catch(e){
        rationCardNumber = null
    }
    try{
        imputedIncome = intParser(response["Current_Application"][0]["Current_Application_Details"][0]["Current_Other_Details"][0]["Income"][0])
    }catch(e){
        imputedIncome = null
    }
    try{
        tradelines = experianTradelines(response["CAIS_Account"][0]["CAIS_Account_DETAILS"])
    }catch(e){
        tradelines = null
    }
    try{
        enquiries = experianEnquiries(response["CAPS"][0]["CAPS_Application_Details"])
    }catch(e){
        enquiries = null
    }
    return{
        CustomerId : customerId,
        PartnerName: partnerName,
        SourceBureau: bureau,
        ProcessedTimeStamp : processedTimeStamp,
        BureauScore : bureauScore,
        User:{
            PersonalInfo:{
                DateOfBirth : dateOfBirth,
                Gender: gender,
                FirstName: firstName,
                LastName: lastName,
                Addresses: addresses,
                PhoneNumbers:phoneNumbers,
                Emails: emails,
            },
            KYC:{
                 "PAN": pan,
                 "Passport Number": passportNumber,
                 "Voter ID": voterID,
                 "Driver's License": driverLicense,
                 "Ration Card Number": rationCardNumber,
             },
            ImputedIncome: imputedIncome 
        },
        Tradelines: tradelines,
        Enquiries: enquiries
        
    }

}

const saveData = async (commonBureauSchema) =>{
    try{
        await addData(commonBureauSchema) 
    }catch(e){
        throw new Error(e)
    }
} 


const bureauMapper = (customerId,bureau,partnerName,response)=>{
     
    let commonBureauSchema
        
        if (bureau.toLowerCase() == "cibil"){
            commonBureauSchema = cibilMapper(customerId,bureau,partnerName,response)
        }else if (bureau.toLowerCase() == "crif"){

            parser.parseString(response, function (err,data){
                if (data) {
                commonBureauSchema = crifMapper(customerId,bureau,partnerName,data)
                }
                else{
                    throw new Error()
                }
            })
            
        }else if (bureau.toLowerCase() == "experian"){
            parser.parseString(response, function (err,data){
                if (data) {   
                    commonBureauSchema = experianMapper(customerId,bureau,partnerName,data)
                }
                else{
                    throw new Error()
                }
            })
        
        }else {
            throw new Error("Invalid Bureau Name")
        }

        return commonBureauSchema
}

module.exports.CommonBureauMapper = async (customerId,bureau,partnerName,response,request_id,callback)=>{

    try{
        commonBureauSchema = bureauMapper(customerId,bureau,partnerName,response) 
        await saveData(commonBureauSchema)
        const aScoreURL = process.env.A_SCORE_URL + "/api/a-score-card";
        const key = process.env.A_SCORE_KEY;
        data = {
            "request_id" : request_id,
            "parser_response" : commonBureauSchema
        }
        const config = {
            headers: {
                "access-token": key,
                "Content-Type": "application/json",
            },
        }
        axios.post(aScoreURL, JSON.stringify(data), config)
        callback(undefined,"Success")
    }catch(e){
        callback("something went wrong",undefined)
    }
}