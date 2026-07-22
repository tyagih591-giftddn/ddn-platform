const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

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
// DATABASE TABLE
// ===============================

async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        booking_id VARCHAR(100) UNIQUE NOT NULL,
        pickup_location TEXT NOT NULL,
        delivery_location TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        mobile_number VARCHAR(20) NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        assigned_rider VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS
      assigned_rider VARCHAR(100)
    `);

    console.log("Bookings table is ready");
  } catch (error) {
    console.error(
      "Database table error:",
      error.message
    );
  }
}

createTable();


// ===============================
// FORMAT BOOKING
// ===============================

function formatBooking(booking) {
  return {
    bookingId: booking.booking_id,
    pickupLocation:
      booking.pickup_location,
    deliveryLocation:
      booking.delivery_location,
    customerName:
      booking.customer_name,
    mobileNumber:
      booking.mobile_number,
    status:
      booking.status,
    assignedRider:
      booking.assigned_rider,
    createdAt:
      booking.created_at
  };
}


// ===============================
// JWT AUTHENTICATION MIDDLEWARE
// ===============================

function authenticateToken(
  req,
  res,
  next
) {
  const authHeader =
    req.headers.authorization;

  const token =
    authHeader &&
    authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message:
        "Authentication token is required"
    });
  }

  try {
    const user =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    req.user = user;

    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message:
        "Invalid or expired token"
    });
  }
}


// ===============================
// ROLE AUTHORIZATION
// ===============================

function allowRoles(...roles) {
  return function (
    req,
    res,
    next
  ) {
    if (
      !req.user ||
      !roles.includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission"
      });
    }

    next();
  };
}


// ===============================
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.json({
    message:
      "DDN Backend API is running",
    status:
      "success",
    security:
      "JWT enabled"
  });
});


// ===============================
// LOGIN API
// ===============================

app.post(
  "/api/auth/login",
  (req, res) => {
    try {
      const {
        username,
        password,
        role
      } = req.body;

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

      let correctUsername;
      let correctPassword;

      if (role === "admin") {
        correctUsername =
          process.env.ADMIN_USERNAME;

        correctPassword =
          process.env.ADMIN_PASSWORD;
      } else if (role === "rider") {
        correctUsername =
          process.env.RIDER_USERNAME;

        correctPassword =
          process.env.RIDER_PASSWORD;
      } else {
        return res.status(400).json({
          success: false,
          message:
            "Invalid role"
        });
      }

      if (
        username !== correctUsername ||
        password !== correctPassword
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid username or password"
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

      const token =
        jwt.sign(
          {
            username,
            role
          },
          process.env.JWT_SECRET,
          {
            expiresIn: "12h"
          }
        );

      res.json({
        success: true,
        message:
          "Login successful",
        role,
        username,
        token
      });
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Login failed"
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
      const {
        pickupLocation,
        deliveryLocation,
        customerName,
        mobileNumber
      } = req.body;

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
        "DDN-" + Date.now();

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
            pickupLocation.trim(),
            deliveryLocation.trim(),
            customerName.trim(),
            mobileNumber.trim(),
            "Pending"
          ]
        );

      res.status(201).json({
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

      res.status(500).json({
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

      const bookings =
        result.rows.map(
          formatBooking
        );

      res.json({
        success: true,
        bookings
      });
    } catch (error) {
      console.error(
        "Get bookings error:",
        error
      );

      res.status(500).json({
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
      const {
        bookingId
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT *
          FROM bookings
          WHERE booking_id = $1
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

      res.json({
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

      res.status(500).json({
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
      const {
        bookingId
      } = req.params;

      const {
        rider
      } = req.body;

      if (
        !rider ||
        !rider.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Rider username is required"
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
            rider.trim(),
            bookingId
          ]
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

      res.json({
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

      res.status(500).json({
        success: false,
        message:
          "Failed to assign rider"
      });
    }
  }
);


// ===============================
// UPDATE STATUS — ADMIN/RIDER
// ===============================

app.patch(
  "/api/bookings/:bookingId/status",
  authenticateToken,
  allowRoles("admin", "rider"),
  async (req, res) => {
    try {
      const {
        bookingId
      } = req.params;

      const {
        status
      } = req.body;

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

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found or not assigned to this rider"
        });
      }

      res.json({
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

      res.status(500).json({
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

app.listen(PORT, () => {
  console.log(
    `DDN Backend running on port ${PORT}`
  );
});
