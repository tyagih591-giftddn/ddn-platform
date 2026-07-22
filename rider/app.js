const API_URL = "https://ddn-platform.onrender.com/api/bookings";

// ===============================
// RIDER LOGIN
// ===============================

const RIDER_USERNAME = "rider";
const RIDER_PASSWORD = "DDN@2026";

const loginForm = document.getElementById("loginForm");

loginForm.addEventListener("submit", function (e) {
  e.preventDefault();

  const username =
    document.getElementById("riderUsername").value.trim();

  const password =
    document.getElementById("riderPassword").value;

  const loginMessage =
    document.getElementById("loginMessage");

  if (
    username === RIDER_USERNAME &&
    password === RIDER_PASSWORD
  ) {
    localStorage.setItem("ddnRiderLoggedIn", "true");

    showDashboard();
  } else {
    loginMessage.textContent =
      "Invalid username or password.";

    loginMessage.style.color = "red";
  }
});


// ===============================
// SHOW DASHBOARD
// ===============================

function showDashboard() {
  document.getElementById("loginSection").style.display = "none";

  document.getElementById("dashboardSection").style.display = "block";

  loadDeliveries();
}


// ===============================
// LOGOUT
// ===============================

document
  .getElementById("logoutButton")
  .addEventListener("click", function () {

    localStorage.removeItem("ddnRiderLoggedIn");

    document.getElementById("dashboardSection").style.display = "none";

    document.getElementById("loginSection").style.display = "block";

    document.getElementById("loginForm").reset();
  });


// ===============================
// CHECK LOGIN
// ===============================

if (
  localStorage.getItem("ddnRiderLoggedIn") === "true"
) {
  showDashboard();
}


// ===============================
// LOAD DELIVERIES
// ===============================

async function loadDeliveries() {
  const container =
    document.getElementById("deliveriesContainer");

  container.innerHTML =
    "<p>Loading deliveries...</p>";

  try {
    const response =
      await fetch(API_URL);

    if (!response.ok) {
      throw new Error(
        "Unable to load deliveries"
      );
    }

    const data =
      await response.json();

    const bookings =
      data.bookings || [];

    const deliveries =
      bookings.filter(
        booking =>
          booking.status === "Assigned" ||
          booking.status === "Picked Up" ||
          booking.status === "Out for Delivery"
      );

    if (deliveries.length === 0) {

      container.innerHTML =
        "<p>No assigned deliveries found.</p>";

      return;
    }

    container.innerHTML =
      deliveries.map(booking => `

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
          onclick="
            updateStatus(
              '${booking.bookingId}',
              'Picked Up'
            )
          "
        >
          Mark Picked Up
        </button>

        <button
          class="status-button"
          onclick="
            updateStatus(
              '${booking.bookingId}',
              'Out for Delivery'
            )
          "
        >
          Out for Delivery
        </button>

        <button
          class="status-button"
          onclick="
            updateStatus(
              '${booking.bookingId}',
              'Delivered'
            )
          "
        >
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


// ===============================
// UPDATE DELIVERY STATUS
// ===============================

async function updateStatus(
  bookingId,
  newStatus
) {

  try {

    const response =
      await fetch(
        `${API_URL}/${bookingId}/status`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            status: newStatus
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.message ||
        "Status update failed"
      );
    }

    alert(
      "Status updated successfully!"
    );

    loadDeliveries();

  } catch (error) {

    console.error(error);

    alert(
      "Unable to update delivery status."
    );
  }
}
