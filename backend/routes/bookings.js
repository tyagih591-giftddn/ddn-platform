const express = require("express");

const pool = require("../config/database");
const authenticateToken = require("../middleware/auth");
const allowRoles = require("../middleware/roles");

const router = express.Router();

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeUsername(value) {
  return cleanText(value).toLowerCase();
}

function formatBooking(booking) {
  return {
    bookingId: booking.booking_id,
    pickupLocation: booking.pickup_location,
    deliveryLocation: booking.delivery_location,
    customerName: booking.customer_name,
    mobileNumber: booking.mobile_number,
    status: booking.status,
    assignedRider: booking.assigned_rider,
    createdAt: booking.created_at
  };
}

// ===============================
// CREATE BOOKING — PUBLIC
// ===============================

router.post(
  "/",
  async (req, res) => {
    try {
      const pickupLocation =
        cleanText(
          req.body.pickupLocation
        );

      const deliveryLocation =
        cleanText(
          req.body.deliveryLocation
        );

      const customerName =
        cleanText(
          req.body.customerName
        );

      const mobileNumber =
        cleanText(
          req.body.mobileNumber
        );

      if (
        !pickupLocation ||
        !deliveryLocation ||
        !customerName ||
        !mobileNumber
      ) {
        return res.status(400).json({
          success: false,
          message:
            "All booking fields are required"
        });
      }

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
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
          `,
          [
            bookingId,
            pickupLocation,
            deliveryLocation,
            customerName,
            mobileNumber,
            "Pending"
          ]
        );

      return res.status(201).json({
        success: true,
        message:
          "Booking created successfully",
        booking:
          formatBooking(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "Create booking error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to create booking"
      });
    }
  }
);

// ===============================
// GET BOOKINGS — ADMIN/RIDER
// ===============================

router.get(
  "/",
  authenticateToken,
  allowRoles("admin", "rider"),
  async (req, res) => {
    try {
      let result;

      if (
        req.user.role === "admin"
      ) {
        result =
          await pool.query(`
            SELECT *
            FROM bookings
            ORDER BY created_at DESC
          `);
      } else {
        result =
          await pool.query(
            `
            SELECT *
            FROM bookings
            WHERE assigned_rider = $1
            ORDER BY created_at DESC
            `,
            [
              req.user.username
            ]
          );
      }

      return res.json({
        success: true,
        bookings:
          result.rows.map(
            formatBooking
          )
      });
    } catch (error) {
      console.error(
        "Get bookings error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load bookings"
      });
    }
  }
);

// ===============================
// CUSTOMER TRACKING — PUBLIC
// ===============================

router.get(
  "/:bookingId",
  async (req, res) => {
    try {
      const bookingId =
        cleanText(
          req.params.bookingId
        );

      const result =
        await pool.query(
          `
          SELECT *
          FROM bookings
          WHERE booking_id = $1
          `,
          [bookingId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found"
        });
      }

      const booking =
        formatBooking(
          result.rows[0]
        );

      return res.json({
        success: true,
        booking: {
          bookingId:
            booking.bookingId,
          pickupLocation:
            booking.pickupLocation,
          deliveryLocation:
            booking.deliveryLocation,
          customerName:
            booking.customerName,
          status:
            booking.status,
          createdAt:
            booking.createdAt
        }
      });
    } catch (error) {
      console.error(
        "Track booking error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to track booking"
      });
    }
  }
);

// ===============================
// ASSIGN RIDER — ADMIN ONLY
// ===============================

router.patch(
  "/:bookingId/assign",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const bookingId =
        cleanText(
          req.params.bookingId
        );

      const riderUsername =
        normalizeUsername(
          req.body.rider
        );

      if (!riderUsername) {
        return res.status(400).json({
          success: false,
          message:
            "Rider username is required"
        });
      }

      const riderResult =
        await pool.query(
          `
          SELECT username
          FROM riders
          WHERE username = $1
          AND is_active = TRUE
          `,
          [riderUsername]
        );

      if (
        riderResult.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Active rider not found"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE bookings
          SET
            assigned_rider = $1,
            status = 'Assigned'
          WHERE booking_id = $2
          RETURNING *
          `,
          [
            riderUsername,
            bookingId
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found"
        });
      }

      return res.json({
        success: true,
        message:
          "Rider assigned successfully",
        booking:
          formatBooking(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "Assign rider error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to assign rider"
      });
    }
  }
);

// ===============================
// UPDATE BOOKING STATUS
// ===============================

router.patch(
  "/:bookingId/status",
  authenticateToken,
  allowRoles("admin", "rider"),
  async (req, res) => {
    try {
      const bookingId =
        cleanText(
          req.params.bookingId
        );

      const status =
        cleanText(
          req.body.status
        );

      const adminStatuses = [
        "Pending",
        "Assigned",
        "Picked Up",
        "Out for Delivery",
        "Delivered",
        "Cancelled"
      ];

      const riderStatuses = [
        "Picked Up",
        "Out for Delivery",
        "Delivered"
      ];

      const allowedStatuses =
        req.user.role === "admin"
          ? adminStatuses
          : riderStatuses;

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "You cannot use this status"
        });
      }

      let result;

      if (
        req.user.role === "admin"
      ) {
        result =
          await pool.query(
            `
            UPDATE bookings
            SET status = $1
            WHERE booking_id = $2
            RETURNING *
            `,
            [
              status,
              bookingId
            ]
          );
      } else {
        result =
          await pool.query(
            `
            UPDATE bookings
            SET status = $1
            WHERE booking_id = $2
            AND assigned_rider = $3
            RETURNING *
            `,
            [
              status,
              bookingId,
              req.user.username
            ]
          );
      }

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found or not assigned to this rider"
        });
      }

      return res.json({
        success: true,
        message:
          "Booking status updated successfully",
        booking:
          formatBooking(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "Update status error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update booking status"
      });
    }
  }
);

module.exports = router;