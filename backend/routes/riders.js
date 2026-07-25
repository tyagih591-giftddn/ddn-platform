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
    isActive: rider.is_active,
    createdAt: rider.created_at,
    updatedAt: rider.updated_at
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
            $8
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
            verification_status =
              'verified',
            application_status =
              'approved',
            is_active = TRUE,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE username = $1
          RETURNING *
          `,
          [username]
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
            updated_at =
              CURRENT_TIMESTAMP
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

module.exports = router;