const express = require("express");

const pool = require("../config/database");
const authenticateToken = require("../middleware/auth");
const allowRoles = require("../middleware/roles");

const {
  uploadProofPhoto,
  handleProofUploadError
} = require("../middleware/proofUpload");

const {
  uploadBufferToCloudinary
} = require("../services/cloudinaryService");

const router = express.Router();

// ===============================
// HELPER FUNCTIONS
// ===============================

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

    pinCode: booking.pin_code,
    customerPickupLatitude:
      booking.customer_pickup_latitude,
    customerPickupLongitude:
      booking.customer_pickup_longitude,
    customerDeliveryLatitude:
      booking.customer_delivery_latitude,
    customerDeliveryLongitude:
      booking.customer_delivery_longitude,

    status: booking.status,
    assignedRider: booking.assigned_rider,
    createdAt: booking.created_at
  };
}

function getNextRiderStatus(
  currentStatus
) {
const transitions = {
  Assigned: "Accepted",
  Accepted: "Picked Up",
  "Picked Up": "Out for Delivery",
  "Out for Delivery": "Reached Drop Location",
  "Reached Drop Location": "Delivered"
};

  return transitions[currentStatus] || null;
}

function canAdminChangeStatus(
  currentStatus,
  requestedStatus
) {
  if (requestedStatus === "Cancelled") {
    return ![
      "Delivered",
      "Cancelled"
    ].includes(currentStatus);
  }

 const transitions = {
  Pending: "Assigned",
  Assigned: "Accepted",
  Accepted: "Picked Up",
  "Picked Up": "Out for Delivery",
  "Out for Delivery": "Reached Drop Location",
  "Reached Drop Location": "Delivered"
};

  return (
    transitions[currentStatus] ===
    requestedStatus
  );
}

const VALID_BOOKING_STATUSES = [
  "Pending",
  "Assigned",
  "Accepted",
  "Picked Up",
  "Out for Delivery",
  "Reached Drop Location",
  "Delivered",
  "Cancelled"
];

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

        const pinCode =
  cleanText(
    req.body.pinCode
  );

const pickupLatitude =
  req.body.pickupLatitude;

const pickupLongitude =
  req.body.pickupLongitude;

const deliveryLatitude =
  req.body.deliveryLatitude;

const deliveryLongitude =
  req.body.deliveryLongitude;

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
  pin_code,
  customer_pickup_latitude,
  customer_pickup_longitude,
  customer_delivery_latitude,
  customer_delivery_longitude,
  status
)
          VALUES
(
  $1,
  $2,
  $3,
  $4,
  $5,
  $6,
  $7,
  $8,
  $9,
  $10,
  $11
)
RETURNING *
`,
[
  bookingId,
  pickupLocation,
  deliveryLocation,
  customerName,
  mobileNumber,
  pinCode || null,
  pickupLatitude || null,
  pickupLongitude || null,
  deliveryLatitude || null,
  deliveryLongitude || null,
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
          await pool.query(
            `
            SELECT *
            FROM bookings
            ORDER BY created_at DESC
            `
          );
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

      if (
        !bookingId ||
        !riderUsername
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Booking ID and rider username are required"
        });
      }

      const riderResult =
        await pool.query(
          `
          SELECT
            username,
            full_name,
            working_area,
            availability_status,
            verification_status,
            application_status,
            is_active
          FROM riders
          WHERE username = $1
          LIMIT 1
          `,
          [riderUsername]
        );

      if (
        riderResult.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Rider not found"
        });
      }

      const rider =
        riderResult.rows[0];

      if (!rider.is_active) {
        return res.status(409).json({
          success: false,
          message:
            "Rider account is inactive"
        });
      }

      if (
        rider.application_status !==
        "approved"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Rider application is not approved"
        });
      }

      if (
        rider.verification_status !==
        "verified"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Rider is not verified"
        });
      }

      if (
        rider.availability_status !==
        "online"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Rider must be online before assignment"
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
          AND status = 'Pending'
          AND assigned_rider IS NULL
          RETURNING *
          `,
          [
            riderUsername,
            bookingId
          ]
        );

      if (
        result.rows.length === 0
      ) {
        const bookingResult =
          await pool.query(
            `
            SELECT
              booking_id,
              status,
              assigned_rider
            FROM bookings
            WHERE booking_id = $1
            LIMIT 1
            `,
            [bookingId]
          );

        if (
          bookingResult.rows.length === 0
        ) {
          return res.status(404).json({
            success: false,
            message:
              "Booking not found"
          });
        }

        return res.status(409).json({
          success: false,
          message:
            "Only an unassigned pending booking can be assigned"
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
// ACCEPT DELIVERY — RIDER ONLY
// ===============================

router.patch(
  "/:bookingId/accept",
  authenticateToken,
  allowRoles("rider"),
  async (req, res) => {
    try {
      const bookingId =
        cleanText(
          req.params.bookingId
        );

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message:
            "Booking ID is required"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE bookings
          SET status = 'Accepted'
          WHERE booking_id = $1
          AND assigned_rider = $2
          AND status = 'Assigned'
          AND EXISTS
          (
            SELECT 1
            FROM riders
            WHERE riders.id = $3
            AND riders.username = $2
            AND riders.is_active = TRUE
            AND riders.application_status =
              'approved'
            AND riders.verification_status =
              'verified'
            AND riders.availability_status =
              'online'
          )
          RETURNING *
          `,
          [
            bookingId,
            req.user.username,
            req.user.riderId
          ]
        );

      if (
        result.rows.length === 0
      ) {
        const bookingResult =
          await pool.query(
            `
            SELECT
              booking_id,
              status,
              assigned_rider
            FROM bookings
            WHERE booking_id = $1
            LIMIT 1
            `,
            [bookingId]
          );

        if (
          bookingResult.rows.length === 0
        ) {
          return res.status(404).json({
            success: false,
            message:
              "Booking not found"
          });
        }

        const booking =
          bookingResult.rows[0];

        if (
          booking.assigned_rider !==
          req.user.username
        ) {
          return res.status(403).json({
            success: false,
            message:
              "This booking is not assigned to you"
          });
        }

        if (
          booking.status !==
          "Assigned"
        ) {
          return res.status(409).json({
            success: false,
            message:
              "Only an assigned booking can be accepted"
          });
        }

        return res.status(409).json({
          success: false,
          message:
            "Your rider account must be active, verified, approved and online"
        });
      }

      return res.json({
        success: true,
        message:
          "Delivery accepted successfully",
        booking:
          formatBooking(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "Accept delivery error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to accept delivery"
      });
    }
  }
);

// ===============================
// PICKUP PROOF — RIDER ONLY
// ===============================

router.post(
  "/:bookingId/pickup-proof",
  authenticateToken,
  allowRoles("rider"),
  uploadProofPhoto,
  handleProofUploadError,
  async (req, res) => {
    try {
      const bookingId =
        cleanText(
          req.params.bookingId
        );

      const latitude =
        cleanText(
          req.body.latitude
        );

      const longitude =
        cleanText(
          req.body.longitude
        );

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message:
            "Booking ID is required"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "Live pickup photo is required"
        });
      }

      if (
        !latitude ||
        !longitude
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Pickup GPS location is required"
        });
      }

      const numericLatitude =
        Number(latitude);

      const numericLongitude =
        Number(longitude);

      if (
        Number.isNaN(
          numericLatitude
        ) ||
        Number.isNaN(
          numericLongitude
        ) ||
        numericLatitude < -90 ||
        numericLatitude > 90 ||
        numericLongitude < -180 ||
        numericLongitude > 180
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid pickup GPS coordinates"
        });
      }

  const uploadResult =
  await uploadBufferToCloudinary({
    buffer: req.file.buffer,
    folder: "DDN/pickup-proofs",
    publicId: `${bookingId}-${Date.now()}`
  });

const photoUrl = uploadResult.secure_url;

      const result =
        await pool.query(
          `
          UPDATE bookings
          SET
            pickup_photo_url = $1,
            pickup_photo_name = $2,
            pickup_photo_size = $3,
            pickup_photo_mime_type = $4,
            pickup_latitude = $5,
            pickup_longitude = $6,
            pickup_photo_uploaded_at =
              CURRENT_TIMESTAMP,
            picked_up_at =
              CURRENT_TIMESTAMP,
            status = 'Picked Up'
          WHERE booking_id = $7
          AND assigned_rider = $8
          AND status = 'Accepted'
          RETURNING *
          `,
          [
            photoUrl,
           uploadResult.public_id,
            req.file.size,
            req.file.mimetype,
            numericLatitude,
            numericLongitude,
            bookingId,
            req.user.username
          ]
        );

      if (
        result.rows.length === 0
      ) {
        const bookingResult =
          await pool.query(
            `
            SELECT
              booking_id,
              status,
              assigned_rider
            FROM bookings
            WHERE booking_id = $1
            LIMIT 1
            `,
            [bookingId]
          );

        if (
          bookingResult.rows.length === 0
        ) {
          return res.status(404).json({
            success: false,
            message:
              "Booking not found"
          });
        }

        const booking =
          bookingResult.rows[0];

        if (
          booking.assigned_rider !==
          req.user.username
        ) {
          return res.status(403).json({
            success: false,
            message:
              "This booking is not assigned to you"
          });
        }

        return res.status(409).json({
          success: false,
          message:
            "Pickup proof can only be submitted after accepting the booking"
        });
      }

      return res.json({
        success: true,
        message:
          "Pickup proof uploaded and booking marked as Picked Up",
        booking:
          formatBooking(
            result.rows[0]
          ),
        proof: {
          photoUrl,
          latitude:
            numericLatitude,
          longitude:
            numericLongitude,
          uploadedAt:
            result.rows[0]
              .pickup_photo_uploaded_at
        }
      });
    } catch (error) {
      console.error(
        "Pickup proof error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to upload pickup proof"
      });
    }
  }
);

// ===============================
// REJECT DELIVERY — RIDER ONLY
// ===============================

router.patch(
  "/:bookingId/reject",
  authenticateToken,
  allowRoles("rider"),
  async (req, res) => {
    try {
      const bookingId =
        cleanText(
          req.params.bookingId
        );

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message:
            "Booking ID is required"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE bookings
          SET
            assigned_rider = NULL,
            status = 'Pending'
          WHERE booking_id = $1
          AND assigned_rider = $2
          AND status = 'Assigned'
          RETURNING *
          `,
          [
            bookingId,
            req.user.username
          ]
        );

      if (
        result.rows.length === 0
      ) {
        const bookingResult =
          await pool.query(
            `
            SELECT
              booking_id,
              status,
              assigned_rider
            FROM bookings
            WHERE booking_id = $1
            LIMIT 1
            `,
            [bookingId]
          );

        if (
          bookingResult.rows.length === 0
        ) {
          return res.status(404).json({
            success: false,
            message:
              "Booking not found"
          });
        }

        const booking =
          bookingResult.rows[0];

        if (
          booking.assigned_rider !==
          req.user.username
        ) {
          return res.status(403).json({
            success: false,
            message:
              "This booking is not assigned to you"
          });
        }

        return res.status(409).json({
          success: false,
          message:
            "Only an assigned booking can be rejected"
        });
      }

      return res.json({
        success: true,
        message:
          "Delivery rejected and returned for reassignment",
        booking:
          formatBooking(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "Reject delivery error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to reject delivery"
      });
    }
  }
);

// ===============================
// DELIVERY PROOF — RIDER ONLY
// ===============================

router.post(
  "/:bookingId/delivery-proof",
  authenticateToken,
  allowRoles("rider"),
  uploadProofPhoto,
handleProofUploadError,
  async (req, res) => {
    try {
      const bookingId =
        cleanText(req.params.bookingId);

      const latitude =
        cleanText(req.body.latitude);

      const longitude =
        cleanText(req.body.longitude);

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: "Booking ID is required"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "Live delivery photo is required"
        });
      }

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message:
            "Delivery GPS location is required"
        });
      }

      const lat = Number(latitude);
      const lng = Number(longitude);

      if (
        Number.isNaN(lat) ||
        Number.isNaN(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid delivery GPS coordinates"
        });
      }

     const uploadResult =
  await uploadBufferToCloudinary({
    buffer: req.file.buffer,
    folder: "DDN/delivery-proofs",
    publicId: `${bookingId}-${Date.now()}`
  });

const photoUrl = uploadResult.secure_url;

      const result =
        await pool.query(
          `
          UPDATE bookings
          SET
            delivery_photo_url = $1,
            delivery_photo_name = $2,
            delivery_photo_size = $3,
            delivery_photo_mime_type = $4,
            delivery_latitude = $5,
            delivery_longitude = $6,
            delivered_at = CURRENT_TIMESTAMP,
            status = 'Delivered'
          WHERE booking_id = $7
          AND assigned_rider = $8
          AND status = 'Reached Drop Location'
          RETURNING *
          `,
          [
            photoUrl,
            uploadResult.public_id,
            req.file.size,
            req.file.mimetype,
            lat,
            lng,
            bookingId,
            req.user.username
          ]
        );

      if (result.rows.length === 0) {
        return res.status(409).json({
          success: false,
          message:
            "Delivery proof can only be uploaded after reaching the drop location."
        });
      }

      return res.json({
        success: true,
        message:
          "Delivery completed successfully",
        booking:
          formatBooking(result.rows[0]),
        proof: {
          photoUrl,
          latitude: lat,
          longitude: lng,
          deliveredAt:
            result.rows[0].delivered_at
        }
      });

    } catch (error) {
      console.error(
        "Delivery proof error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to upload delivery proof"
      });
    }
  }
);

// ===============================
// ADMIN EMERGENCY OVERRIDE
// ===============================

router.patch(
  "/:bookingId/admin-override",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {

      const bookingId =
        cleanText(req.params.bookingId);

      const newStatus =
        cleanText(req.body.status);

      const reason =
        cleanText(req.body.reason);

      if (!bookingId || !newStatus) {
        return res.status(400).json({
          success: false,
          message:
            "Booking ID and status are required"
        });
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          message:
            "Override reason is required"
        });
      }

      if (
        !VALID_BOOKING_STATUSES.includes(newStatus)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking status"
        });
      }

            const client =
        await pool.connect();

      try {
        await client.query("BEGIN");

        const bookingResult =
          await client.query(
            `
            SELECT *
            FROM bookings
            WHERE booking_id = $1
            FOR UPDATE
            `,
            [bookingId]
          );

        if (
          bookingResult.rows.length === 0
        ) {
          await client.query("ROLLBACK");

          return res.status(404).json({
            success: false,
            message: "Booking not found"
          });
        }

        const booking =
          bookingResult.rows[0];

        if (
          booking.status === newStatus
        ) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            message:
              `Booking is already in ${newStatus} status`
          });
        }

        const updateResult =
          await client.query(
            `
            UPDATE bookings
            SET status = $1
            WHERE booking_id = $2
            RETURNING *
            `,
            [
              newStatus,
              bookingId
            ]
          );

        await client.query(
          `
          INSERT INTO booking_status_logs
          (
            booking_id,
            old_status,
            new_status,
            changed_by,
            changed_role,
            reason
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          `,
          [
            booking.booking_id,
            booking.status,
            newStatus,
            req.user.username,
            "admin",
            reason
          ]
        );

        await client.query("COMMIT");

        return res.json({
          success: true,
          message:
            "Booking status overridden successfully",
          booking:
            formatBooking(
              updateResult.rows[0]
            ),
          override: {
            oldStatus:
              booking.status,
            newStatus,
            changedBy:
              req.user.username,
            reason
          }
        });
      } catch (transactionError) {
        await client.query("ROLLBACK");
        throw transactionError;
      } finally {
        client.release();
      }
    } catch (error) {

      console.error(
        "Admin override error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to override booking"
      });

    }
  }
);

// ===============================
// UPDATE DELIVERY STATUS
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

      const requestedStatus =
        cleanText(
          req.body.status
        );

      if (
        !bookingId ||
        !requestedStatus
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Booking ID and status are required"
        });
      }

      const bookingResult =
        await pool.query(
          `
          SELECT *
          FROM bookings
          WHERE booking_id = $1
          LIMIT 1
          `,
          [bookingId]
        );

      if (
        bookingResult.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found"
        });
      }

      const booking =
        bookingResult.rows[0];

      if (
        req.user.role === "rider"
      ) {
        if (
          booking.assigned_rider !==
          req.user.username
        ) {
          return res.status(403).json({
            success: false,
            message:
              "This booking is not assigned to you"
          });
        }

        const requiredNextStatus =
          getNextRiderStatus(
            booking.status
          );

        if (!requiredNextStatus) {
          return res.status(409).json({
            success: false,
            message:
              `Status cannot be changed from ${booking.status}`
          });
        }

        if (
          requestedStatus !==
          requiredNextStatus
        ) {
          return res.status(409).json({
            success: false,
            message:
              `Next allowed status is ${requiredNextStatus}`
          });
        }
      } else {
        const adminAllowed =
          canAdminChangeStatus(
            booking.status,
            requestedStatus
          );

        if (!adminAllowed) {
          return res.status(409).json({
            success: false,
            message:
              `Status cannot be changed from ${booking.status} to ${requestedStatus}`
          });
        }
      }

      const updateResult =
        await pool.query(
          `
          UPDATE bookings
          SET status = $1
          WHERE booking_id = $2
          AND status = $3
          RETURNING *
          `,
          [
            requestedStatus,
            bookingId,
            booking.status
          ]
        );

      if (
        updateResult.rows.length === 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Booking status was already changed. Please refresh and try again."
        });
      }

      return res.json({
        success: true,
        message:
          "Booking status updated successfully",
        booking:
          formatBooking(
            updateResult.rows[0]
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

// ===============================
// LIVE CUSTOMER TRACKING — PUBLIC
// ===============================

router.get(
  "/:bookingId/tracking",
  async (req, res) => {

    try {

      const bookingId =
        cleanText(
          req.params.bookingId
        );

      const result =
        await pool.query(
          `
          SELECT
            b.booking_id,
            b.status,
            b.pickup_location,
            b.delivery_location,
            b.customer_pickup_latitude,
            b.customer_pickup_longitude,
            b.customer_delivery_latitude,
            b.customer_delivery_longitude,
            b.assigned_rider,

            r.current_latitude,
            r.current_longitude,
            r.last_location_updated_at

          FROM bookings b

          LEFT JOIN riders r
          ON r.username = b.assigned_rider

          WHERE b.booking_id = $1

          LIMIT 1
          `,
          [bookingId]
        );

      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });

      }

      const booking =
        result.rows[0];

      return res.json({

        success: true,

        tracking: {

          bookingId:
            booking.booking_id,

          status:
            booking.status,

          pickupLocation:
            booking.pickup_location,

          deliveryLocation:
            booking.delivery_location,

          pickupLatitude:
            booking.customer_pickup_latitude,

          pickupLongitude:
            booking.customer_pickup_longitude,

          deliveryLatitude:
            booking.customer_delivery_latitude,

          deliveryLongitude:
            booking.customer_delivery_longitude,

          riderLatitude:
            booking.current_latitude,

          riderLongitude:
            booking.current_longitude,

          assignedRider:
            booking.assigned_rider,

          lastUpdated:
            booking.last_location_updated_at

        }

      });

    } catch (error) {

      console.error(
        "Tracking API error:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Failed to load tracking"

      });

    }

  }
);

// ===============================
// CUSTOMER TRACKING — PUBLIC
// Keep this route near the bottom
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
          LIMIT 1
          `,
          [bookingId]
        );

      if (
        result.rows.length === 0
      ) {
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

module.exports = router;