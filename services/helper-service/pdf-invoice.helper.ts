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

const S = {
  cell:  "border:1px solid #000;padding:8px 10px;font-size:13px;vertical-align:top;",
  hdr:   "border:1px solid #000;padding:8px 10px;font-size:13px;font-weight:bold;",
  plain: "border:none;padding:0;font-size:13px;vertical-align:top;",
  label: "font-weight:bold;",
  sec:   "font-size:14px;font-weight:bold;text-decoration:underline;",
};

const buildInvoiceHtml = (data: InvoicePdfData, smashLogoSrc: string, gsharpLogoSrc: string): string => {
  let totalNetAmount = 0;
  let totalGst = 0;

  const invoiceRows = data.items.map((item) => {
    const discounted = item.sellingPrice - (item.discount ?? 0);
    const netAmount = discounted * item.qty;
    const gstAmt = (netAmount * (item.gstPercent ?? 18)) / 100;
    const lineTotal = netAmount + gstAmt;
    totalNetAmount += netAmount;
    totalGst += gstAmt;

    return `
      <tr>
        <td style="${S.cell}">
          ${escHtml(item.trackName)}<br/>
          <span style="font-size:11px;color:#555;">${escHtml(item.trackCode)}</span>
          ${item.primaryArtists ? `<br/><span style="font-size:12px;color:#7D7D7D;">${escHtml(item.primaryArtists)}</span>` : ""}
        </td>
        <td style="${S.cell}text-align:center;">${item.qty}</td>
        <td style="${S.cell}text-align:right;">&#8377;${formatInr(netAmount)}</td>
        <td style="${S.cell}text-align:right;">&#8377;${formatInr(gstAmt)}</td>
        <td style="${S.cell}text-align:right;font-weight:bold;">&#8377;${formatInr(lineTotal)}</td>
      </tr>`;
  });

  const grandTotal = totalNetAmount + totalGst;

  const billingName = [data.billingFirstName, data.billingLastName].filter(Boolean).join(" ") || data.buyerName;
  const billingEmail = data.billingEmail || data.email;
  const billingMobile = data.billingMobile || data.mobile || "";
  const addressLines = [
    data.addressLine1,
    data.addressLine2,
    [data.city, data.state, data.postalCode].filter(Boolean).join(", "),
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Tax Invoice</title>
  <style>
    @page { margin: 8mm 12mm; }
    body  { margin:0; padding:0; }
  </style>
</head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
<table width="680" cellpadding="0" cellspacing="0" style="margin:16px auto;border-collapse:collapse;">

  <!-- ── Logos ── -->
  <tr>
    <td style="${S.plain}">
      ${smashLogoSrc
        ? `<img src="${smashLogoSrc}" width="120" height="37" alt="Hoopr Smash"/>`
        : `<strong style="font-size:20px;">Hoopr Smash</strong>`}
    </td>
    <td align="right" style="${S.plain}">
      ${gsharpLogoSrc
        ? `<img src="${gsharpLogoSrc}" width="42" height="42" alt="GSharp"/>`
        : ""}
    </td>
  </tr>

  <!-- thin rule after logos — padding-top here, not a spacer row -->
  <tr>
    <td colspan="2" style="border:none;padding:6px 0 0;">
      <hr style="border:0;border-top:1px solid #ccc;margin:0;"/>
    </td>
  </tr>

  <!-- ── Order Details + Purchaser Details ── -->
  <tr>
    <td style="${S.plain}padding-top:10px;padding-right:30px;">
      <span style="${S.sec}">Order Details</span><br/>
      <span style="${S.label}">Tax Invoice No.:</span> ${escHtml(data.invoiceNumber)}<br/>
      <span style="${S.label}">Order ID:</span> ${escHtml(data.orderId)}<br/>
      <span style="${S.label}">Date:</span> ${escHtml(data.date)}<br/>
      <span style="${S.label}">Payment Mode:</span> ${escHtml(data.paymentMethod)}
    </td>
    <td style="${S.plain}padding-top:10px;">
      <span style="${S.sec}">Purchaser Details</span><br/>
      <span style="${S.label}">Name:</span> ${escHtml(data.buyerName)}<br/>
      <span style="${S.label}">Email:</span> ${escHtml(data.email)}<br/>
      ${data.mobile ? `<span style="${S.label}">Mobile:</span> ${escHtml(data.mobile)}<br/>` : ""}
    </td>
  </tr>

  <!-- ── Billing Details ── -->
  <tr>
    <td colspan="2" style="${S.plain}padding-top:16px;">
      <span style="${S.sec}">Billing Details</span>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="border:none;padding:3px 0 6px;">
      <hr style="border:0;border-top:1px solid #000;margin:0;"/>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="${S.plain}">
      <span style="${S.label}">Name:</span> ${escHtml(billingName)}<br/>
      <span style="${S.label}">Contact Details:</span> ${escHtml(billingEmail)}${billingMobile ? " | " + escHtml(billingMobile) : ""}<br/>
      <span style="${S.label}">Address:</span><br/>
      ${addressLines.map((l) => escHtml(l) + "<br/>").join("") || "-<br/>"}
      <span style="${S.label}">GSTIN No:</span> ${escHtml(data.gstin) || "-"}<br/>
      <span style="${S.label}">PAN:</span> ${escHtml(data.pan) || "-"}
    </td>
  </tr>

  <!-- ── Items Table ── -->
  <tr>
    <td colspan="2" style="${S.plain}padding-top:16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #000;">
        <thead>
          <tr>
            <th width="44%" style="${S.hdr}">Description</th>
            <th width="8%"  style="${S.hdr}text-align:center;">Qty</th>
            <th width="16%" style="${S.hdr}text-align:right;">Net Amount (INR)</th>
            <th width="14%" style="${S.hdr}text-align:right;">GST (@18%)</th>
            <th width="18%" style="${S.hdr}text-align:right;">Amount (INR)</th>
          </tr>
        </thead>
        <tbody>
          ${invoiceRows.join("\n")}
          <tr>
            <td colspan="4" style="${S.cell}font-weight:bold;">TOTAL</td>
            <td style="${S.cell}text-align:right;font-weight:bold;">&#8377;${formatInr(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </td>
  </tr>

  <!-- ── Amount in Words ── -->
  <tr>
    <td colspan="2" style="${S.plain}padding-top:12px;">
      <span style="${S.label}">Total Amount in Words:</span><br/>
      ${amountInWords(grandTotal)}
    </td>
  </tr>

  <!-- ── SAC Code ── -->
  <tr>
    <td colspan="2" style="${S.plain}padding-top:8px;">
      Item SAC Code: <span style="${S.label}">997332</span>
    </td>
  </tr>

  <!-- ── Note ── -->
  <tr>
    <td colspan="2" style="${S.plain}padding-top:8px;font-style:italic;font-weight:bold;">
      Note: Any usage of the tracks will be subject to the
      <a href="https://hoopr.ai/terms" style="color:#1a1a1a;">terms and conditions</a> of the platform.
    </td>
  </tr>

  <!-- ── Legal Entity ── -->
  <tr>
    <td colspan="2" style="${S.plain}padding-top:16px;">
      <span style="${S.sec}">Legal Entity Details</span>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="${S.plain}padding-top:4px;">
      Hoopr Smash is a division of GSharp Media Pvt. Ltd.<br/>
      <span style="${S.label}">Billing Address:</span><br/>
      A-1203, Serenity Complex, Off. Link Road, Oshiwara, Mumbai - 400102<br/>
      <span style="${S.label}">GSTIN No:</span> 27AAHCG1665M1Z7 &nbsp;|&nbsp; <span style="${S.label}">PAN:</span> AAHCG1665M
    </td>
  </tr>

</table>
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
