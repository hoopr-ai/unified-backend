import { AppError } from "../../helper-service/modules.export";
import {
  CartType,
  findCartItems,
  findCartItem,
  createCartItem,
  updateCartItemQty,
  removeCartItem,
  clearBuyNowCart,
} from "../../persistence-service/exports";
import { SkuModel } from "../../persistence-service/sku/schemas/sku.schema";

export interface AddToCartData {
  skuId: string;
  cartType: CartType;
  qty: number;
}

export interface UpdateCartData {
  skuId: string;
  cartType: CartType;
  qty: number;
}

const calculateSummary = (items: any[]) => {
  let subTotal = 0;
  let gst = 0;
  let totalAmount = 0;

  for (const item of items) {
    const price = item.sku?.sellingPrice ?? 0;
    const gstPct = item.sku?.gstPercent ?? 18;
    const itemTotal = price * item.qty;
    const itemBase = itemTotal / (1 + gstPct / 100);

    subTotal += itemBase;
    gst += itemTotal - itemBase;
    totalAmount += itemTotal;
  }

  return {
    subTotal: Math.round(subTotal * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalDiscount: 0,
    payableAmount: Math.round(totalAmount * 100) / 100,
  };
};

export const getCartService = async (userId: number, cartType?: CartType) => {
  const items = await findCartItems(userId, cartType);
  const summary = calculateSummary(items);
  return { items, summary };
};

export const addToCartService = async (userId: number, data: AddToCartData) => {
  const { skuId, cartType, qty } = data;

  const sku = await SkuModel.findOne({ where: { id: skuId } });
  if (!sku) throw new AppError("SKU not found", 404);

  if (cartType === CartType.BUY_NOW) {
    await clearBuyNowCart(userId);
  }

  if (cartType === CartType.REGULAR) {
    const existing = await findCartItem(userId, skuId, cartType);
    if (existing) {
      await updateCartItemQty(userId, skuId, cartType, existing.qty + qty);
      return findCartItem(userId, skuId, cartType);
    }
  }

  return createCartItem({ userId, skuId, cartType, qty });
};

export const updateCartService = async (userId: number, data: UpdateCartData) => {
  const { skuId, cartType, qty } = data;

  if (qty === 0) {
    const removed = await removeCartItem(userId, skuId, cartType);
    if (!removed) throw new AppError("Cart item not found", 404);
    return null;
  }

  const updated = await updateCartItemQty(userId, skuId, cartType, qty);
  if (!updated) throw new AppError("Cart item not found", 404);
  return findCartItem(userId, skuId, cartType);
};
