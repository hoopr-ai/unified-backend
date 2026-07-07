import multer, { MulterError } from "multer";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../services/helper-service/AppError";

// In-memory multipart handling for recipient-list uploads (CSV or XLSX).
// The buffer goes straight to the parser — no temp files on disk.
const ALLOWED_MIME = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", // some browsers/OSes label .csv as text/plain
  "application/octet-stream", // and some as a generic binary
]);

const recipientsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const looksRight =
      ALLOWED_MIME.has(file.mimetype) || /\.(csv|xlsx?)$/i.test(file.originalname);
    if (looksRight) cb(null, true);
    else cb(new Error("Only CSV or XLSX files are allowed"));
  },
});

// Multipart field name: "file".
const rawSingleFileUpload = recipientsUpload.single("file");

export const singleRecipientsFileUpload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  rawSingleFileUpload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "File is too large (max 20MB)"
          : `Upload error: ${err.message}`;
      return next(new AppError(message, 400));
    }
    if (err instanceof Error) return next(new AppError(err.message, 400));
    return next(new AppError("File upload failed", 400));
  });
};
