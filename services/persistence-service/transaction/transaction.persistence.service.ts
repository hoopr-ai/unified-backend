import { TransactionModel, TransactionStatus, type TransactionAttributes } from "./schemas/transaction.schema";
import { OrderModel } from "../order/schemas/order.schema";
import { OrderInfoModel } from "../order/schemas/order-info.schema";
import { SkuModel } from "../sku/schemas/sku.schema";
import { TrackModel } from "../track/schemas/track.schema";

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

export const findTransactionsByUserId = async (
  userId: number,
  limit: number,
  offset: number,
): Promise<{ rows: TransactionModel[]; count: number }> => {
  return TransactionModel.findAndCountAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    attributes: ["id", "orderId", "totalDiscount", "totalAmount", "payAmount", "status", "paymentMethod", "createdAt"],
  });
};

export const findTransactionByIdAndUserId = async (
  id: number,
  userId: number,
): Promise<TransactionModel | null> => {
  return TransactionModel.findOne({
    where: { id, userId },
    include: [
      {
        model: OrderModel,
        include: [
          {
            model: OrderInfoModel,
            include: [
              {
                model: SkuModel,
                include: [{ model: TrackModel, attributes: ["trackCode", "name", "duration", "mp3Link"] }],
              },
            ],
          },
        ],
      },
    ],
  });
};
