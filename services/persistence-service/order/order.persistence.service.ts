import { OrderModel, OrderStatus, type OrderAttributes } from "./schemas/order.schema";
import { OrderInfoModel, type OrderInfoAttributes } from "./schemas/order-info.schema";
import { SkuModel } from "../sku/schemas/sku.schema";

export const createOrder = async (data: OrderAttributes): Promise<OrderModel> => {
  return OrderModel.create(data);
};

export const createOrderInfo = async (data: OrderInfoAttributes): Promise<OrderInfoModel> => {
  return OrderInfoModel.create(data);
};

export const findOrderById = async (id: number): Promise<OrderModel | null> => {
  return OrderModel.findByPk(id);
};

export const updateOrderStatus = async (
  orderId: number,
  status: OrderStatus,
): Promise<void> => {
  await OrderModel.update({ status }, { where: { id: orderId } });
};

export const findOrderInfosWithSku = async (orderId: number): Promise<OrderInfoModel[]> => {
  return OrderInfoModel.findAll({
    where: { orderId },
    include: [{ model: SkuModel, attributes: ["id", "trackCode"] }],
  });
};
