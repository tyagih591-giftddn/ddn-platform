const express = require("express");
const bcrypt = require("bcryptjs");

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

function formatRider(rider) {
  return {
    id: rider.id,
    username: rider.username,
    fullName: rider.full_name,
    mobileNumber: rider.mobile_number,
    availabilityStatus:
      rider.availability_status,
    isActive: rider.is_active,
    createdAt: rider.created_at,
    updatedAt: rider.updated_at
  };
}

// ===============================
// CREATE RIDER — ADMIN ONLY
// ===============================

router.post(
  "/admin/riders",
  authenticateToken,
  allowRoles("admin"),
  async (req, res) => {
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
        !usernamePattern.test(
          username
        )
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

      const result =
        await pool.query(
          `
          INSERT INTO riders
          (
            username,
            password_hash,
            full_name,
            mobile_number
          )
          VALUES ($1, $2, $3, $4)
          RETURNING *
          `,
          [
            username,
            passwordHash,
            fullName,
            mobileNumber || null
          ]
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
      if (error.code === "23505") {
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
            username,
            full_name,
            mobile_number,
            availability_status,
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