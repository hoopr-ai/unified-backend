import Razorpay from "razorpay";
import crypto from "crypto";
import {
  AppError,
  generateInvoicePdf,
  uploadBufferToGCS,
  getGCSSignedUrl,
} from "../../helper-service/modules.export";
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
  UserModel,
  UserEntityDetailsModel,
  findTransactionsByUserId,
  findTransactionByIdAndUserId,
  findSuccessTransactionForInvoice,
  createLicenseRecord,
  findLicensesByUserIdAndTrackCodes,
  findUserAddress,
} from "../../persistence-service/exports";
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
    orderId: formatOrderId(order.id!),
    transactionId: formatTransactionId(transaction.id!),
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

  // Clear the buy-now cart after successful payment
  await clearBuyNowCart(userId);

  // Create license records for each purchased track — non-blocking so a DB
  // hiccup here never rolls back an already-confirmed payment response.
  let licenseIds: number[] = [];
  try {
    const [orderItems, userRecord] = await Promise.all([
      findOrderInfosWithSku(transaction.orderId),
      UserModel.findByPk(userId, { attributes: ["id", "brandId"] }),
    ]);
    const brandId = userRecord?.brandId ?? null;
    const now = new Date();
    const validThrough = new Date(now);
    validThrough.setFullYear(validThrough.getFullYear() + 1);
    const licenses = await Promise.all(
      orderItems
        .filter((item) => (item as any).sku?.trackCode)
        .map((item) =>
          createLicenseRecord({
            userId,
            brandId,
            trackCode: (item as any).sku.trackCode,
            tokenCost: 0,
            price: item.sellingPrice,
            type: "pay_per_track",
            licensedAt: now,
            validThrough,
            createdAt: now,
          }),
        ),
    );
    licenseIds = licenses.map((l) => l.id).filter((id): id is number => id != null);
  } catch (err) {
    console.error("License creation failed after payment commit:", err);
  }

  return {
    transactionId: formatTransactionId(transaction.id!),
    orderId: formatOrderId(transaction.orderId),
    status: TransactionStatus.SUCCESS,
    paymentMethod,
    licenseIds,
  };
};

export const formatOrderId = (id: number): string => `ORD-${String(id).padStart(8, "0")}`;
export const formatTransactionId = (id: number): string => `TXN-${String(id).padStart(8, "0")}`;
export const parseTransactionId = (raw: string): number => parseInt(raw.replace(/^TXN-/, ""), 10);

const DEFAULT_PAGE_SIZE = 10;

const mapOrderItems = (orderInfos: any[], licenseMap: Map<string, number>) =>
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

    const trackCode = track?.trackCode ?? null;

    return {
      skuId: info.skuId,
      licenseId: trackCode ? (licenseMap.get(trackCode) ?? null) : null,
      itemType: info.sku?.itemType ?? null,
      qty: info.qty,
      sellingPrice: info.sellingPrice,
      discount: info.discount,
      gstPercent: info.gstPercent,
      maxUsage: info.maxUsage,
      track: track
        ? {
            trackCode,
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

export const getTransactionsService = async (userId: number, page: number, limit: number) => {
  const offset = (page - 1) * limit;
  const { rows, count } = await findTransactionsByUserId(userId, limit, offset);

  // Collect all unique trackCodes across this page of transactions
  const allTrackCodes: string[] = [];
  for (const t of rows) {
    const orderInfos: any[] = (t as any).order?.orderInfos ?? [];
    for (const info of orderInfos) {
      const tc = info.sku?.track?.trackCode;
      if (tc) allTrackCodes.push(tc);
    }
  }

  // Single query to get licenseId per trackCode for this user
  const licenseMap = new Map<string, number>();
  if (allTrackCodes.length > 0) {
    const licenses = await findLicensesByUserIdAndTrackCodes(userId, [...new Set(allTrackCodes)]);
    for (const l of licenses) {
      if (!licenseMap.has(l.trackCode)) licenseMap.set(l.trackCode, l.id);
    }
  }

  return {
    transactions: rows.map((t) => {
      const orderInfos: any[] = (t as any).order?.orderInfos ?? [];
      return {
        id: formatTransactionId(t.id),
        orderId: formatOrderId(t.orderId),
        totalAmount: t.totalAmount,
        totalDiscount: t.totalDiscount,
        payAmount: t.payAmount,
        status: t.status,
        paymentMethod: t.paymentMethod ?? null,
        createdAt: t.createdAt,
        items: mapOrderItems(orderInfos, licenseMap),
      };
    }),
    pagination: {
      total: count,
      page,
      pageSize: limit,
      totalPages: Math.ceil(count / limit),
    },
  };
};

export const getTransactionDetailService = async (userId: number, transactionId: number) => {
  const transaction = await findTransactionByIdAndUserId(transactionId, userId);
  if (!transaction) throw new AppError("Transaction not found", 404);

  const order = (transaction as any).order;
  const orderInfos: any[] = order?.orderInfos ?? [];

  return {
    id: formatTransactionId(transaction.id),
    orderId: formatOrderId(transaction.orderId),
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

export const downloadInvoiceService = async (
  userId: number,
  transactionId: number,
): Promise<{ downloadUrl: string; invoiceNumber: string }> => {
  const transaction = await findSuccessTransactionForInvoice(transactionId, userId);
  if (!transaction) throw new AppError("Transaction not found or payment not completed", 404);

  const txnFormatted = formatTransactionId(transaction.id!);
  const invoiceGcsPath = `invoices/${txnFormatted}/invoice.pdf`;

  // Serve from GCS cache if already generated
  const cached = await getGCSSignedUrl({ gcsPath: invoiceGcsPath });
  if (cached) return { downloadUrl: cached, invoiceNumber: txnFormatted };

  // Fetch user details and entity details in parallel
  const [userRecord, entityDetails] = await Promise.all([
    UserModel.findByPk(userId, { attributes: ["id", "firstName", "lastName", "email", "mobile"] }),
    UserEntityDetailsModel.findOne({ where: { userId }, attributes: ["labelName"] }),
  ]);

  const billing = (transaction.billingAddress ?? {}) as Record<string, any>;
  const order = (transaction as any).order;
  const orderInfos: any[] = order?.orderInfos ?? [];

  const items = orderInfos
    .filter((info: any) => info.sku?.track?.trackCode)
    .map((info: any) => ({
      trackName: info.sku.track.name || "Unknown Track",
      trackCode: info.sku.track.trackCode,
      qty: info.qty,
      sellingPrice: info.sellingPrice,
      discount: info.discount ?? 0,
      gstPercent: info.gstPercent ?? 18,
    }));

  if (items.length === 0) throw new AppError("No track items found in this order", 400);

  const date = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(transaction.createdAt));

  const buyerName =
    [userRecord?.firstName, userRecord?.lastName].filter(Boolean).join(" ") ||
    transaction.email ||
    "Customer";

  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber: txnFormatted,
    orderId: formatOrderId(transaction.orderId),
    date,
    paymentMethod: transaction.paymentMethod ?? "Online",
    buyerName,
    companyName: entityDetails?.labelName ?? undefined,
    email: transaction.email ?? userRecord?.email ?? "",
    mobile: userRecord?.mobile ?? undefined,
    addressLine1: billing.addressLine1,
    addressLine2: billing.addressLine2,
    city: billing.city,
    state: billing.state,
    postalCode: billing.postalCode,
    country: billing.country,
    gstin: billing.gstin,
    pan: billing.pan,
    items,
    totalDiscount: transaction.totalDiscount,
    payAmount: transaction.payAmount,
  });

  const downloadUrl = await uploadBufferToGCS({
    buffer: pdfBuffer,
    gcsPath: invoiceGcsPath,
    contentType: "application/pdf",
  });

  return { downloadUrl, invoiceNumber: txnFormatted };
};
