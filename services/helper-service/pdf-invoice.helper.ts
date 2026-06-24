import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface InvoiceLineItem {
  trackName: string;
  trackCode: string;
  primaryArtists?: string;
  qty: number;
  sellingPrice: number;
  discount: number;
  gstPercent: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  orderId: string;
  date: string;
  paymentMethod: string;
  // Purchaser (logged-in user)
  buyerFirstName?: string;
  buyerLastName?: string;
  buyerName: string;
  email: string;
  mobile?: string;
  // Billing contact (from billingAddress JSONB)
  billingFirstName?: string;
  billingLastName?: string;
  billingEmail?: string;
  billingMobile?: string;
  // Billing address
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  gstin?: string;
  pan?: string;
  // Items
  items: InvoiceLineItem[];
  totalDiscount: number;
  payAmount: number;
}

// ─── Image fetch ────────────────────────────────────────────────────────────

const fetchAsBase64 = (url: string): Promise<string> =>
  new Promise((resolve) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const mime = res.headers["content-type"] ?? "image/png";
        resolve(`data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`);
      });
      res.on("error", () => resolve(""));
    }).on("error", () => resolve(""));
  });

// ─── Helpers ────────────────────────────────────────────────────────────────

const escHtml = (str?: string | null): string =>
  (str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const numToWords = (n: number): string => {
  if (n === 0) return "Zero";
  const chunk = (num: number): string => {
    if (num === 0) return "";
    if (num < 20) return ONES[num];
    if (num < 100) return TENS[Math.floor(num / 10)] + (num % 10 ? " " + ONES[num % 10] : "");
    return ONES[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + chunk(num % 100) : "");
  };
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  if (crore) parts.push(chunk(crore) + " Crore");
  const lakh = Math.floor((n % 10000000) / 100000);
  if (lakh) parts.push(chunk(lakh) + " Lakh");
  const thousand = Math.floor((n % 100000) / 1000);
  if (thousand) parts.push(chunk(thousand) + " Thousand");
  const remainder = n % 1000;
  if (remainder) parts.push(chunk(remainder));
  return parts.join(" ");
};

const amountInWords = (amount: number): string => {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let result = numToWords(rupees) + " Rupees";
  if (paise > 0) result += " and " + numToWords(paise) + " Paise";
  return result + " Only";
};

const formatInr = (n: number): string =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── HTML Template ───────────────────────────────────────────────────────────

const buildInvoiceHtml = (data: InvoicePdfData, smashLogoSrc: string, gsharpLogoSrc: string): string => {
  let totalNetAmount = 0;
  let totalGst = 0;

  const invoiceRows = data.items.map((item) => {
    const discounted = item.sellingPrice - (item.discount ?? 0);
    const netAmount = discounted * item.qty;           // excl. GST
    const gstAmt = (netAmount * (item.gstPercent ?? 18)) / 100;
    const lineTotal = netAmount + gstAmt;
    totalNetAmount += netAmount;
    totalGst += gstAmt;

    return `
      <tr>
        <td>
          ${escHtml(item.trackName)} (${escHtml(item.trackCode)})<br/>
          ${item.primaryArtists ? `<span style="font-size:12px;color:#7D7D7D;">${escHtml(item.primaryArtists)}</span>` : ""}
        </td>
        <td style="text-align:center;">${item.qty}</td>
        <td style="text-align:right;">&#8377;${formatInr(netAmount)}</td>
        <td style="text-align:right;">&#8377;${formatInr(gstAmt)}</td>
        <td style="text-align:right;font-weight:bold;">&#8377;${formatInr(lineTotal)}</td>
      </tr>`;
  });

  const grandTotal = totalNetAmount + totalGst;

  const billingName = [data.billingFirstName, data.billingLastName].filter(Boolean).join(" ") || data.buyerName;
  const billingEmail = data.billingEmail || data.email;
  const billingMobile = data.billingMobile || data.mobile || "";
  const addressParts = [
    data.addressLine1,
    data.addressLine2,
    [data.city, data.state, data.postalCode].filter(Boolean).join(", "),
  ].filter(Boolean).join("<br/>");

  return `<!DOCTYPE html>
<html>
<head>
  <title>Tax Invoice</title>
  <style type="text/css">
    body { font-family: Arial, sans-serif; margin: 0; line-height: 1.6; color: #1a1a1a; }
    .bold { font-weight: bold; }
    .break { padding: 5px 0; }
    .container { width: 700px; padding: 30px 40px; margin: auto; }
    .italic { font-style: italic; }
    .noborder td { border: none !important; padding: 4px 20px 4px 0; vertical-align: top; }
    th, td { border: 1px solid #000; border-collapse: collapse; padding: 8px; text-align: left; font-size: 13px; }
    .table { width: 100%; border-spacing: 0; border-collapse: collapse; }
    .section-header { font-size: 14px; font-weight: bold; text-decoration: underline; }
    .label { font-weight: bold; }
    .normal { font-size: 13px; }
    .total-row td { font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">

    <!-- Logos — table layout so LibreOffice respects sizing -->
    <table class="table noborder" style="margin-bottom:12px;">
      <tr>
        <td style="border:none;padding:0;">
          ${smashLogoSrc ? `<img src="${smashLogoSrc}" width="130" height="40" alt="Hoopr Smash" style="display:block;" />` : "<strong>Hoopr Smash</strong>"}
        </td>
        <td align="right" style="border:none;padding:0;">
          ${gsharpLogoSrc ? `<img src="${gsharpLogoSrc}" width="44" height="44" alt="GSharp" style="display:block;margin-left:auto;" />` : ""}
        </td>
      </tr>
    </table>

    <!-- Order + Purchaser -->
    <table class="table noborder">
      <tr class="noborder">
        <td width="50%" class="noborder">
          <div class="section-header">Order Details</div>
          <div class="normal" style="margin-top:6px;">
            <span class="label">Tax Invoice No.:</span> ${escHtml(data.invoiceNumber)}<br/>
            <span class="label">Order ID:</span> ${escHtml(data.orderId)}<br/>
            <span class="label">Date:</span> ${escHtml(data.date)}<br/>
            <span class="label">Payment Mode:</span> ${escHtml(data.paymentMethod)}
          </div>
        </td>
        <td class="noborder">
          <div class="section-header">Purchaser Details</div>
          <div class="normal" style="margin-top:6px;">
            <span class="label">Name:</span> ${escHtml(data.buyerName)}<br/>
            <span class="label">Email:</span> ${escHtml(data.email)}<br/>
            ${data.mobile ? `<span class="label">Mobile:</span> ${escHtml(data.mobile)}<br/>` : ""}
          </div>
        </td>
      </tr>
    </table>

    <div class="clear"></div>
    <div class="break"></div><div class="break"></div>

    <!-- Billing Details -->
    <div class="section-header">Billing Details</div>
    <hr style="border:1px solid #000;margin:6px 0 10px;"/>
    <div class="normal">
      <span class="label">Name:</span> ${escHtml(billingName)}<br/>
      <span class="label">Contact:</span> ${escHtml(billingEmail)}${billingMobile ? " | " + escHtml(billingMobile) : ""}<br/>
      ${addressParts ? `<span class="label">Address:</span><br/>${addressParts}<br/>` : ""}
      <span class="label">GSTIN No:</span> ${escHtml(data.gstin) || "-"}<br/>
      <span class="label">PAN:</span> ${escHtml(data.pan) || "-"}<br/>
    </div>

    <div class="break"></div><div class="break"></div><div class="break"></div>

    <!-- Items Table -->
    <table class="table">
      <thead>
        <tr>
          <th style="width:45%;">Description</th>
          <th style="width:8%;text-align:center;">Qty</th>
          <th style="width:16%;text-align:right;">Net Amount (INR)</th>
          <th style="width:14%;text-align:right;">GST (@18%)</th>
          <th style="width:17%;text-align:right;">Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        ${invoiceRows.join("\n")}
        <tr class="total-row">
          <td colspan="4">TOTAL</td>
          <td style="text-align:right;">&#8377;${formatInr(grandTotal)}</td>
        </tr>
      </tbody>
    </table>

    <div class="break"></div><div class="break"></div>

    <div class="normal">
      <span class="bold">Total Amount in Words:</span><br/>
      ${amountInWords(grandTotal)}
    </div>

    <div class="break"></div>

    <div class="normal">
      Item SAC Code: <span class="bold">997332</span>
    </div>

    <div class="break"></div>

    <div class="normal italic bold">
      Note: Any usage of the tracks will be subject to the
      <a href="https://hoopr.ai/terms">terms and conditions</a> of the platform.
    </div>

    <div class="break"></div><div class="break"></div>

    <!-- Legal Entity -->
    <div class="section-header">Legal Entity Details</div>
    <div class="normal" style="margin-top:6px;">
      Hoopr Smash is a division of GSharp Media Pvt. Ltd.<br/>
      <span class="bold">Billing Address:</span><br/>
      A-1203, Serenity Complex, Off. Link Road, Oshiwara, Mumbai - 400102<br/>
      <span class="bold">GSTIN No:</span> 27AAHCG1665M1Z7 &nbsp;|&nbsp; <span class="bold">PAN:</span> AAHCG1665M
    </div>

  </div>
</body>
</html>`;
};

// ─── Export ──────────────────────────────────────────────────────────────────

const SMASH_LOGO_URL = "https://storage.googleapis.com/cdn-hooprsmash-com/web/logos/smash.png";
const GSHARP_LOGO_URL = "https://storage.googleapis.com/cdn-hooprsmash-com/emailers/invoice/gsharp.png";

export const generateInvoicePdf = async (data: InvoicePdfData): Promise<Buffer> => {
  const [smashLogoSrc, gsharpLogoSrc] = await Promise.all([
    fetchAsBase64(SMASH_LOGO_URL),
    fetchAsBase64(GSHARP_LOGO_URL),
  ]);
  const html = buildInvoiceHtml(data, smashLogoSrc, gsharpLogoSrc);
  const tmpDir = os.tmpdir();
  const uid = `invoice_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const htmlPath = path.join(tmpDir, `${uid}.html`);
  const expectedPdfPath = path.join(tmpDir, `${uid}.pdf`);

  await fs.promises.writeFile(htmlPath, html, "utf-8");

  try {
    await execAsync(
      `soffice --headless --convert-to pdf --outdir "${tmpDir}" "${htmlPath}"`,
      { timeout: 30000 },
    );
    const buf = await fs.promises.readFile(expectedPdfPath);
    return buf;
  } finally {
    fs.promises.unlink(htmlPath).catch(() => {});
    fs.promises.unlink(expectedPdfPath).catch(() => {});
  }
};
