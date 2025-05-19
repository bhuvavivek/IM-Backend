import { BankLedger } from "../models/Bank-ledger.js";

export const getFinancialYear = (date) =>{
    const now = date ? new Date(date) : new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const financialYear = month >= 4 ? `${year}` : `${year - 1}`;

    return financialYear;
}

export const calculateBalanceAfter = async (userId, userType, transactionAmount, transactionType, session, totalAmount) => {
    const lastLedger = await BankLedger.findOne({userId, userType}).sort({"Transaction.date": -1}).session(session);
    let previousBalance = 0;
    if(lastLedger && lastLedger.Transaction.length){
        previousBalance = lastLedger.Transaction[0].balanceAfter;
    }

    if(transactionType === "opening"){
      return totalAmount;
    }

    if(transactionType === "credit" ){
        return previousBalance + transactionAmount;
    }else{
        return previousBalance - transactionAmount;
    }

}
 