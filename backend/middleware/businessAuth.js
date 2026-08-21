const bcrypt = require("bcryptjs");

const pool = require("../config/database");

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

async function authenticateBusiness(
  req,
  res,
  next
) {
  try {
    const apiKey =
      cleanText(
        req.headers["x-ddn-api-key"]
      );

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message:
          "DDN Business API key is required"
      });
    }

    const result =
      await pool.query(
        `
        SELECT
          id,
          merchant_id,
          business_name,
          business_type,
          pickup_location,
          pin_code,
          pickup_latitude,
          pickup_longitude,
          api_key_hash,
          is_active,
          cod_enabled
        FROM business_partners
        WHERE is_active = TRUE
        `
      );

    let matchedMerchant = null;

    for (const merchant of result.rows) {
      const matches =
        await bcrypt.compare(
          apiKey,
          merchant.api_key_hash
        );

      if (matches) {
        matchedMerchant = merchant;
        break;
      }
    }

    if (!matchedMerchant) {
      return res.status(403).json({
        success: false,
        message:
          "Invalid or inactive DDN Business API key"
      });
    }

    req.business = {
      id:
        matchedMerchant.id,

      merchantId:
        matchedMerchant.merchant_id,

      businessName:
        matchedMerchant.business_name,

      businessType:
        matchedMerchant.business_type,

      pickupLocation:
        matchedMerchant.pickup_location,

      pinCode:
        matchedMerchant.pin_code,

      pickupLatitude:
        matchedMerchant.pickup_latitude,

      pickupLongitude:
        matchedMerchant.pickup_longitude,

      codEnabled:
        matchedMerchant.cod_enabled
    };

    next();
  } catch (error) {
    console.error(
      "Business authentication error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Business authentication failed"
    });
  }
}

module.exports = authenticateBusiness;