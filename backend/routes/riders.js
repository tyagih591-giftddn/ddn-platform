const express = require("express");
const bcrypt = require("bcryptjs");

const pool = require("../config/database");
const authenticateToken = require("../middleware/auth");
const allowRoles = require("../middleware/roles");
const riderController = require(
  "../controllers/riderController"
);

const {
  riderDocumentUpload,
  handleUploadError
} = require("../middleware/upload");

const {
  generateRiderCode
} = require("../utils/riderIdGenerator");

const router = express.Router();

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeUsername(value) {
  return cleanText(value).toLowerCase();
}

function formatRider(rider) {
  return {
    id: rider.id,
    riderCode: rider.rider_code,
    username: rider.username,
    fullName: rider.full_name,
    mobileNumber: rider.mobile_number,
    email: rider.email,
    address: rider.address,
    workingArea: rider.working_area,
    vehicleType: rider.vehicle_type,
    vehicleNumber: rider.vehicle_number,
    availabilityStatus:
      rider.availability_status,
    verificationStatus:
      rider.verification_status,
    applicationStatus:
  rider.application_status,

accountStatus:
  rider.account_status,

isActive:
  rider.is_active,

applicationSubmittedAt:
  rider.application_submitted_at,

approvedAt:
  rider.approved_at,

approvedBy:
  rider.approved_by,

rejectionReason:
  rider.rejection_reason,

correctionNotes:
  rider.correction_notes,

blockedAt:
  rider.blocked_at,

blockedReason:
  rider.blocked_reason,

resignedAt:
  rider.resigned_at,

resignationReason:
  rider.resignation_reason,

passwordResetRequired:
  rider.password_reset_required,

lastPasswordResetAt:
  rider.last_password_reset_at,

createdAt:
  rider.created_at,

updatedAt:
  rider.updated_at
  };
}

function getDuplicateMessage(error) {
  const constraint =
    cleanText(error.constraint).toLowerCase();

  const detail =
    cleanText(error.detail).toLowerCase();

  if (
    constraint.includes("username") ||
    detail.includes("(username)")
  ) {
    return "Rider username already exists";
  }

  if (
    constraint.includes("mobile") ||
    detail.includes("(mobile_number)")
  ) {
    return "Rider mobile number already exists";
  }

  if (
    constraint.includes("rider_code") ||
    detail.includes("(rider_code)")
  ) {
    return "Rider code already exists. Please try again.";
  }

  return "Rider already exists";
}

// ===============================
// PUBLIC RIDER REGISTRATION
// ===============================

router.post(
  "/riders/register",
  riderController.registerRider
);

// ===============================
// RIDER DOCUMENT UPLOAD
// ===============================

router.post(
  "/riders/:riderId/documents",
  riderDocumentUpload,
  handleUploadError,
  riderController.uploadRiderDocuments
);

// ===============================
// GET RIDER BY ID — ADMIN ONLY
// ===============================

router.get(
  "/admin/riders/id/:riderId",
  authenticateToken,
  allowRoles("admin"),
  riderController.getRiderById
);

// ===============================
// GET RIDER BY USERNAME — ADMIN
// ===============================

router.get(
  "/admin/riders/username/:username",
  authenticateToken,
  allowRoles("admin"),
  riderController.getRiderByUsername
);

router.post(
  "/admin/riders",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    let client;

    try {
      const username =
        normalizeUsername(
          req.body.username
        );

      const password =
        cleanText(
          req.body.password
        );

      const fullName =
        cleanText(
          req.body.fullName
        );

      const mobileNumber =
        cleanText(
          req.body.mobileNumber
        );

      if (
        !username ||
        !password ||
        !fullName
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Username, password and full name are required"
        });
      }

      const usernamePattern =
        /^[a-z0-9._-]{3,50}$/;

      if (
        !usernamePattern.test(username)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Username must contain 3-50 letters, numbers, dots, underscores or hyphens"
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 8 characters"
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      client =
        await pool.connect();

      await client.query("BEGIN");

      const riderCode =
        await generateRiderCode(
          client
        );

      const result =
        await client.query(
          `
          INSERT INTO riders
          (
            rider_code,
            username,
            password_hash,
            full_name,
            mobile_number,
            verification_status,
            application_status,
            account_status,
            is_active
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
            $9
          )
          RETURNING *
          `,
          [
            riderCode,
            username,
            passwordHash,
            fullName,
            mobileNumber || null,
            "verified",
            "approved",
            "active",
             true
          ]
        );

      await client.query(
        "COMMIT"
      );

      return res.status(201).json({
        success: true,
        message:
          "Rider created successfully",
        rider:
          formatRider(
            result.rows[0]
          )
      });

    } catch (error) {

      if (client) {
        await client.query(
          "ROLLBACK"
        );
      }

      if (
        error.code === "23505"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Rider username already exists"
        });
      }

      console.error(
        "Create rider error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to create rider"
      });

    } finally {

      if (client) {
        client.release();
      }

    }
  }
);

// ===============================
// GET RIDERS — ADMIN ONLY
// ===============================

router.get(
  "/admin/riders",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const result =
        await pool.query(`
          SELECT
            id,
            rider_code,
            username,
            full_name,
            mobile_number,
            email,
            address,
            working_area,
            vehicle_type,
            vehicle_number,
            availability_status,
            verification_status,
            application_status,
            account_status,
            application_submitted_at,
            approved_at,
            approved_by,
            rejection_reason,
            correction_notes,
            blocked_at,
            blocked_reason,
            resigned_at,
            resignation_reason,
            password_reset_required,
            last_password_reset_at,
            is_active,
            created_at,
            updated_at
            FROM riders
            ORDER BY created_at DESC
        `);

      return res.json({
        success: true,
        riders:
          result.rows.map(
            formatRider
          )
      });
    } catch (error) {
      console.error(
        "Get riders error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load riders"
      });
    }
  }
);

// ===============================
// APPROVE RIDER — ADMIN ONLY
// ===============================

router.patch(
  "/admin/riders/:username/approve",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const username =
        normalizeUsername(
          req.params.username
        );

      if (!username) {
        return res.status(400).json({
          success: false,
          message:
            "Rider username is required"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE riders
          SET
  verification_status = 'verified',
  application_status = 'approved',
  account_status = 'active',
  is_active = TRUE,
  approved_at = CURRENT_TIMESTAMP,
  approved_by = $2,
  rejection_reason = NULL,
  correction_notes = NULL,
  blocked_at = NULL,
  blocked_reason = NULL,
  updated_at = CURRENT_TIMESTAMP
          WHERE username = $1
RETURNING *
`,
[
  username,
  req.user.username || "admin"
]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Rider not found"
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Rider approved successfully",
        rider:
          formatRider(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "Approve rider error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to approve rider"
      });
    }
  }
);

// ===============================
// REJECT RIDER — ADMIN ONLY
// ===============================

router.patch(
  "/admin/riders/:username/reject",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const username =
        normalizeUsername(
          req.params.username
        );

      const rejectionReason =
        cleanText(
          req.body.rejectionReason
        );

      if (!username) {
        return res.status(400).json({
          success: false,
          message:
            "Rider username is required"
        });
      }

      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message:
            "Rejection reason is required"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE riders
          SET
            verification_status = 'rejected',
            application_status = 'rejected',
            account_status = 'inactive',
            is_active = FALSE,
            rejection_reason = $2,
            correction_notes = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE username = $1
          RETURNING *
          `,
          [
            username,
            rejectionReason
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Rider not found"
        });
      }

      return res.json({
        success: true,
        message:
          "Rider application rejected",
        rider:
          formatRider(
            result.rows[0]
          )
      });

    } catch (error) {
      console.error(
        "Reject rider error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to reject rider"
      });
    }
  }
);


// ===============================
// REQUEST RIDER CORRECTION
// ===============================

router.patch(
  "/admin/riders/:username/request-correction",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const username =
        normalizeUsername(
          req.params.username
        );

      const correctionNotes =
        cleanText(
          req.body.correctionNotes
        );

      if (!username) {
        return res.status(400).json({
          success: false,
          message:
            "Rider username is required"
        });
      }

      if (!correctionNotes) {
        return res.status(400).json({
          success: false,
          message:
            "Correction notes are required"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE riders
          SET
            verification_status = 'correction_required',
            application_status = 'correction_required',
            account_status = 'pending',
            is_active = FALSE,
            correction_notes = $2,
            rejection_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE username = $1
          RETURNING *
          `,
          [
            username,
            correctionNotes
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Rider not found"
        });
      }

      return res.json({
        success: true,
        message:
          "Rider correction requested",
        rider:
          formatRider(
            result.rows[0]
          )
      });

    } catch (error) {
      console.error(
        "Request rider correction error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to request rider correction"
      });
    }
  }
);

// ===============================
// RIDER ACCOUNT STATUS — ADMIN
// ===============================

router.patch(
  "/admin/riders/:username/status",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const username =
        normalizeUsername(
          req.params.username
        );

      const {
        isActive
      } = req.body;

      if (
        typeof isActive !== "boolean"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "isActive must be true or false"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE riders
SET
  is_active = $1,
  account_status =
    CASE
      WHEN $1 = TRUE
      THEN 'active'
      ELSE 'inactive'
    END,
  updated_at = CURRENT_TIMESTAMP
WHERE username = $2
RETURNING *
          `,
          [
            isActive,
            username
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Rider not found"
        });
      }

      return res.json({
        success: true,
        message:
          isActive
            ? "Rider activated successfully"
            : "Rider deactivated successfully",
        rider:
          formatRider(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "Update rider error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update rider"
      });
    }
  }
);

// ===============================
// BLOCK RIDER — ADMIN ONLY
// ===============================

router.patch(
  "/admin/riders/:username/block",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const username =
        normalizeUsername(
          req.params.username
        );

      const blockedReason =
        cleanText(
          req.body.blockedReason
        );

      if (!username) {
        return res.status(400).json({
          success: false,
          message:
            "Rider username is required"
        });
      }

      if (!blockedReason) {
        return res.status(400).json({
          success: false,
          message:
            "Block reason is required"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE riders
          SET
            is_active = FALSE,
            account_status = 'blocked',
            blocked_at = CURRENT_TIMESTAMP,
            blocked_reason = $2,
            availability_status = 'offline',
            updated_at = CURRENT_TIMESTAMP
          WHERE username = $1
          RETURNING *
          `,
          [
            username,
            blockedReason
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Rider not found"
        });
      }

      return res.json({
        success: true,
        message:
          "Rider blocked successfully",
        rider:
          formatRider(
            result.rows[0]
          )
      });

    } catch (error) {
      console.error(
        "Block rider error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to block rider"
      });
    }
  }
);


// ===============================
// UNBLOCK RIDER — ADMIN ONLY
// ===============================

router.patch(
  "/admin/riders/:username/unblock",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const username =
        normalizeUsername(
          req.params.username
        );

      if (!username) {
        return res.status(400).json({
          success: false,
          message:
            "Rider username is required"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE riders
          SET
            is_active = TRUE,
            account_status = 'active',
            blocked_at = NULL,
            blocked_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE username = $1
          AND application_status = 'approved'
          AND verification_status = 'verified'
          RETURNING *
          `,
          [username]
        );

      if (result.rows.length === 0) {
        return res.status(409).json({
          success: false,
          message:
            "Only approved and verified riders can be unblocked"
        });
      }

      return res.json({
        success: true,
        message:
          "Rider unblocked successfully",
        rider:
          formatRider(
            result.rows[0]
          )
      });

    } catch (error) {
      console.error(
        "Unblock rider error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to unblock rider"
      });
    }
  }
);

// ===============================
// MARK RIDER AS RESIGNED — ADMIN
// ===============================

router.patch(
  "/admin/riders/:username/resign",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const username =
        normalizeUsername(
          req.params.username
        );

      const resignationReason =
        cleanText(
          req.body.resignationReason
        );

      if (!username) {
        return res.status(400).json({
          success: false,
          message:
            "Rider username is required"
        });
      }

      if (!resignationReason) {
        return res.status(400).json({
          success: false,
          message:
            "Resignation reason is required"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE riders
          SET
            account_status = 'resigned',
            is_active = FALSE,
            availability_status = 'offline',
            resigned_at = CURRENT_TIMESTAMP,
            resignation_reason = $2,
            updated_at = CURRENT_TIMESTAMP
          WHERE username = $1
          RETURNING *
          `,
          [
            username,
            resignationReason
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Rider not found"
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Rider marked as resigned successfully",
        rider:
          formatRider(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "Resign rider error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to mark rider as resigned"
      });
    }
  }
);

// ===============================
// RIDER AVAILABILITY
// ===============================

router.patch(
  "/rider/availability",
  authenticateToken,
  allowRoles("rider"),
  async (req, res) => {
    try {
      const availabilityStatus =
        cleanText(
          req.body.availabilityStatus
        ).toLowerCase();

      const allowedStatuses = [
        "online",
        "offline"
      ];

      if (
        !allowedStatuses.includes(
          availabilityStatus
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Availability must be online or offline"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE riders
          SET
            availability_status = $1,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = $2
          AND is_active = TRUE
          RETURNING *
          `,
          [
            availabilityStatus,
            req.user.riderId
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Active rider account not found"
        });
      }

      return res.json({
        success: true,
        message:
          "Availability updated successfully",
        rider:
          formatRider(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "Availability error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update availability"
      });
    }
  }
);

// ===============================
// RIDER LIVE LOCATION
// ===============================

router.post(
  "/rider/location",
  authenticateToken,
  allowRoles("rider"),
  async (req, res) => {
    try {
      const latitude =
        Number(
          req.body.latitude
        );

      const longitude =
        Number(
          req.body.longitude
        );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180 ||
        (
          latitude === 0 &&
          longitude === 0
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid latitude and longitude are required"
        });
      }

      const result =
        await pool.query(
          `
          UPDATE riders
          SET
            current_latitude = $1,
            current_longitude = $2,
            last_location_updated_at =
              CURRENT_TIMESTAMP,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = $3
          AND is_active = TRUE
          AND application_status =
            'approved'
          AND verification_status =
            'verified'
          AND availability_status =
            'online'
          RETURNING
            id,
            username,
            full_name,
            availability_status,
            current_latitude,
            current_longitude,
            last_location_updated_at
          `,
          [
            latitude,
            longitude,
            req.user.riderId
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Rider must be active, approved, verified and online before sharing location"
        });
      }

      const riderLocation =
        result.rows[0];

      const io =
        req.app.get("io");

      if (io) {
        io.emit(
          "rider-location-updated",
          {
            riderId:
              riderLocation.id,

            username:
              riderLocation.username,

            fullName:
              riderLocation.full_name,

            availabilityStatus:
              riderLocation
                .availability_status,

            latitude:
              Number(
                riderLocation
                  .current_latitude
              ),

            longitude:
              Number(
                riderLocation
                  .current_longitude
              ),

            updatedAt:
              riderLocation
                .last_location_updated_at
          }
        );
      }

      return res.json({
        success: true,
        message:
          "Location updated successfully",
        location: {
          riderId:
            riderLocation.id,

          username:
            riderLocation.username,

          fullName:
            riderLocation.full_name,

          availabilityStatus:
            riderLocation
              .availability_status,

          latitude:
            Number(
              riderLocation
                .current_latitude
            ),

          longitude:
            Number(
              riderLocation
                .current_longitude
            ),

          updatedAt:
            riderLocation
              .last_location_updated_at
        }
      });

    } catch (error) {
      console.error(
        "Update rider location error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update location"
      });
    }
  }
);
module.exports = router;