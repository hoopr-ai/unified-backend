import { TransactionModel, TransactionStatus, type TransactionAttributes } from "./schemas/transaction.schema";

export const createTransaction = async (data: TransactionAttributes): Promise<TransactionModel> => {
  return TransactionModel.create(data);
};

export const findTransactionByRazorpayOrderId = async (
  razorpayOrderId: string,
): Promise<TransactionModel | null> => {
  return TransactionModel.findOne({ where: { razorpayOrderId } });
};

export const findTransactionById = async (id: number): Promise<TransactionModel | null> => {
  return TransactionModel.findByPk(id);
};

export const updateTransactionStatus = async (
  id: number,
  status: TransactionStatus,
  updates?: Partial<TransactionAttributes>,
): Promise<void> => {
  await TransactionModel.update({ status, ...updates }, { where: { id } });
};
