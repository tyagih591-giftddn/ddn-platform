require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const authenticateToken = require("./middleware/auth");
const allowRoles = require("./middleware/roles");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


// ===============================
// DATABASE CONNECTION
// ===============================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


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
    status: booking.status,
    assignedRider: booking.assigned_rider,
    createdAt: booking.created_at
  };
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
// LOGIN API
// ===============================

app.post(
  "/api/auth/login",
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
// CREATE BOOKING — PUBLIC
// ===============================

app.post(
  "/api/bookings",
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

app.get(
  "/api/bookings",
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

app.get(
  "/api/bookings/:bookingId",
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

app.patch(
  "/api/bookings/:bookingId/assign",
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

app.patch(
  "/api/bookings/:bookingId/status",
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