require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const pool = require("./config/database");
const authenticateToken = require("./middleware/auth");
const allowRoles = require("./middleware/roles");
const authRoutes = require("./routes/auth");
const bookingRoutes = require("./routes/bookings");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);


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
// DATABASE TABLES
// ===============================

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      booking_id VARCHAR(100)
        UNIQUE NOT NULL,
      pickup_location TEXT NOT NULL,
      delivery_location TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      mobile_number VARCHAR(20)
        NOT NULL,
      status VARCHAR(50)
        DEFAULT 'Pending',
      assigned_rider VARCHAR(100),
      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    assigned_rider VARCHAR(100)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS riders (
      id SERIAL PRIMARY KEY,

      username VARCHAR(100)
        UNIQUE NOT NULL,

      password_hash TEXT NOT NULL,

      full_name VARCHAR(150)
        NOT NULL,

      mobile_number VARCHAR(20),

      availability_status VARCHAR(20)
        NOT NULL DEFAULT 'offline',

      is_active BOOLEAN
        NOT NULL DEFAULT TRUE,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_bookings_assigned_rider
    ON bookings (assigned_rider)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_bookings_created_at
    ON bookings (created_at DESC)
  `);

  await createDefaultRider();

  console.log(
    "Database tables are ready"
  );
}


// ===============================
// DEFAULT RIDER MIGRATION
// ===============================

async function createDefaultRider() {
  const username =
    normalizeUsername(
      process.env.RIDER_USERNAME
    );

  const password =
    cleanText(
      process.env.RIDER_PASSWORD
    );

  if (!username || !password) {
    console.log(
      "Default rider environment variables are not configured"
    );

    return;
  }

  const existingRider =
    await pool.query(
      `
      SELECT id
      FROM riders
      WHERE username = $1
      `,
      [username]
    );

  if (existingRider.rows.length > 0) {
    return;
  }

  const passwordHash =
    await bcrypt.hash(
      password,
      12
    );

  await pool.query(
    `
    INSERT INTO riders
    (
      username,
      password_hash,
      full_name,
      availability_status,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5)
    `,
    [
      username,
      passwordHash,
      cleanText(
        process.env.RIDER_FULL_NAME
      ) || "DDN Rider",
      "offline",
      true
    ]
  );

  console.log(
    `Default rider created: ${username}`
  );
}


// ===============================
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message:
      "DDN Backend API is running",
    status: "success",
    security: "JWT enabled"
  });
});


// ===============================
// CREATE RIDER — ADMIN ONLY
// ===============================

app.post(
  "/api/admin/riders",
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

app.get(
  "/api/admin/riders",
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

app.patch(
  "/api/admin/riders/:username/status",
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

app.patch(
  "/api/rider/availability",
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
// START SERVER
// ===============================

async function startServer() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is missing"
      );
    }

    if (!process.env.JWT_SECRET) {
      throw new Error(
        "JWT_SECRET is missing"
      );
    }

    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(
        `DDN Backend running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Server startup failed:",
      error.message
    );

    process.exit(1);
  }
}

startServer();