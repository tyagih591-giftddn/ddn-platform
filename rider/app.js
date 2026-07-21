const API_URL = "https://ddn-platform.onrender.com/api/bookings";

async function loadDeliveries() {
  const container = document.getElementById("deliveriesContainer");

  container.innerHTML = "<p>Loading deliveries...</p>";

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("Unable to load deliveries");
    }

    const data = await response.json();

    const bookings = data.bookings || [];

    const deliveries = bookings.filter(
      booking =>
        booking.status === "Assigned" ||
        booking.status === "Picked Up" ||
        booking.status === "Out for Delivery"
    );

    if (deliveries.length === 0) {
      container.innerHTML = "<p>No assigned deliveries found.</p>";
      return;
    }

    container.innerHTML = deliveries.map(booking => `
      <div class="delivery">

        <h3>${booking.bookingId}</h3>

        <p>
          <strong>Customer:</strong>
          ${booking.customerName}
        </p>

        <p>
          <strong>Mobile:</strong>
          ${booking.mobileNumber}
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
          <strong>Status:</strong>
          <span class="status">
            ${booking.status}
          </span>
        </p>

        <button
          class="status-button"
          onclick="updateStatus('${booking.bookingId}', 'Picked Up')">
          Mark Picked Up
        </button>

        <button
          class="status-button"
          onclick="updateStatus('${booking.bookingId}', 'Out for Delivery')">
          Out for Delivery
        </button>

        <button
          class="status-button"
          onclick="updateStatus('${booking.bookingId}', 'Delivered')">
          Mark Delivered
        </button>

      </div>
    `).join("");

  } catch (error) {
    console.error(error);

    container.innerHTML =
      "<p>Unable to connect to DDN backend.</p>";
  }
}


async function updateStatus(bookingId, newStatus) {

  try {

    const response = await fetch(
      `${API_URL}/${bookingId}/status`,
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          status: newStatus
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Status update failed");
    }

    alert("Status updated successfully!");

    loadDeliveries();

  } catch (error) {

    console.error(error);

    alert("Unable to update delivery status.");

  }

}


loadDeliveries();
