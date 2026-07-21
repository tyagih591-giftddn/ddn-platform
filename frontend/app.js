const API_URL = "https://ddn-platform.onrender.com/api/bookings";

document.querySelector("form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);

  const bookingData = {
    pickupLocation: formData.get("pickupLocation"),
    deliveryLocation: formData.get("deliveryLocation"),
    customerName: formData.get("customerName"),
    mobileNumber: formData.get("mobileNumber")
  };

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
      alert(
        "Booking successful!\nBooking ID: " +
        data.booking.bookingId
      );

      form.reset();
    } else {
      alert(data.message || "Booking failed");
    }
  } catch (error) {
    console.error(error);
    alert("Unable to connect to DDN server. Please try again.");
  }
});
