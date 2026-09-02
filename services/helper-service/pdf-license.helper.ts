import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import libre from "libreoffice-convert";
import { promisify } from "util";

const libreConvert = promisify(libre.convert);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_DIR = path.resolve(__dirname, "../../templates");

const DEFAULT_TEMPLATE = "License_Agreement_Template.docx";

/**
 * Brands that license under their own negotiated master agreement get their own
 * .docx template. These templates address the licensee by brand name (the
 * contracting entity), not by the individual user who clicked download.
 */
export const BRAND_LICENSE_TEMPLATES: Record<number, string> = {
  // Jayabheri Group
  303: "jayabheri_license.docx",
};

export const getLicenseTemplateName = (
  brandId?: number | null,
): string =>
  (brandId != null && BRAND_LICENSE_TEMPLATES[Number(brandId)]) ||
  DEFAULT_TEMPLATE;

/**
 * GCS path for a license PDF. Brands on a custom template get their own suffix
 * so a PDF rendered from the generic template before the brand was onboarded is
 * never served back to them from the cache.
 */
export const buildLicensePdfGcsPath = (
  licenseId: number,
  brandId?: number | null,
): string => {
  const custom = brandId != null && BRAND_LICENSE_TEMPLATES[Number(brandId)];
  return custom
    ? `licenses-pdf/${licenseId}/license-agreement-brand-${Number(brandId)}.pdf`
    : `licenses-pdf/${licenseId}/license-agreement.pdf`;
};

export interface LicensePdfData {
  name: string;
  email: string;
  mobile: string;
  date: string;
  trackName: string;
  ownerName: string;
  licenseId: number;
  /** Selects the brand-specific template, when the brand has one. */
  brandId?: number | null;
  /** Licensee name printed on brand-specific templates. */
  brandName?: string;
}

export const generateLicensePdf = async (
  data: LicensePdfData
): Promise<Buffer> => {
  const templatePath = path.resolve(
    TEMPLATES_DIR,
    getLicenseTemplateName(data.brandId),
  );
  const templateBuffer = fs.readFileSync(templatePath);

  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });

  doc.render({
    name: data.name || "",
    email: data.email || "",
    mobile: data.mobile || "",
    date: data.date || "",
    trackName: data.trackName || "",
    ownerName: data.ownerName || "",
    licenseId: `HLAN-${data.licenseId}`,
    // Brand templates print the contracting entity instead of the user; fall
    // back to the user's name so the field is never blank.
    brandName: data.brandName || data.name || "",
  });

  const filledDocxBuffer = doc.getZip().generate({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const pdfBuffer = await libreConvert(filledDocxBuffer, ".pdf", undefined);

  return pdfBuffer as Buffer;
};
