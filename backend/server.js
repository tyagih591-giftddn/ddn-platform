const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const bookings = [];

app.get("/", (req, res) => {
  res.json({
    message: "DDN Backend API is running",
    status: "success"
  });
});

app.post("/api/bookings", (req, res) => {
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
      message: "All booking fields are required"
    });
  }

  const booking = {
    bookingId: "DDN-" + Date.now(),
    pickupLocation,
    deliveryLocation,
    customerName,
    mobileNumber,
    status: "Pending",
    createdAt: new Date().toISOString()
  };

  bookings.push(booking);

  res.status(201).json({
    success: true,
    message: "Booking created successfully",
    booking
  });
});

app.get("/api/bookings", (req, res) => {
  res.json({
    success: true,
    bookings
  });
});

app.listen(PORT, () => {
  console.log(`DDN Backend running on port ${PORT}`);
});
