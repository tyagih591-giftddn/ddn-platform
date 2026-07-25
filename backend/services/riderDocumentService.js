const riderService = require("../services/riderService");
const riderDocumentService = require(
  "../services/riderDocumentService"
);

function sendError(res, error) {
  const statusCode = error.statusCode || 500;

  const message =
    statusCode === 500
      ? "Internal server error"
      : error.message;

  if (statusCode === 500) {
    console.error(
      "Rider controller error:",
      error
    );
  }

  return res.status(statusCode).json({
    success: false,
    message
  });
}

async function registerRider(req, res) {
  try {
    const rider =
      await riderService.createRider(
        req.body
      );

    return res.status(201).json({
      success: true,
      message:
        "Rider registration submitted successfully",
      rider
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getRiderById(req, res) {
  try {
    const rider =
      await riderService.getRiderById(
        req.params.riderId
      );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found"
      });
    }

    return res.status(200).json({
      success: true,
      rider
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getRiderByUsername(req, res) {
  try {
    const rider =
      await riderService.findRiderByUsername(
        req.params.username
      );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found"
      });
    }

    return res.status(200).json({
      success: true,
      rider
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function uploadRiderDocuments(
  req,
  res
) {
  try {
    const riderId = Number(
      req.params.riderId
    );

    if (
      !riderId ||
      Number.isNaN(riderId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid rider ID is required"
      });
    }

    const uploadedDocuments =
      await riderDocumentService.saveDocuments(
        riderId,
        req.files
      );

    return res.status(200).json({
      success: true,
      message:
        "Documents uploaded successfully",
      documents: uploadedDocuments
    });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  registerRider,
  getRiderById,
  getRiderByUsername,
  uploadRiderDocuments
};