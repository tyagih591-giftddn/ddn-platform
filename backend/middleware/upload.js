const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadRoot = path.join(__dirname, "..", "uploads", "riders");

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const riderIdentifier =
      req.params.riderId ||
      req.body.riderId ||
      req.body.username ||
      "temporary";

    const safeFolderName = String(riderIdentifier).replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );

    const riderFolder = path.join(uploadRoot, safeFolderName);

    if (!fs.existsSync(riderFolder)) {
      fs.mkdirSync(riderFolder, { recursive: true });
    }

    cb(null, riderFolder);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const fieldName = String(file.fieldname).replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );

    const uniqueSuffix = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}`;

    cb(null, `${fieldName}-${uniqueSuffix}${extension}`);
  }
});

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(
      new Error(
        "Only JPG, JPEG, PNG, WEBP and PDF files are allowed"
      ),
      false
    );
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 4
  }
});

const riderDocumentUpload = upload.fields([
  {
    name: "riderPhoto",
    maxCount: 1
  },
  {
    name: "aadhaarDocument",
    maxCount: 1
  },
  {
    name: "drivingLicence",
    maxCount: 1
  },
  {
    name: "vehicleRC",
    maxCount: 1
  }
]);

const handleUploadError = (error, req, res, next) => {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Each file must be 5 MB or smaller"
      });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Maximum 4 files are allowed"
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
    message: error.message || "File upload failed"
  });
};

module.exports = {
  riderDocumentUpload,
  handleUploadError
};