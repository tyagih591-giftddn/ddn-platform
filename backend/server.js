const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// PostgreSQL Database Connection
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.json({
    message: "DDN Backend API is running",
    status: "success"
  });
});


// ===============================
// BACKEND LOGIN API
// ===============================

app.post("/api/auth/login", (req, res) => {

  const {
    username,
    password,
    role
  } = req.body;

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
      message: "Invalid role"
    });
  }

  if (
    username === correctUsername &&
    password === correctPassword
  ) {

    return res.json({
      success: true,
      message: "Login successful",
      role
    });
  }

  res.status(401).json({
    success: false,
    message: "Invalid username or password"
  });

});


// ===============================
// CREATE BOOKING
// ===============================

app.post("/api/bookings", async (req, res) => {

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
          pickupLocation,
          deliveryLocation,
          customerName,
          mobileNumber,
          "Pending"
        ]
      );

    const booking =
      result.rows[0];

    res.status(201).json({

      success: true,

      message:
        "Booking created successfully",

      booking: {

        bookingId:
          booking.booking_id,

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

        createdAt:
          booking.created_at
      }

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

});


// ===============================
// GET ALL BOOKINGS
// ===============================

app.get("/api/bookings", async (req, res) => {

  try {

    const result =
      await pool.query(
        "SELECT * FROM bookings ORDER BY created_at DESC"
      );

    const bookings =
      result.rows.map(
        booking => ({

          bookingId:
            booking.booking_id,

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

          createdAt:
            booking.created_at
        })
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

});


// ===============================
// CUSTOMER BOOKING TRACKING
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
          "SELECT * FROM bookings WHERE booking_id = $1",
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
        result.rows[0];

      res.json({

        success: true,

        booking: {

          bookingId:
            booking.booking_id,

          pickupLocation:
            booking.pickup_location,

          deliveryLocation:
            booking.delivery_location,

          customerName:
            booking.customer_name,

          status:
            booking.status,

          createdAt:
            booking.created_at
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
// UPDATE BOOKING STATUS
// ===============================

app.patch(
  "/api/bookings/:bookingId/status",
  async (req, res) => {

    try {

      const {
        bookingId
      } = req.params;

      const {
        status
      } = req.body;

      const allowedStatuses = [

        "Pending",

        "Assigned",

        "Picked Up",

        "Out for Delivery",

        "Delivered",

        "Cancelled"

      ];

      if (
        !allowedStatuses.includes(status)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid status"
        });
      }

      const result =
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
        result.rows[0];

      res.json({

        success: true,

        message:
          "Booking status updated successfully",

        booking: {

          bookingId:
            booking.booking_id,

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

          createdAt:
            booking.created_at
        }

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
