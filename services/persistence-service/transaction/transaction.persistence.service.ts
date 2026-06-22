import { TransactionModel, TransactionStatus, type TransactionAttributes } from "./schemas/transaction.schema";
import { OrderModel } from "../order/schemas/order.schema";
import { OrderInfoModel } from "../order/schemas/order-info.schema";
import { SkuModel } from "../sku/schemas/sku.schema";
import { TrackModel } from "../track/schemas/track.schema";
import { TrackArtistMappingModel } from "../artists/schemas/track-artist-mapping.schema";
import { ArtistModel } from "../artists/schemas/artist.schema";

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

const TRACK_ARTIST_INCLUDE = {
  model: TrackModel,
  attributes: ["trackCode", "name", "duration", "mp3Link", "artworkLink", "bpm", "energy", "displayTags"],
  include: [
    {
      model: TrackArtistMappingModel,
      attributes: ["role", "isPrimary"],
      include: [
        {
          model: ArtistModel,
          attributes: ["id", "name", "artistCode", "type", "instagramLink", "spotifyLink"],
        },
      ],
    },
  ],
};

export const findTransactionsByUserId = async (
  userId: number,
  limit: number,
  offset: number,
): Promise<{ rows: TransactionModel[]; count: number }> => {
  const [rows, count] = await Promise.all([
    TransactionModel.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      attributes: ["id", "orderId", "totalDiscount", "totalAmount", "payAmount", "status", "paymentMethod", "createdAt"],
      include: [
        {
          model: OrderModel,
          attributes: ["id"],
          required: false,
          include: [
            {
              model: OrderInfoModel,
              attributes: ["skuId", "qty", "sellingPrice", "discount", "gstPercent", "maxUsage"],
              required: false,
              include: [
                {
                  model: SkuModel,
                  attributes: ["id", "itemType"],
                  required: false,
                  include: [TRACK_ARTIST_INCLUDE],
                },
              ],
            },
          ],
        },
      ],
    }),
    TransactionModel.count({ where: { userId } }),
  ]);
  return { rows, count };
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
