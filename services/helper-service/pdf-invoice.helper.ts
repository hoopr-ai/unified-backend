import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface InvoiceLineItem {
  trackName: string;
  trackCode: string;
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
  buyerName: string;
  companyName?: string;
  email: string;
  mobile?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  gstin?: string;
  pan?: string;
  items: InvoiceLineItem[];
  totalDiscount: number;
  payAmount: number;
}

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

const buildInvoiceHtml = (data: InvoicePdfData): string => {
  let subtotal = 0;
  let totalGst = 0;
  let totalDiscount = 0;

  const rows = data.items.map((item, idx) => {
    const discountedPrice = item.sellingPrice - item.discount;
    const taxableAmt = discountedPrice * item.qty;
    const gstAmt = (taxableAmt * item.gstPercent) / 100;
    const lineTotal = taxableAmt + gstAmt;
    subtotal += taxableAmt;
    totalGst += gstAmt;
    totalDiscount += item.discount * item.qty;
    return `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escHtml(item.trackName)}</td>
        <td style="text-align:center;font-size:10px;color:#555;">${escHtml(item.trackCode)}</td>
        <td style="text-align:center;">${item.qty}</td>
        <td style="text-align:right;">&#8377;${item.sellingPrice.toFixed(2)}</td>
        <td style="text-align:right;">${item.discount > 0 ? `&#8377;${(item.discount * item.qty).toFixed(2)}` : "&mdash;"}</td>
        <td style="text-align:right;">&#8377;${taxableAmt.toFixed(2)}</td>
        <td style="text-align:center;">${item.gstPercent}%</td>
        <td style="text-align:right;">&#8377;${gstAmt.toFixed(2)}</td>
        <td style="text-align:right;font-weight:bold;">&#8377;${lineTotal.toFixed(2)}</td>
      </tr>`;
  });

  const grandTotal = subtotal + totalGst;
  const addressParts = [
    data.addressLine1,
    data.addressLine2,
    [data.city, data.state, data.postalCode].filter(Boolean).join(", "),
    data.country || "India",
  ].filter(Boolean).join("<br>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; padding: 32px; }
  table { width: 100%; border-collapse: collapse; }
  .header-table td { vertical-align: top; }
  .company-name { font-size: 24px; font-weight: bold; color: #1a1a1a; }
  .company-sub { font-size: 11px; color: #555; line-height: 1.6; margin-top: 4px; }
  .invoice-title { font-size: 20px; font-weight: bold; text-align: right; letter-spacing: 2px; color: #1a1a1a; }
  .invoice-meta { font-size: 11px; color: #555; text-align: right; line-height: 1.7; margin-top: 6px; }
  hr { border: none; border-top: 2px solid #1a1a1a; margin: 18px 0; }
  .section-table td { vertical-align: top; padding: 0; }
  .box { border: 1px solid #ccc; padding: 14px; }
  .box-label { font-size: 10px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
  .items-table { margin-top: 20px; }
  .items-table th { background: #1a1a1a; color: #fff; padding: 8px 10px; font-size: 11px; text-align: left; }
  .items-table td { padding: 9px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
  .items-table tr:nth-child(even) td { background: #f7f7f7; }
  .totals-row td { padding: 5px 10px; font-size: 12px; }
  .grand-total td { border-top: 2px solid #1a1a1a; font-size: 14px; font-weight: bold; padding: 8px 10px; }
  .amount-words { font-size: 11px; color: #555; font-style: italic; margin-top: 12px; }
  .footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 14px; font-size: 10px; color: #888; text-align: center; }
</style>
</head>
<body>

<table class="header-table">
  <tr>
    <td width="60%">
      <div class="company-name">Hoopr</div>
      <div class="company-sub">
        Gsharp Media Pvt Ltd<br>
        Mumbai, India<br>
        support@hoopr.ai
      </div>
    </td>
    <td width="40%">
      <div class="invoice-title">TAX INVOICE</div>
      <div class="invoice-meta">
        Invoice No: <b>${escHtml(data.invoiceNumber)}</b><br>
        Order ID: ${escHtml(data.orderId)}<br>
        Date: ${escHtml(data.date)}<br>
        Payment: ${escHtml(data.paymentMethod)}
      </div>
    </td>
  </tr>
</table>

<hr>

<table class="section-table">
  <tr>
    <td width="50%" style="padding-right:12px;">
      <div class="box">
        <div class="box-label">Bill To</div>
        <div style="font-size:13px;font-weight:bold;">${escHtml(data.buyerName)}</div>
        ${data.companyName ? `<div style="font-size:11px;color:#555;">${escHtml(data.companyName)}</div>` : ""}
        <div style="font-size:11px;color:#555;margin-top:6px;line-height:1.6;">
          ${escHtml(data.email)}<br>
          ${data.mobile ? escHtml(data.mobile) + "<br>" : ""}
          ${addressParts}
        </div>
      </div>
    </td>
    <td width="50%" style="padding-left:12px;">
      <div class="box">
        <div class="box-label">Tax Information</div>
        <table style="width:100%;">
          ${data.gstin ? `<tr><td style="font-size:11px;color:#555;padding:3px 0;">GSTIN</td><td style="font-size:11px;font-weight:bold;text-align:right;">${escHtml(data.gstin)}</td></tr>` : ""}
          ${data.pan ? `<tr><td style="font-size:11px;color:#555;padding:3px 0;">PAN</td><td style="font-size:11px;font-weight:bold;text-align:right;">${escHtml(data.pan)}</td></tr>` : ""}
          ${!data.gstin && !data.pan ? `<tr><td style="font-size:11px;color:#aaa;font-style:italic;">No tax details on file</td></tr>` : ""}
        </table>
      </div>
    </td>
  </tr>
</table>

<table class="items-table" style="margin-top:24px;">
  <thead>
    <tr>
      <th style="width:4%;text-align:center;">#</th>
      <th style="width:26%;">Track Name</th>
      <th style="width:14%;text-align:center;">Track Code</th>
      <th style="width:5%;text-align:center;">Qty</th>
      <th style="width:10%;text-align:right;">Unit Price</th>
      <th style="width:10%;text-align:right;">Discount</th>
      <th style="width:11%;text-align:right;">Taxable Amt</th>
      <th style="width:6%;text-align:center;">GST</th>
      <th style="width:7%;text-align:right;">GST Amt</th>
      <th style="width:7%;text-align:right;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join("\n")}
  </tbody>
</table>

<table style="margin-top:12px;">
  <tr>
    <td width="60%">
      <div class="amount-words">
        Amount in words: <b>${amountInWords(grandTotal)}</b>
      </div>
    </td>
    <td width="40%">
      <table style="width:100%;">
        ${totalDiscount > 0 ? `<tr class="totals-row"><td>Subtotal before discount</td><td style="text-align:right;">&#8377;${(subtotal + totalDiscount).toFixed(2)}</td></tr>` : ""}
        ${totalDiscount > 0 ? `<tr class="totals-row"><td style="color:#c00;">Discount</td><td style="text-align:right;color:#c00;">&minus;&#8377;${totalDiscount.toFixed(2)}</td></tr>` : ""}
        <tr class="totals-row"><td>Taxable Amount</td><td style="text-align:right;">&#8377;${subtotal.toFixed(2)}</td></tr>
        <tr class="totals-row"><td>GST (18%)</td><td style="text-align:right;">&#8377;${totalGst.toFixed(2)}</td></tr>
        <tr class="grand-total"><td>Total Amount</td><td style="text-align:right;">&#8377;${grandTotal.toFixed(2)}</td></tr>
      </table>
    </td>
  </tr>
</table>

<div class="footer">
  This is a system-generated invoice and does not require a physical signature.<br>
  For queries, write to support@hoopr.ai &nbsp;|&nbsp; hoopr.ai
</div>

</body>
</html>`;
};

const escHtml = (str: string): string =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const generateInvoicePdf = async (data: InvoicePdfData): Promise<Buffer> => {
  const html = buildInvoiceHtml(data);
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
