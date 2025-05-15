import { Schema, Types } from "mongoose"


const TransactionSchema = new Schema({
  type:{
    type:String,
    enum:['credit','debit','opening'],
    reuired:true
  },
  amount:{type:Number,required:true},
  kasar:{type:Number,required:true},
  date:{type:Date,default:Date.now},
  invoices:[
    {
      invoiceId:{type:Types.ObjectId,required:true,refPath:"invoiceType"},
      invoiceType:{
        type:String,
        required:true,
        enum:['Sales','Purchases']
      },
      paidAmount:{type:Number,required:true}
    }
  ],
  balanceAfter:{
    type:Number,
    required:true
  },
  finanacialYear:{
    type:String,
    requried:true
  }
})

const BankLedgerSchema = new Schema({
    userId:{
      type: Types.ObjectId,
      required: true,
      refPath: "userType",
    },
     userType: {
      type: String,
      required: true,
      enum: ["Customer", "Vendor"], 
    },
    Transaction:[TransactionSchema]
}, { timestamps: true })

export const BankLedger = mongoose.model("BankLedger", BankLedgerSchema);

