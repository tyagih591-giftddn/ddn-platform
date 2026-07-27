const multer = require("multer");

const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(
      new Error("Only JPG, JPEG, PNG and WEBP images are allowed"),
      false
    );
  }

  cb(null, true);
};

const proofUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  }
});

const uploadProofPhoto = proofUpload.single("proofPhoto");

const handleProofUploadError = (error, req, res, next) => {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Proof photo must be 5 MB or smaller"
      });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Only one proof photo is allowed"
      });
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: `Unexpected file field: ${error.field}`
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  return res.status(400).json({
    success: false,
    message: error.message || "Proof photo upload failed"
  });
};

module.exports = {
  uploadProofPhoto,
  handleProofUploadError
};