const API_URL = "https://ddn-platform.onrender.com/api/bookings";

// ===============================
// Create Booking
// ===============================

const bookingForm = document.getElementById("bookingForm");

bookingForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const formData = new FormData(bookingForm);

  const bookingData = {
    pickupLocation: formData.get("pickupLocation"),
    deliveryLocation: formData.get("deliveryLocation"),
    customerName: formData.get("customerName"),
    mobileNumber: formData.get("mobileNumber")
  };

  const bookingResult = document.getElementById("bookingResult");

  bookingResult.innerHTML = "<p>Creating booking...</p>";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bookingData)
    });

    const data = await response.json();

    if (data.success) {
      bookingResult.innerHTML = `
        <p>
          <strong>Booking successful!</strong>
        </p>

        <p>
          Your Booking ID:
          <strong>${data.booking.bookingId}</strong>
        </p>

        <p>
          Please save this Booking ID to track your delivery.
        </p>
      `;

      bookingForm.reset();

    } else {
      bookingResult.innerHTML =
        `<p>${data.message || "Booking failed"}</p>`;
    }

  } catch (error) {
    console.error(error);

    bookingResult.innerHTML =
      "<p>Unable to connect to DDN server. Please try again.</p>";
  }
});


// ===============================
// Track Booking Status
// ===============================

const trackingForm = document.getElementById("trackingForm");

trackingForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const bookingId =
    document.getElementById("trackingBookingId").value.trim();

  const trackingResult =
    document.getElementById("trackingResult");

  if (!bookingId) {
    trackingResult.innerHTML =
      "<p>Please enter your Booking ID.</p>";

    return;
  }

  trackingResult.innerHTML =
    "<p>Checking booking status...</p>";

  try {
    const response = await fetch(
      `${API_URL}/${encodeURIComponent(bookingId)}`
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      trackingResult.innerHTML =
        `<p>${data.message || "Booking not found"}</p>`;

      return;
    }

    const booking = data.booking;

    trackingResult.innerHTML = `
      <div class="tracking-card">
        <h3>Booking Details</h3>

        <p>
          <strong>Booking ID:</strong>
          ${booking.bookingId}
        </p>

        <p>
          <strong>Customer:</strong>
          ${booking.customerName}
        </p>

        <p>
          <strong>Pickup:</strong>
          ${booking.pickupLocation}
        </p>

        <p>
          <strong>Delivery:</strong>
          ${booking.deliveryLocation}
        </p>

        <p>
          <strong>Current Status:</strong>
          <span class="status">
            ${booking.status}
          </span>
        </p>
      </div>
    `;

  } catch (error) {
    console.error(error);

    trackingResult.innerHTML =
      "<p>Unable to connect to DDN server. Please try again.</p>";
  }
});
