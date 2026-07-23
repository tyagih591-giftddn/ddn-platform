require("dotenv").config();

const express = require("express");
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
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api", riderRoutes);


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