import Razorpay from "razorpay";
import crypto from "crypto";
import {
  AppError,
  generateInvoicePdf,
  uploadBufferToGCS,
  getGCSSignedUrl,
  sendInvoiceEmail,
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
  claimTransactionSuccess,
  markTransactionFailedIfInitiated,
  TransactionStatus,
  OwnerModel,
  UserModel,
  findTransactionsByUserId,
  findTransactionByIdAndUserId,
  findSuccessTransactionForInvoice,
  createLicenseRecord,
  findLicensesByUserIdAndTrackCodes,
  findUserAddress,
  createWebhookLog,
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

// Post-payment side effects shared by browser commit and the Razorpay webhook.
// Must only run once per transaction — callers gate on claimTransactionSuccess.
const finalizeSuccessfulPayment = async (
  userId: number,
  transactionId: number,
  orderId: number,
): Promise<number[]> => {
  await updateOrderStatus(orderId, OrderStatus.SUCCESS);

  // Clear the buy-now cart after successful payment
  await clearBuyNowCart(userId);

  // Create license records for each purchased track — non-blocking so a DB
  // hiccup here never rolls back an already-confirmed payment response.
  let licenseIds: number[] = [];
  try {
    const [orderItems, userRecord] = await Promise.all([
      findOrderInfosWithSku(orderId),
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

  // Fire invoice PDF generation + email right after payment success.
  // Non-blocking — failure here never affects the commit response.
  triggerPurchaseEmail(userId, transactionId);

  return licenseIds;
};

// Response for a commit that arrives after the webhook already finalized the
// transaction — report success (the user did pay) with the existing licenses.
const alreadyCommittedResponse = async (userId: number, transaction: any) => {
  let licenseIds: number[] = [];
  try {
    const orderItems = await findOrderInfosWithSku(transaction.orderId);
    const trackCodes = orderItems
      .map((item) => (item as any).sku?.trackCode)
      .filter((tc): tc is string => Boolean(tc));
    if (trackCodes.length) {
      const licenses = await findLicensesByUserIdAndTrackCodes(userId, [...new Set(trackCodes)]);
      licenseIds = licenses.map((l) => l.id);
    }
  } catch (err) {
    console.error("License lookup for already-committed transaction failed:", err);
  }
  return {
    transactionId: formatTransactionId(transaction.id!),
    orderId: formatOrderId(transaction.orderId),
    status: TransactionStatus.SUCCESS,
    paymentMethod: transaction.paymentMethod ?? "Other",
    licenseIds,
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
  if (Number(transaction.userId) !== Number(userId)) throw new AppError("Unauthorized", 401);
  if (transaction.status === TransactionStatus.SUCCESS) {
    // Webhook beat the browser callback — idempotent success, not an error.
    return alreadyCommittedResponse(userId, transaction);
  }

  // Fetch payment details from Razorpay
  const razorpay = getRazorpay();
  const payment = await razorpay.payments.fetch(razorpayPaymentId);

  const paymentMethod = payment.method
    ? payment.method.charAt(0).toUpperCase() + payment.method.slice(1)
    : "Other";

  const claimed = await claimTransactionSuccess(transaction.id!, {
    razorpayPaymentId,
    paymentMethod,
    paymentResponse: payment as object,
  });
  if (!claimed) {
    // Webhook won the race between our status check and the update.
    return alreadyCommittedResponse(userId, transaction);
  }

  const licenseIds = await finalizeSuccessfulPayment(userId, transaction.id!, transaction.orderId);

  return {
    transactionId: formatTransactionId(transaction.id!),
    orderId: formatOrderId(transaction.orderId),
    status: TransactionStatus.SUCCESS,
    paymentMethod,
    licenseIds,
  };
};

// Persist one webhook_logs row per delivery — fire-and-forget, never lets a
// logging failure affect the webhook response Razorpay sees.
const logWebhookDelivery = (
  rawBody: Buffer | string,
  details: {
    eventId?: string;
    signatureValid: boolean;
    handled?: boolean | null;
    result?: string | null;
    error?: string | null;
  },
): void => {
  let payload: object | null = null;
  let eventType: string | null = null;
  let razorpayOrderId: string | null = null;
  let razorpayPaymentId: string | null = null;
  try {
    payload = JSON.parse(rawBody.toString());
    const p: any = payload;
    eventType = p?.event ?? null;
    razorpayOrderId = p?.payload?.payment?.entity?.order_id ?? null;
    razorpayPaymentId = p?.payload?.payment?.entity?.id ?? null;
  } catch {
    // Unparseable body — still log the delivery with what we have.
  }

  createWebhookLog({
    provider: "razorpay",
    eventId: details.eventId ?? null,
    eventType,
    razorpayOrderId,
    razorpayPaymentId,
    signatureValid: details.signatureValid,
    handled: details.handled ?? null,
    result: details.result ?? null,
    error: details.error ?? null,
    payload,
  }).catch((err) => console.error("Webhook DB logging failed:", err));
};

// ─── Razorpay webhook (payment.captured / order.paid / payment.failed) ────────
// Safety net for payments that succeed on Razorpay but never reach /commit
// (user closed the tab, network drop, app crash). Razorpay retries non-2xx
// deliveries for 24h, so only signature failures should error out.
export const handleRazorpayWebhookService = async (
  rawBody: Buffer | string,
  signature: string,
  eventId?: string,
): Promise<{ handled: boolean; reason: string }> => {
  // TESTING ONLY — RAZORPAY_WEBHOOK_SKIP_SIGNATURE=true accepts deliveries
  // without verifying the signature. Never enable in production: anyone who
  // can reach the endpoint could mark transactions as paid.
  const skipSignature = process.env.RAZORPAY_WEBHOOK_SKIP_SIGNATURE === "true";
  let signatureValid = false;

  if (skipSignature) {
    console.warn(
      "⚠️ Razorpay webhook signature verification BYPASSED (RAZORPAY_WEBHOOK_SKIP_SIGNATURE=true)",
    );
  } else {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      logWebhookDelivery(rawBody, {
        eventId,
        signatureValid: false,
        error: "RAZORPAY_WEBHOOK_SECRET not configured",
      });
      throw new AppError("Webhook secret not configured", 500);
    }

    const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (expectedSignature !== signature) {
      logWebhookDelivery(rawBody, { eventId, signatureValid: false, error: "Invalid webhook signature" });
      throw new AppError("Invalid webhook signature", 400);
    }
    signatureValid = true;
  }

  try {
    const outcome = await processRazorpayWebhookEvent(rawBody);
    logWebhookDelivery(rawBody, {
      eventId,
      signatureValid,
      handled: outcome.handled,
      result: skipSignature ? `[signature bypassed] ${outcome.reason}` : outcome.reason,
    });
    return outcome;
  } catch (err) {
    logWebhookDelivery(rawBody, { eventId, signatureValid, error: String(err) });
    throw err;
  }
};

const processRazorpayWebhookEvent = async (
  rawBody: Buffer | string,
): Promise<{ handled: boolean; reason: string }> => {
  const event = JSON.parse(rawBody.toString());
  const eventType: string = event?.event ?? "";
  const payment = event?.payload?.payment?.entity;
  const razorpayOrderId: string | undefined = payment?.order_id;

  if (eventType === "payment.captured" || eventType === "order.paid") {
    if (!razorpayOrderId) return { handled: false, reason: "no order_id in payload" };

    const transaction = await findTransactionByRazorpayOrderId(razorpayOrderId);
    if (!transaction) {
      console.error(`Razorpay webhook: no transaction for order ${razorpayOrderId}`);
      return { handled: false, reason: "unknown razorpay order" };
    }

    const paymentMethod = payment.method
      ? payment.method.charAt(0).toUpperCase() + payment.method.slice(1)
      : "Other";

    const claimed = await claimTransactionSuccess(transaction.id!, {
      razorpayPaymentId: payment.id,
      paymentMethod,
      paymentResponse: payment as object,
    });
    if (!claimed) return { handled: true, reason: "already committed" };

    await finalizeSuccessfulPayment(
      Number(transaction.userId),
      transaction.id!,
      transaction.orderId,
    );
    return { handled: true, reason: "committed via webhook" };
  }

  if (eventType === "payment.failed") {
    if (!razorpayOrderId) return { handled: false, reason: "no order_id in payload" };

    const transaction = await findTransactionByRazorpayOrderId(razorpayOrderId);
    if (!transaction) return { handled: false, reason: "unknown razorpay order" };

    const marked = await markTransactionFailedIfInitiated(transaction.id!, {
      paymentResponse: payment as object,
    });
    if (marked) await updateOrderStatus(transaction.orderId, OrderStatus.FAILED);
    return { handled: marked, reason: marked ? "marked failed" : "not in INITIATED state" };
  }

  return { handled: false, reason: `ignored event ${eventType}` };
};

// ─── Manual reconciliation (scripts/reconcile-razorpay-order.ts) ──────────────
// Settles a transaction whose payment was captured at Razorpay but never
// reached SUCCESS here — e.g. paid before the webhook went live, or the
// webhook delivery failed. Fetches the order's payments straight from the
// Razorpay API, so it needs no signature and is safe to re-run (idempotent
// via claimTransactionSuccess).
export const reconcileRazorpayOrderService = async (razorpayOrderId: string) => {
  const transaction = await findTransactionByRazorpayOrderId(razorpayOrderId);
  if (!transaction) throw new AppError(`No transaction for Razorpay order ${razorpayOrderId}`, 404);

  const txnId = formatTransactionId(transaction.id!);
  if (transaction.status === TransactionStatus.SUCCESS) {
    return { reconciled: false, reason: "already SUCCESS", transactionId: txnId };
  }

  const razorpay = getRazorpay();
  const { items: payments } = await razorpay.orders.fetchPayments(razorpayOrderId);
  const captured = payments.find((p: any) => p.status === "captured");
  if (!captured) {
    const statuses = payments.map((p: any) => `${p.id}:${p.status}`).join(", ") || "none";
    return { reconciled: false, reason: `no captured payment (${statuses})`, transactionId: txnId };
  }

  const paymentMethod = captured.method
    ? captured.method.charAt(0).toUpperCase() + captured.method.slice(1)
    : "Other";

  const claimed = await claimTransactionSuccess(transaction.id!, {
    razorpayPaymentId: captured.id,
    paymentMethod,
    paymentResponse: captured as object,
  });
  if (!claimed) {
    return { reconciled: false, reason: "claimed by another path mid-run", transactionId: txnId };
  }

  const licenseIds = await finalizeSuccessfulPayment(
    Number(transaction.userId),
    transaction.id!,
    transaction.orderId,
  );

  return {
    reconciled: true,
    transactionId: txnId,
    orderId: formatOrderId(transaction.orderId),
    razorpayPaymentId: captured.id,
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

// ─── Shared invoice builder ───────────────────────────────────────────────────
// Generates the invoice PDF, uploads it to GCS, and returns everything needed
// for both the download response and the purchase email.
// Returns null if the transaction has no purchasable track items.
const buildAndCacheInvoice = async (userId: number, transactionId: number) => {
  const transaction = await findSuccessTransactionForInvoice(transactionId, userId);
  if (!transaction) return null;

  const txnFormatted = formatTransactionId(transaction.id!);
  const invoiceGcsPath = `invoices/${txnFormatted}/invoice.pdf`;

  const userRecord = await UserModel.findByPk(userId, {
    attributes: ["id", "firstName", "lastName", "email", "mobile"],
  });

  const billing = (transaction.billingAddress ?? {}) as Record<string, any>;
  const orderInfos: any[] = (transaction as any).order?.orderInfos ?? [];

  const items = orderInfos
    .filter((info: any) => info.sku?.track?.trackCode)
    .map((info: any) => {
      const track = info.sku.track;
      const artists: string[] = (track?.trackArtistMappings ?? [])
        .filter((m: any) => m.isPrimary && m.artist?.name)
        .map((m: any) => m.artist.name as string);
      return {
        trackName: track.name || "Unknown Track",
        trackCode: track.trackCode,
        primaryArtists: artists.length > 0 ? artists.join(", ") : undefined,
        qty: info.qty,
        sellingPrice: info.sellingPrice,
        discount: info.discount ?? 0,
        gstPercent: info.gstPercent ?? 18,
      };
    });

  if (items.length === 0) return null;

  const date = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(transaction.createdAt)).replace(",", "") + " IST";

  const buyerFirstName = userRecord?.firstName ?? undefined;
  const buyerLastName  = userRecord?.lastName  ?? undefined;
  const buyerName =
    [buyerFirstName, buyerLastName].filter(Boolean).join(" ") ||
    transaction.email || "Customer";
  const paymentMethod = transaction.paymentMethod ?? "Online";
  const orderId = formatOrderId(transaction.orderId);

  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber: txnFormatted,
    orderId,
    date,
    paymentMethod,
    buyerFirstName,
    buyerLastName,
    buyerName,
    email: transaction.email ?? userRecord?.email ?? "",
    mobile: userRecord?.mobile ?? undefined,
    billingFirstName: billing.firstName,
    billingLastName:  billing.lastName,
    billingEmail:     billing.email,
    billingMobile:    billing.mobile,
    addressLine1: billing.addressLine1,
    addressLine2: billing.addressLine2,
    city:         billing.city,
    state:        billing.state,
    postalCode:   billing.postalCode,
    country:      billing.country,
    gstin: billing.gstin ?? billing.gstNo,
    pan:   billing.pan   ?? billing.panNo,
    items,
    totalDiscount: transaction.totalDiscount,
    payAmount:     transaction.payAmount,
  });

  const downloadUrl = await uploadBufferToGCS({
    buffer: pdfBuffer,
    gcsPath: invoiceGcsPath,
    contentType: "application/pdf",
  });

  return {
    pdfBuffer,
    downloadUrl,
    txnFormatted,
    invoiceGcsPath,
    recipientEmail: transaction.email ?? userRecord?.email,
    buyerFirstName,
    items,
    date,
    paymentMethod,
    orderId,
  };
};

// ─── Download invoice (URL only, no email) ────────────────────────────────────
export const downloadInvoiceService = async (
  userId: number,
  transactionId: number,
): Promise<{ downloadUrl: string; invoiceNumber: string }> => {
  const transaction = await findSuccessTransactionForInvoice(transactionId, userId);
  if (!transaction) throw new AppError("Transaction not found or payment not completed", 404);

  const txnFormatted = formatTransactionId(transaction.id!);
  const invoiceGcsPath = `invoices/${txnFormatted}/invoice.pdf`;

  // Already generated (pre-built on commit) — just return a fresh signed URL
  const cached = await getGCSSignedUrl({ gcsPath: invoiceGcsPath });
  if (cached) return { downloadUrl: cached, invoiceNumber: txnFormatted };

  // Not yet cached (e.g. commit email failed) — generate now
  const result = await buildAndCacheInvoice(userId, transactionId);
  if (!result) throw new AppError("No track items found in this order", 400);

  return { downloadUrl: result.downloadUrl, invoiceNumber: result.txnFormatted };
};

// ─── Post-purchase email trigger (called from commitTransactionService) ────────
const triggerPurchaseEmail = (userId: number, transactionId: number): void => {
  buildAndCacheInvoice(userId, transactionId)
    .then(async (result) => {
      if (!result?.recipientEmail) return;

      const grandTotal = result.items.reduce((sum, item) => {
        const net = (item.sellingPrice - (item.discount ?? 0)) * item.qty;
        return sum + net + (net * (item.gstPercent ?? 18)) / 100;
      }, 0);

      await sendInvoiceEmail({
        to: result.recipientEmail,
        buyerFirstName: result.buyerFirstName,
        transactionId: result.txnFormatted,
        orderId: result.orderId,
        date: result.date,
        paymentMethod: result.paymentMethod,
        grandTotal,
        items: result.items,
        pdfBuffer: result.pdfBuffer,
        invoiceFilename: `invoice-${result.txnFormatted}.pdf`,
      });
    })
    .catch((err) => console.error("Post-purchase invoice email failed:", err));
};
