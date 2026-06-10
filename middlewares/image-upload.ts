import multer, { MulterError } from "multer";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../services/helper-service/AppError";

// In-memory multipart handling for image uploads. The file lands on
// req.file.buffer, which we hand straight to the GCS upload helper — no temp
// files on disk. Used by the Playlist CMS cover-upload endpoint.
//
// Limits: 5MB, single file, image/* only. Anything else is rejected before the
// controller runs (multer raises a MulterError caught by the error handler).
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WEBP, or GIF images are allowed"));
    }
  },
});

// Field name the client sends the file under: multipart field "image".
const rawSingleImageUpload = imageUpload.single("image");

// Wrap multer so its errors (file too large, wrong type, etc.) surface as a
// 400 AppError with a readable message instead of a generic 500 from the
// global error handler.
export const singleImageUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  rawSingleImageUpload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Image is too large (max 5MB)"
          : `Upload error: ${err.message}`;
      return next(new AppError(message, 400));
    }
    if (err instanceof Error) {
      return next(new AppError(err.message, 400));
    }
    return next(new AppError("Image upload failed", 400));
  });
};
