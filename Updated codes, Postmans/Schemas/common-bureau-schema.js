var autoIncrement = require('mongoose-auto-increment');
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const CommonBureauSchema = new mongoose.Schema({
    id: {
        type: Number,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    CustomerId:{
        type:String,
        allowNull:false,
        unique: true
    },
    PartnerName:{
        type:String
    },
    ProcessedTimeStamp:{
        type:Date
    },
    SourceBureau:{
        type:String
    },
    BureauScore:{
        type:Number
    },
    User:{
        PersonalInfo:{
            DateOfBirth:Date,
            Gender:String,
            FirstName:String,
            LastName:String,
            Addresses:[{
                line1:String,
                line2:String,
                line3:String,
                line4:String,
                line5:String,
                city:String,
                state:String,
                pinCode:String
            }],
            PhoneNumbers:[String],
            Emails:[String]
        },
        KYC:Object,
        ImputedIncome:Number
    },
    Tradelines:[
        {
            AccType:String,
            AccountNumber:String,
            OwnerIndicator:String,
            CurrentBalance:Number,
            ReportDate:Date,
            CloseDate:Date,
            ShortName:String,
            OpenedDate:Date,
            CreditLimit:Number,
            HighestCredit:Number,
            AmountPastDue:Number,
            PaymentStartDate:Date,
            PaymentEndDate:Date,
            SuitFiled:String,
            WrittenOffandSettledStatus: String,            
            WrittenOffAmtTotal: Number,
            WrittenOffAmtPrincipal: Number,
            SettlementAmount: Number,
            ROI:Number,
            Tenure:Number,
            EmiAmt:Number,
            PaymentTminus1: String,
            PaymentTminus2:String,
            PaymentTminus3:String,
            PaymentTminus4:String,
            PaymentTminus5:String,
            PaymentTminus6:String,
            PaymentTminus7:String,
            PaymentTminus8:String,
            PaymentTminus9:String,
            PaymentTminus10:String,
            PaymentTminus11:String,
            PaymentTminus12:String,
            PaymentTminus13:String,
            PaymentTminus14:String,
            PaymentTminus15:String,
            PaymentTminus16:String,
            PaymentTminus17:String,
            PaymentTminus18:String,
            PaymentTminus19:String,
            PaymentTminus20:String,
            PaymentTminus21:String,
            PaymentTminus22:String,
            PaymentTminus23:String,
            PaymentTminus24:String,
            PaymentTminus25:String,
            PaymentTminus26:String,
            PaymentTminus27:String,
            PaymentTminus28:String,
            PaymentTminus29:String,
            PaymentTminus30:String,
            PaymentTminus31:String,
            PaymentTminus32:String,
            PaymentTminus33:String,
            PaymentTminus34:String,
            PaymentTminus35:String,
            PaymentTminus36:String,
        }
    ],
    Enquiries:[{
        EnquiryNumber:Number,
        DateOfEnquiry:Date,
        EnquiryPurpose:String,
        EnquiryAmount:String
    }] 
});

autoIncrement.initialize(mongoose.connection);
CommonBureauSchema.plugin(autoIncrement.plugin, "id");
var CommonBureau =  (module.exports = mongoose.model("common_bureau", CommonBureauSchema));
module.exports.addData = async (data) => {
    try {
        return CommonBureau.create(data);
    } catch (error) {
        return null;
    }
};