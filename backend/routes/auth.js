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

// ===============================
// LOGIN API
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
            SELECT *
            FROM riders
            WHERE username = $1
            LIMIT 1
            `,
            [username]
          );

        if (result.rows.length === 0) {
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
        role: tokenPayload.role,
        username:
          tokenPayload.username,
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

module.exports = router;