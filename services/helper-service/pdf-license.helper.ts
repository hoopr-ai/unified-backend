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

const TEMPLATE_PATH = path.resolve(
  __dirname,
  "../../templates/License_Agreement_Template.docx"
);

export interface LicensePdfData {
  name: string;
  email: string;
  mobile: string;
  date: string;
  trackName: string;
  ownerName: string;
  licenseId: number;
}

export const generateLicensePdf = async (
  data: LicensePdfData
): Promise<Buffer> => {
  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);

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
  });

  const filledDocxBuffer = doc.getZip().generate({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const pdfBuffer = await libreConvert(filledDocxBuffer, ".pdf", undefined);

  return pdfBuffer as Buffer;
};
