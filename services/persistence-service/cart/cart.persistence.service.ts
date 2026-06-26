import { CartModel, CartType, type CartAttributes } from "./schemas/cart.schema";
import { SkuModel } from "../sku/schemas/sku.schema";
import { TrackModel } from "../track/schemas/track.schema";

export const findCartItems = async (
  userId: number,
  cartType?: CartType,
): Promise<CartModel[]> => {
  const where: any = { userId };
  if (cartType) where.cartType = cartType;

  return CartModel.findAll({
    where,
    include: [
      {
        model: SkuModel,
        as: "sku",
        include: [
          {
            model: TrackModel,
            as: "track",
            attributes: ["id", "trackCode", "name", "mp3Link", "waveformLink", "sourceLink", "ownerId", "duration"],
            required: false,
          },
        ],
      },
    ],
    order: [["createdAt", "ASC"]],
  });
};

export const findCartItem = async (
  userId: number,
  skuId: string,
  cartType: CartType,
): Promise<CartModel | null> => {
  return CartModel.findOne({ where: { userId, skuId, cartType } });
};

export const createCartItem = async (data: CartAttributes): Promise<CartModel> => {
  return CartModel.create(data);
};

export const updateCartItemQty = async (
  userId: number,
  skuId: string,
  cartType: CartType,
  qty: number,
): Promise<boolean> => {
  const [updated] = await CartModel.update({ qty }, { where: { userId, skuId, cartType } });
  return updated > 0;
};

export const removeCartItem = async (
  userId: number,
  skuId: string,
  cartType: CartType,
): Promise<boolean> => {
  const deleted = await CartModel.destroy({ where: { userId, skuId, cartType } });
  return deleted > 0;
};

export const clearBuyNowCart = async (userId: number): Promise<void> => {
  await CartModel.destroy({ where: { userId, cartType: CartType.BUY_NOW } });
};
