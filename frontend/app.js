const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

// =====================================
// GPS Location Variables
// =====================================

let pickupLatitude = null;
let pickupLongitude = null;

let deliveryLatitude = null;
let deliveryLongitude = null;

// =====================================
// HTML Elements
// =====================================

const bookingForm =
  document.getElementById("bookingForm");

const bookingResult =
  document.getElementById("bookingResult");

const pickupLocationInput =
  document.getElementById("pickupLocation");

const deliveryLocationInput =
  document.getElementById("deliveryLocation");

const usePickupLocationButton =
  document.getElementById("usePickupLocationButton");

const useDeliveryLocationButton =
  document.getElementById("useDeliveryLocationButton");

const pickupLocationMessage =
  document.getElementById("pickupLocationMessage");

const deliveryLocationMessage =
  document.getElementById("deliveryLocationMessage");

// =====================================
// Get Browser GPS Location
// =====================================

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          "Location service is not supported by this browser."
        )
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },

      (error) => {
        let errorMessage =
          "Unable to get your current location.";

        if (error.code === error.PERMISSION_DENIED) {
          errorMessage =
            "Location permission was denied. Please allow location permission or enter the address manually.";
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          errorMessage =
            "Your current location is unavailable. Please enter the address manually.";
        }

        if (error.code === error.TIMEOUT) {
          errorMessage =
            "Location request timed out. Please try again or enter the address manually.";
        }

        reject(new Error(errorMessage));
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

// =====================================
// Pickup Current Location
// =====================================

usePickupLocationButton.addEventListener(
  "click",
  async function () {
    const originalButtonText =
      usePickupLocationButton.textContent;

    usePickupLocationButton.disabled = true;
    usePickupLocationButton.textContent =
      "Getting pickup location...";

    pickupLocationMessage.textContent =
      "Please allow location permission.";

    try {
      const location = await getCurrentLocation();

      pickupLatitude = location.latitude;
      pickupLongitude = location.longitude;

      pickupLocationMessage.textContent =
        "✅ Pickup GPS location captured. Please check or enter the complete pickup address.";

      /*
        The manual address remains editable.

        When reverse-geocoding is added later,
        the complete address can automatically
        be filled in this input.
      */

      if (!pickupLocationInput.value.trim()) {
        pickupLocationInput.focus();
      }
    } catch (error) {
      console.error(error);

      pickupLatitude = null;
      pickupLongitude = null;

      pickupLocationMessage.textContent =
        `❌ ${error.message}`;
    } finally {
      usePickupLocationButton.disabled = false;
      usePickupLocationButton.textContent =
        originalButtonText;
    }
  }
);

// =====================================
// Drop Current Location
// =====================================

useDeliveryLocationButton.addEventListener(
  "click",
  async function () {
    const originalButtonText =
      useDeliveryLocationButton.textContent;

    useDeliveryLocationButton.disabled = true;
    useDeliveryLocationButton.textContent =
      "Getting drop location...";

    deliveryLocationMessage.textContent =
      "Please allow location permission.";

    try {
      const location = await getCurrentLocation();

      deliveryLatitude = location.latitude;
      deliveryLongitude = location.longitude;

      deliveryLocationMessage.textContent =
        "✅ Drop GPS location captured. Please check or enter the complete delivery address.";

      /*
        The manual address remains editable.

        When reverse-geocoding is added later,
        the complete address can automatically
        be filled in this input.
      */

      if (!deliveryLocationInput.value.trim()) {
        deliveryLocationInput.focus();
      }
    } catch (error) {
      console.error(error);

      deliveryLatitude = null;
      deliveryLongitude = null;

      deliveryLocationMessage.textContent =
        `❌ ${error.message}`;
    } finally {
      useDeliveryLocationButton.disabled = false;
      useDeliveryLocationButton.textContent =
        originalButtonText;
    }
  }
);

// =====================================
// Clear GPS When Address Is Changed
// =====================================

pickupLocationInput.addEventListener(
  "input",
  function () {
    if (
      pickupLatitude !== null &&
      pickupLongitude !== null
    ) {
      pickupLocationMessage.textContent =
        "✅ Pickup GPS captured. Address can still be edited.";
    }
  }
);

deliveryLocationInput.addEventListener(
  "input",
  function () {
    if (
      deliveryLatitude !== null &&
      deliveryLongitude !== null
    ) {
      deliveryLocationMessage.textContent =
        "✅ Drop GPS captured. Address can still be edited.";
    }
  }
);

// =====================================
// Create Booking
// =====================================

bookingForm.addEventListener(
  "submit",
  async function (e) {
    e.preventDefault();

    const formData =
      new FormData(bookingForm);

    const bookingData = {
      customerName:
        formData.get("customerName")?.trim(),

      mobileNumber:
        formData.get("mobileNumber")?.trim(),

      pickupLocation:
        formData.get("pickupLocation")?.trim(),

      deliveryLocation:
        formData.get("deliveryLocation")?.trim(),

      pinCode:
        formData.get("pinCode")?.trim(),

      pickupLatitude,
      pickupLongitude,

      deliveryLatitude,
      deliveryLongitude
    };

    bookingResult.innerHTML =
      "<p>Creating booking...</p>";

    try {
      const response = await fetch(API_URL, {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(bookingData)
      });

      const data = await response.json();

      if (response.ok && data.success) {
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

        pickupLatitude = null;
        pickupLongitude = null;

        deliveryLatitude = null;
        deliveryLongitude = null;

        pickupLocationMessage.textContent = "";
        deliveryLocationMessage.textContent = "";
      } else {
        bookingResult.innerHTML = `
          <p>
            ${data.message || "Booking failed"}
          </p>
        `;
      }
    } catch (error) {
      console.error(error);

      bookingResult.innerHTML =
        "<p>Unable to connect to DDN server. Please try again.</p>";
    }
  }
);

// =====================================
// Track Booking Status
// =====================================

const trackingForm =
  document.getElementById("trackingForm");

trackingForm.addEventListener(
  "submit",
  async function (e) {
    e.preventDefault();

    const bookingId =
      document
        .getElementById("trackingBookingId")
        .value
        .trim();

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
        trackingResult.innerHTML = `
          <p>
            ${data.message || "Booking not found"}
          </p>
        `;

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

          ${
            booking.pinCode
              ? `
                <p>
                  <strong>PIN Code:</strong>
                  ${booking.pinCode}
                </p>
              `
              : ""
          }

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
  }
);