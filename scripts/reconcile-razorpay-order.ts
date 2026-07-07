// Settle a transaction whose payment was captured at Razorpay but is not
// SUCCESS in our DB (paid before the webhook went live, webhook delivery
// failed, etc.). Safe to re-run — no-ops if the transaction is already SUCCESS.
//
// Usage: npx ts-node scripts/reconcile-razorpay-order.ts order_XXXXXXXXXXXXXX
import "dotenv/config";
import { connectDatabase } from "../services/persistence-service/database";
import { reconcileRazorpayOrderService } from "../services/business-service/transaction/transaction.service";

const razorpayOrderId = process.argv[2];
if (!razorpayOrderId || !razorpayOrderId.startsWith("order_")) {
  console.error("Usage: npx ts-node scripts/reconcile-razorpay-order.ts <razorpayOrderId (order_…)>");
  process.exit(1);
}

(async () => {
  await connectDatabase();
  const result = await reconcileRazorpayOrderService(razorpayOrderId);
  console.log(JSON.stringify(result, null, 2));

  if (result.reconciled) {
    // Invoice PDF + email fire asynchronously inside the service; give them
    // time to finish before the process dies.
    console.log("Reconciled. Waiting 20s for the invoice email to flush...");
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
  process.exit(result.reconciled ? 0 : 2);
})().catch((err) => {
  console.error("Reconcile failed:", err);
  process.exit(1);
});
