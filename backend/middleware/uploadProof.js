const fs = require("fs");
const path = require("path");
const multer = require("multer");

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

function ensureDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, {
      recursive: true
    });
  }
}

function createProofUpload(folderName) {
  const uploadDirectory = path.join(
    __dirname,
    "..",
    "uploads",
    folderName
  );

  ensureDirectory(uploadDirectory);

  const storage = multer.diskStorage({
    destination: (
      req,
      file,
      callback
    ) => {
      callback(null, uploadDirectory);
    },

    filename: (
      req,
      file,
      callback
    ) => {
      const extension =
        path.extname(
          file.originalname
        ).toLowerCase() || ".jpg";

      const safeBookingId = String(
        req.params.bookingId || "booking"
      ).replace(
        /[^a-zA-Z0-9-_]/g,
        ""
      );

      const fileName =
        `${safeBookingId}-${Date.now()}${extension}`;

      callback(null, fileName);
    }
  });

  return multer({
    storage,

    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 1
    },

    fileFilter: (
      req,
      file,
      callback
    ) => {
      if (
        !allowedMimeTypes.has(
          file.mimetype
        )
      ) {
        return callback(
          new multer.MulterError(
            "LIMIT_UNEXPECTED_FILE",
            file.fieldname
          )
        );
      }

      callback(null, true);
    }
  });
}

const pickupProofUpload =
  createProofUpload(
    "pickup-proofs"
  );

const deliveryProofUpload =
  createProofUpload(
    "delivery-proofs"
  );

module.exports = {
  pickupProofUpload,
  deliveryProofUpload,
  MAX_FILE_SIZE
};