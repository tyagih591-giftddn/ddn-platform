const express = require("express");

const pool = require("../config/database");

const {
  geocodeAddress
} = require("../services/geocodingService");

const authenticateBusiness =
  require("../middleware/businessAuth");

const router = express.Router();

// ===============================
// HELPERS
// ===============================

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function calculateDeliveryFare(distanceKm) {
  const numericDistance =
    Number(distanceKm);

  if (
    !Number.isFinite(numericDistance) ||
    numericDistance <= 0
  ) {
    throw new Error(
      "Valid delivery distance is required"
    );
  }

  const roundedDistance =
    Number(
      numericDistance.toFixed(2)
    );

  const extraDistanceSlabs =
    Math.max(
      0,
      Math.ceil(
        roundedDistance - 2
      )
    );

  const customerFare =
    40 +
    extraDistanceSlabs * 10;

  const riderEarning =
    27 +
    extraDistanceSlabs * 7;

  return {
    distanceKm: roundedDistance,
    customerFare,
    riderEarning,
    platformEarning:
      customerFare - riderEarning
  };
}

// ===============================
// CREATE BUSINESS ORDER
// ===============================

router.post(
  "/orders",
  authenticateBusiness,
  async (req, res) => {
    try {
      const merchantOrderId =
        cleanText(
          req.body.merchantOrderId
        );

      const customerName =
        cleanText(
          req.body.customerName
        );

      const mobileNumber =
        cleanText(
          req.body.mobileNumber
        );

      const deliveryLocation =
        cleanText(
          req.body.deliveryLocation
        );

      const pinCode =
        cleanText(
          req.body.pinCode
        );

      const paymentType =
        cleanText(
          req.body.paymentType
        ).toUpperCase();

      const codAmount =
        req.body.codAmount !== null &&
        req.body.codAmount !== undefined
          ? Number(req.body.codAmount)
          : null;

      if (
        !merchantOrderId ||
        !customerName ||
        !mobileNumber ||
        !deliveryLocation
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Merchant order ID, customer name, mobile number and delivery address are required"
        });
      }

      if (
        !/^[0-9]{10}$/.test(
          mobileNumber
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A valid 10-digit mobile number is required"
        });
      }

      if (
        pinCode &&
        !/^[0-9]{6}$/.test(pinCode)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A valid 6-digit PIN code is required"
        });
      }

      if (
        ![
          "PREPAID",
          "COD"
        ].includes(paymentType)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Payment type must be PREPAID or COD"
        });
      }

      if (
        paymentType === "COD"
      ) {
        if (!req.business.codEnabled) {
          return res.status(403).json({
            success: false,
            message:
              "COD is not enabled for this business"
          });
        }

        if (
          !Number.isFinite(codAmount) ||
          codAmount <= 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "A valid COD amount is required"
          });
        }
      }

      const duplicateResult =
        await pool.query(
          `
          SELECT booking_id
          FROM bookings
          WHERE booking_source = 'business'
          AND merchant_id = $1
          AND merchant_order_id = $2
          LIMIT 1
          `,
          [
            req.business.merchantId,
            merchantOrderId
          ]
        );

      if (
        duplicateResult.rows.length > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This merchant order has already been submitted to DDN",
          bookingId:
            duplicateResult.rows[0]
              .booking_id
        });
      }

                  let pickupLatitude =
        req.business.pickupLatitude !== null &&
        req.business.pickupLatitude !== undefined
          ? Number(
              req.business.pickupLatitude
            )
          : null;

      let pickupLongitude =
        req.business.pickupLongitude !== null &&
        req.business.pickupLongitude !== undefined
          ? Number(
              req.business.pickupLongitude
            )
          : null;

      const hasValidPickupCoordinates =
        Number.isFinite(
          pickupLatitude
        ) &&
        Number.isFinite(
          pickupLongitude
        ) &&
        pickupLatitude >= -90 &&
        pickupLatitude <= 90 &&
        pickupLongitude >= -180 &&
        pickupLongitude <= 180;

      if (!hasValidPickupCoordinates) {
        const pickupResult =
          await geocodeAddress(
            `${req.business.pickupLocation}${
              req.business.pinCode
                ? `, ${req.business.pinCode}`
                : ""
            }`
          );

        pickupLatitude =
          pickupResult.latitude;

        pickupLongitude =
          pickupResult.longitude;   
      }
        

      const deliveryResult =
        await geocodeAddress(
          `${deliveryLocation}${
            pinCode
              ? `, ${pinCode}`
              : ""
          }`
        );

      const {
        calculateRoadRoute
      } = require("../services/routeService");

      const route =
        await calculateRoadRoute(
          pickupLatitude,
          pickupLongitude,
          deliveryResult.latitude,
          deliveryResult.longitude
        );

      const fareDetails =
        calculateDeliveryFare(
          route.distanceKm
        );

      const bookingId =
        `DDN-${Date.now()}`;

      const result =
        await pool.query(
          `
          INSERT INTO bookings
          (
            booking_id,
            pickup_location,
            delivery_location,
            customer_name,
            mobile_number,
            pin_code,
            customer_pickup_latitude,
            customer_pickup_longitude,
            customer_delivery_latitude,
            customer_delivery_longitude,
            delivery_distance_km,
            route_duration_minutes,
            customer_fare,
            rider_earning,
            platform_earning,
            status,
            booking_source,
            merchant_id,
            merchant_order_id,
            payment_type,
            cod_amount
          )
          VALUES
          (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,$21
          )
          RETURNING *
          `,
          [
            bookingId,
            req.business.pickupLocation,
            deliveryLocation,
            customerName,
            mobileNumber,
            pinCode || null,
            pickupLatitude,
            pickupLongitude,
            deliveryResult.latitude,
            deliveryResult.longitude,
            fareDetails.distanceKm,
            route.durationMinutes,
            fareDetails.customerFare,
            fareDetails.riderEarning,
            fareDetails.platformEarning,
            "Pending",
            "business",
            req.business.merchantId,
            merchantOrderId,
            paymentType,
            paymentType === "COD"
              ? codAmount
              : null
          ]
        );

      const booking =
        result.rows[0];

      const createdBooking = {
        bookingId:
          booking.booking_id,

        bookingSource:
          booking.booking_source,

        merchantId:
          booking.merchant_id,

        merchantOrderId:
          booking.merchant_order_id,

        businessName:
          req.business.businessName,

        pickupLocation:
          booking.pickup_location,

        deliveryLocation:
          booking.delivery_location,

        customerName:
          booking.customer_name,

        mobileNumber:
          booking.mobile_number,

        deliveryDistanceKm:
          Number(
            booking.delivery_distance_km
          ),

        routeDurationMinutes:
          booking.route_duration_minutes,

        customerFare:
          Number(
            booking.customer_fare
          ),

        paymentType:
          booking.payment_type,

        codAmount:
          booking.cod_amount !== null
            ? Number(
                booking.cod_amount
              )
            : null,

        status:
          booking.status,

        createdAt:
          booking.created_at
      };

      const io =
        req.app.get("io");

      if (io) {
        io.emit(
          "new-order",
          createdBooking
        );
      }

      return res.status(201).json({
        success: true,
        message:
          "Business delivery order created successfully",
        booking:
          createdBooking
      });

    } catch (error) {
      console.error(
        "Create business order error:",
        error
      );

      if (
        error.code === "23505"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This merchant order has already been submitted to DDN"
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Failed to create business delivery order"
      });
    }
  }
);

module.exports = router;