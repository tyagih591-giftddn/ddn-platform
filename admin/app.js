const API_URL = "https://ddn-platform.onrender.com/api/bookings";

async function loadBookings() {
  const container = document.getElementById("bookingsContainer");

  container.innerHTML = "<p>Loading bookings...</p>";

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("Unable to load bookings");
    }

    const data = await response.json();

    const bookings = data.bookings || [];

    document.getElementById("totalBookings").textContent = bookings.length;

    const pending = bookings.filter(
      booking => booking.status === "Pending"
    ).length;

    const completed = bookings.filter(
      booking => booking.status === "Completed"
    ).length;

    document.getElementById("pendingBookings").textContent = pending;
    document.getElementById("completedBookings").textContent = completed;

    if (bookings.length === 0) {
      container.innerHTML = "<p>No bookings found.</p>";
      return;
    }

    container.innerHTML = bookings.map(booking => `
      <div class="booking">
        <h3>${booking.bookingId}</h3>

        <p><strong>Customer:</strong> ${booking.customerName}</p>

        <p><strong>Mobile:</strong> ${booking.mobileNumber}</p>

        <p><strong>Pickup:</strong> ${booking.pickupLocation}</p>

        <p><strong>Delivery:</strong> ${booking.deliveryLocation}</p>

        <p>
          <strong>Status:</strong>
          <span class="status">${booking.status}</span>
        </p>
      </div>
    `).join("");

  } catch (error) {
    console.error(error);

    container.innerHTML =
      "<p>Unable to connect to DDN backend.</p>";
  }
}

loadBookings();
