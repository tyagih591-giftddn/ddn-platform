const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const pool = require("../config/database");

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

function getBearerToken(req) {
  const authorization =
    cleanText(req.headers.authorization);

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    return "";
  }

  return authorization
    .substring(7)
    .trim();
}

// ===============================
// ADMIN AUTHENTICATION MIDDLEWARE
// ===============================

function requireAdmin(req, res, next) {
  try {
    if (!process.env.JWT_SECRET) {
      console.error(
        "JWT_SECRET is missing"
      );

      return res.status(500).json({
        success: false,
        message:
          "Server security configuration error"
      });
    }

    const token =
      getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message:
          "Admin authorization token is required"
      });
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    if (
      !decoded ||
      decoded.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Admin access required"
      });
    }

    req.user = decoded;

    next();
  } catch (error) {
    if (
      error.name ===
        "JsonWebTokenError" ||
      error.name ===
        "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid or expired authorization token"
      });
    }

    console.error(
      "Admin authentication error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Authorization failed"
    });
  }
}

// ===============================
// LOGIN API
// POST /api/auth/login
// ===============================

router.post(
  "/login",
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

      const role =
        cleanText(
          req.body.role
        ).toLowerCase();

      if (
        !username ||
        !password ||
        !role
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Username, password and role are required"
        });
      }

      if (!process.env.JWT_SECRET) {
        console.error(
          "JWT_SECRET is missing"
        );

        return res.status(500).json({
          success: false,
          message:
            "Server security configuration error"
        });
      }

      let tokenPayload;

      if (role === "admin") {
        const adminUsername =
          normalizeUsername(
            process.env.ADMIN_USERNAME
          );

        const adminPassword =
          cleanText(
            process.env.ADMIN_PASSWORD
          );

        if (
          !adminUsername ||
          !adminPassword
        ) {
          console.error(
            "Admin credentials are missing"
          );

          return res.status(500).json({
            success: false,
            message:
              "Admin configuration error"
          });
        }

        if (
          username !== adminUsername ||
          password !== adminPassword
        ) {
          return res.status(401).json({
            success: false,
            message:
              "Invalid username or password"
          });
        }

        tokenPayload = {
          username,
          role: "admin"
        };
      } else if (role === "rider") {
        const result =
          await pool.query(
            `
            SELECT
              id,
              username,
              password_hash,
              is_active
            FROM riders
            WHERE LOWER(username) = $1
            LIMIT 1
            `,
            [username]
          );

        if (
          result.rows.length === 0
        ) {
          return res.status(401).json({
            success: false,
            message:
              "Invalid username or password"
          });
        }

        const rider =
          result.rows[0];

        if (!rider.is_active) {
          return res.status(403).json({
            success: false,
            message:
              "Rider account is inactive"
          });
        }

        if (!rider.password_hash) {
          console.error(
            `Password hash missing for rider ${rider.username}`
          );

          return res.status(500).json({
            success: false,
            message:
              "Rider account password configuration error"
          });
        }

        const passwordMatches =
          await bcrypt.compare(
            password,
            rider.password_hash
          );

        if (!passwordMatches) {
          return res.status(401).json({
            success: false,
            message:
              "Invalid username or password"
          });
        }

        await pool.query(
  `
  UPDATE riders
  SET
    availability_status = 'online',
    updated_at = CURRENT_TIMESTAMP
  WHERE id = $1
  `,
  [rider.id]
);

        tokenPayload = {
          riderId: rider.id,
          username: rider.username,
          role: "rider"
        };
      } else {
        return res.status(400).json({
          success: false,
          message:
            "Invalid role"
        });
      }

      const token =
        jwt.sign(
          tokenPayload,
          process.env.JWT_SECRET,
          {
            expiresIn: "12h"
          }
        );

      return res.json({
        success: true,
        message:
          "Login successful",
        role:
          tokenPayload.role,
        username:
          tokenPayload.username,
        riderId:
          tokenPayload.riderId ||
          null,
        token
      });
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Login failed"
      });
    }
  }
);

// ===============================
// RESET RIDER PASSWORD
// ADMIN ONLY
// POST /api/auth/reset-rider-password
// ===============================

router.post(
  "/reset-rider-password",
  requireAdmin,
  async (req, res) => {
    try {
      const username =
        normalizeUsername(
          req.body.username
        );

      const newPassword =
        cleanText(
          req.body.newPassword
        );

      const confirmPassword =
        cleanText(
          req.body.confirmPassword
        );

      if (
        !username ||
        !newPassword ||
        !confirmPassword
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Username, newPassword and confirmPassword are required"
        });
      }

      if (
        newPassword !==
        confirmPassword
      ) {
        return res.status(400).json({
          success: false,
          message:
            "New password and confirm password do not match"
        });
      }

      if (
        newPassword.length < 8
      ) {
        return res.status(400).json({
          success: false,
          message:
            "New password must be at least 8 characters long"
        });
      }

      const riderResult =
        await pool.query(
          `
          SELECT
            id,
            username,
            is_active
          FROM riders
          WHERE LOWER(username) = $1
          LIMIT 1
          `,
          [username]
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

      const passwordHash =
        await bcrypt.hash(
          newPassword,
          12
        );

      await pool.query(
        `
        UPDATE riders
        SET
          password_hash = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [
          passwordHash,
          rider.id
        ]
      );

      return res.json({
        success: true,
        message:
          "Rider password reset successfully",
        rider: {
          id: rider.id,
          username:
            rider.username,
          isActive:
            rider.is_active
        }
      });
    } catch (error) {
      console.error(
        "Rider password reset error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Rider password reset failed"
      });
    }
  }
);

// ===============================
// VERIFY TOKEN
// GET /api/auth/verify
// ===============================

router.get(
  "/verify",
  async (req, res) => {
    try {
      if (!process.env.JWT_SECRET) {
        return res.status(500).json({
          success: false,
          message:
            "Server security configuration error"
        });
      }

      const token =
        getBearerToken(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          message:
            "Authorization token is required"
        });
      }

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );

      return res.json({
        success: true,
        message:
          "Token is valid",
        user: {
          riderId:
            decoded.riderId ||
            null,
          username:
            decoded.username,
          role:
            decoded.role
        }
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid or expired authorization token"
      });
    }
  }
);

module.exports = router;