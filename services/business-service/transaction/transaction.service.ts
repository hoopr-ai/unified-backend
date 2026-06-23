import Razorpay from "razorpay";
import crypto from "crypto";
import { AppError } from "../../helper-service/modules.export";
import {
  CartType,
  findCartItems,
  clearBuyNowCart,
  createOrder,
  createOrderInfo,
  updateOrderStatus,
  findOrderInfosWithSku,
  OrderStatus,
  createTransaction,
  findTransactionByRazorpayOrderId,
  updateTransactionStatus,
  TransactionStatus,
  OwnerModel,
  findTransactionsByUserId,
  findTransactionByIdAndUserId,
  createLicenseRecord,
} from "../../persistence-service/exports";
import { findUserAddress } from "../../persistence-service/user/user-address.persistence.service";
import { AddressType } from "../../dto-service/modules.export";
import { Op } from "sequelize";

const getRazorpay = () =>
  new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID as string,
    key_secret: process.env.RAZORPAY_KEY_SECRET as string,
  });

export const initTransactionService = async (userId: number, email: string) => {
  const cartItems = await findCartItems(userId, CartType.BUY_NOW);
  if (!cartItems.length) throw new AppError("Cart is empty", 400);

  // Block transactions containing Chartbuster (enterprise-only) tracks
  const allOwnerIds = cartItems.flatMap((item) => (item.sku?.track as any)?.ownerId ?? []);
  if (allOwnerIds.length) {
    const chartbusterOwner = await OwnerModel.findOne({
      where: { id: { [Op.in]: allOwnerIds }, type: "Chartbusters" },
      attributes: ["id"],
    });
    if (chartbusterOwner) throw new AppError("This track is enterprise-only and cannot be purchased", 403);
  }

  const billingAddress = await findUserAddress(userId, AddressType.BILLING);
  if (!billingAddress) throw new AppError("Billing address is required", 400);

  let totalAmount = 0;
  let totalDiscount = 0;

  for (const item of cartItems) {
    const price = item.sku?.sellingPrice ?? 0;
    totalAmount += price * item.qty;
  }

  const payAmount = totalAmount - totalDiscount;

  const order = await createOrder({
    userId,
    totalDiscount,
    totalAmount,
    payAmount,
    status: OrderStatus.PENDING,
    billingAddress: billingAddress as object,
  });

  for (const item of cartItems) {
    await createOrderInfo({
      orderId: order.id!,
      skuId: item.skuId,
      qty: item.qty,
      discount: 0,
      sellingPrice: item.sku?.sellingPrice ?? 0,
      gstPercent: item.sku?.gstPercent ?? 18,
      maxUsage: item.sku?.maxUsage ?? 1,
    });
  }

  const razorpay = getRazorpay();
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(payAmount * 100),
    currency: "INR",
    receipt: `order_${order.id}`,
  });

  const transaction = await createTransaction({
    orderId: order.id!,
    userId,
    totalDiscount,
    totalAmount,
    payAmount,
    status: TransactionStatus.INITIATED,
    razorpayOrderId: razorpayOrder.id,
    email,
    billingAddress: billingAddress as object,
  });

  return {
    orderId: order.id,
    transactionId: transaction.id,
    razorpayOrderId: razorpayOrder.id,
    amount: payAmount,
    amountInPaise: Math.round(payAmount * 100),
    currency: "INR",
    keyId: process.env.RAZORPAY_KEY_ID,
  };
};

export const commitTransactionService = async (
  userId: number,
  data: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = data;

  // Verify Razorpay signature
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET as string)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expectedSignature !== razorpaySignature) {
    throw new AppError("Payment verification failed", 400);
  }

  const transaction = await findTransactionByRazorpayOrderId(razorpayOrderId);
  if (!transaction) throw new AppError("Transaction not found", 404);
  if (transaction.userId !== userId) throw new AppError("Unauthorized", 401);
  if (transaction.status === TransactionStatus.SUCCESS) {
    throw new AppError("Transaction already completed", 400);
  }

  // Fetch payment details from Razorpay
  const razorpay = getRazorpay();
  const payment = await razorpay.payments.fetch(razorpayPaymentId);

  const paymentMethod = payment.method
    ? payment.method.charAt(0).toUpperCase() + payment.method.slice(1)
    : "Other";

  await updateTransactionStatus(transaction.id!, TransactionStatus.SUCCESS, {
    razorpayPaymentId,
    paymentMethod,
    paymentResponse: payment as object,
  });

  await updateOrderStatus(transaction.orderId, OrderStatus.SUCCESS);

  // Create a license record for each purchased track
  const orderItems = await findOrderInfosWithSku(transaction.orderId);
  const now = new Date();
  const licenses = await Promise.all(
    orderItems
      .filter((item) => (item as any).sku?.trackCode)
      .map((item) =>
        createLicenseRecord({
          userId,
          brandId: null,
          trackCode: (item as any).sku.trackCode,
          tokenCost: 0,
          price: item.sellingPrice,
          type: "pay_per_track",
          licensedAt: now,
          createdAt: now,
        }),
      ),
  );

  // Clear the buy-now cart after successful payment
  await clearBuyNowCart(userId);

  return {
    transactionId: transaction.id,
    orderId: transaction.orderId,
    status: TransactionStatus.SUCCESS,
    paymentMethod,
    licenseIds: licenses.map((l) => l.id),
  };
};

const PAGE_SIZE = 10;

const mapOrderItems = (orderInfos: any[]) =>
  orderInfos.map((info: any) => {
    const track = info.sku?.track ?? null;
    const artists = (track?.trackArtistMappings ?? []).map((m: any) => ({
      id: m.artist?.id ?? null,
      name: m.artist?.name ?? null,
      artistCode: m.artist?.artistCode ?? null,
      type: m.artist?.type ?? null,
      role: m.role,
      isPrimary: m.isPrimary ?? false,
      instagramLink: m.artist?.instagramLink ?? null,
      spotifyLink: m.artist?.spotifyLink ?? null,
    }));

    return {
      skuId: info.skuId,
      itemType: info.sku?.itemType ?? null,
      qty: info.qty,
      sellingPrice: info.sellingPrice,
      discount: info.discount,
      gstPercent: info.gstPercent,
      maxUsage: info.maxUsage,
      track: track
        ? {
            trackCode: track.trackCode,
            name: track.name ?? null,
            duration: track.duration ?? null,
            mp3Link: track.mp3Link ?? null,
            artworkLink: track.artworkLink ?? null,
            bpm: track.bpm ?? null,
            energy: track.energy ?? null,
            displayTags: track.displayTags ?? [],
            artists,
          }
        : null,
    };
  });

export const getTransactionsService = async (userId: number, page: number) => {
  const offset = (page - 1) * PAGE_SIZE;
  const { rows, count } = await findTransactionsByUserId(userId, PAGE_SIZE, offset);

  return {
    transactions: rows.map((t) => {
      const orderInfos: any[] = (t as any).order?.orderInfos ?? [];
      return {
        id: t.id,
        orderId: t.orderId,
        totalAmount: t.totalAmount,
        totalDiscount: t.totalDiscount,
        payAmount: t.payAmount,
        status: t.status,
        paymentMethod: t.paymentMethod ?? null,
        createdAt: t.createdAt,
        items: mapOrderItems(orderInfos),
      };
    }),
    pagination: {
      total: count,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(count / PAGE_SIZE),
    },
  };
};

export const getTransactionDetailService = async (userId: number, transactionId: number) => {
  const transaction = await findTransactionByIdAndUserId(transactionId, userId);
  if (!transaction) throw new AppError("Transaction not found", 404);

  const order = (transaction as any).order;
  const orderInfos: any[] = order?.orderInfos ?? [];

  return {
    id: transaction.id,
    orderId: transaction.orderId,
    totalAmount: transaction.totalAmount,
    totalDiscount: transaction.totalDiscount,
    payAmount: transaction.payAmount,
    status: transaction.status,
    paymentMethod: transaction.paymentMethod ?? null,
    razorpayOrderId: transaction.razorpayOrderId ?? null,
    razorpayPaymentId: transaction.razorpayPaymentId ?? null,
    billingAddress: transaction.billingAddress ?? null,
    createdAt: transaction.createdAt,
    items: orderInfos.map((info: any) => ({
      skuId: info.skuId,
      qty: info.qty,
      sellingPrice: info.sellingPrice,
      discount: info.discount,
      gstPercent: info.gstPercent,
      maxUsage: info.maxUsage,
      track: info.sku?.track
        ? {
            trackCode: info.sku.track.trackCode,
            name: info.sku.track.name,
            duration: info.sku.track.duration,
            mp3Link: info.sku.track.mp3Link,
          }
        : null,
    })),
  };
};
