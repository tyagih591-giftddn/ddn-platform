require("dotenv").config();

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const initializeDatabase =
  require("./config/databaseInit");

const authRoutes =
  require("./routes/auth");

const bookingRoutes =
  require("./routes/bookings");

const riderRoutes =
  require("./routes/riders");

const app = express();

const server =
  http.createServer(app);

const io =
  new Server(server, {
    cors: {
      origin: "*",
      methods: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE"
      ]
    }
  });

app.set("io", io);

const PORT = process.env.PORT || 3000;

// ===============================
// GLOBAL MIDDLEWARE
// ===============================

app.use(cors());

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);

// ===============================
// PUBLIC DELIVERY PROOF FILES
// Rider documents are NOT exposed
// ===============================

app.use(
  "/uploads/pickup-proofs",
  express.static(
    path.join(
      __dirname,
      "uploads",
      "pickup-proofs"
    )
  )
);

app.use(
  "/uploads/delivery-proofs",
  express.static(
    path.join(
      __dirname,
      "uploads",
      "delivery-proofs"
    )
  )
);

// ===============================
// API ROUTES
// ===============================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/bookings",
  bookingRoutes
);

app.use(
  "/api",
  riderRoutes
);

// ===============================
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message:
      "DDN Backend API is running",
    status: "success",
    security: "JWT enabled",
    features: {
      riderManagement: true,
      bookingManagement: true,
      deliveryProofs: true
    }
  });
});

// ===============================
// API NOT FOUND
// ===============================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "API route not found"
  });
});

// ===============================
// GLOBAL ERROR HANDLER
// ===============================

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Internal server error"
    });
  }
);

// ===============================
// START SERVER
// ===============================

async function startServer() {
  try {
    if (
      !process.env.DATABASE_URL
    ) {
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

    server.listen(PORT, () => {
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