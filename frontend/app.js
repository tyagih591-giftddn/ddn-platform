const API_URL =
  "https://ddn-platform.onrender.com/api/bookings";

  const SOCKET_URL =
  "https://ddn-platform.onrender.com";

let customerSocket = null;
let activeTrackingBookingId = null;

let customerTrackingMap = null;
let customerPickupMarker = null;
let customerDeliveryMarker = null;
let customerRiderMarker = null;

let latestCustomerTracking = null;

// ======================================
// LOCATION COORDINATES
// ======================================

let pickupLatitude = null;
let pickupLongitude = null;
let deliveryLatitude = null;
let deliveryLongitude = null;

// ======================================
// GOOGLE MAP VARIABLES
// ======================================

let bookingMap = null;

let pickupMarker = null;
let deliveryMarker = null;

let pickupAutocomplete = null;
let deliveryAutocomplete = null;

let AdvancedMarkerElementClass = null;
let RouteClass = null;
let geocoder = null;

// Route line ko store karne ke liye
let routePolylines = [];

// Purane route request ko ignore karne ke liye
let latestRouteRequestId = 0;

// Booking ke waqt calculated values store hongi
let currentRouteDistanceKm = null;
let currentRouteDurationMinutes = null;
let currentCustomerFare = null;

const DEFAULT_MAP_CENTER = {
  lat: 28.6415,
  lng: 77.3714
};

// ======================================
// HTML ELEMENTS
// ======================================

const bookingForm =
  document.getElementById("bookingForm");

const bookingResult =
  document.getElementById("bookingResult");

const pickupLocationInput =
  document.getElementById("pickupLocation");

const deliveryLocationInput =
  document.getElementById("deliveryLocation");

const usePickupLocationButton =
  document.getElementById(
    "usePickupLocationButton"
  );

const useDeliveryLocationButton =
  document.getElementById(
    "useDeliveryLocationButton"
  );

const pickupLocationMessage =
  document.getElementById(
    "pickupLocationMessage"
  );

const deliveryLocationMessage =
  document.getElementById(
    "deliveryLocationMessage"
  );

const pickupAutocompleteContainer =
  document.getElementById(
    "pickupAutocompleteContainer"
  );

const deliveryAutocompleteContainer =
  document.getElementById(
    "deliveryAutocompleteContainer"
  );

const pinCodeInput =
  bookingForm.querySelector(
    'input[name="pinCode"]'
  );

const fareEstimate =
  document.getElementById("fareEstimate");

const estimatedDistance =
  document.getElementById(
    "estimatedDistance"
  );

const estimatedFare =
  document.getElementById(
    "estimatedFare"
  );

// ======================================
// SECURITY / TEXT HELPERS
// ======================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getLatLngLiteral(location) {
  if (!location) {
    return null;
  }

  const lat =
    typeof location.lat === "function"
      ? location.lat()
      : location.lat;

  const lng =
    typeof location.lng === "function"
      ? location.lng()
      : location.lng;

  if (
    typeof lat !== "number" ||
    typeof lng !== "number"
  ) {
    return null;
  }

  return {
    lat,
    lng
  };
}

function extractPinCode(
  addressComponents = []
) {
  const item =
    addressComponents.find(
      component =>
        component.types?.includes(
          "postal_code"
        )
    );

  return (
    item?.longText ||
    item?.shortText ||
    ""
  );
}

function setAutocompleteValue(
  element,
  value
) {
  if (!element) {
    return;
  }

  try {
    element.value = value;
  } catch (error) {
    console.warn(
      "Could not update autocomplete value:",
      error
    );
  }
}

// ======================================
// CUSTOM MAP MARKERS
// ======================================

function createMarkerContent(
  label,
  backgroundColor
) {
  const element =
    document.createElement("div");

  element.textContent = label;

  Object.assign(
    element.style,
    {
      width: "38px",
      height: "38px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      background: backgroundColor,
      color: "#ffffff",
      fontWeight: "700",
      border: "3px solid #ffffff",
      boxShadow:
        "0 2px 8px rgba(0,0,0,.35)"
    }
  );

  return element;
}

function updatePickupMarker(position) {
  if (
    !bookingMap ||
    !AdvancedMarkerElementClass ||
    !position
  ) {
    return;
  }

  if (!pickupMarker) {
    pickupMarker =
      new AdvancedMarkerElementClass({
        map: bookingMap,
        position,
        title: "Pickup Location",
        content: createMarkerContent(
          "P",
          "#198754"
        )
      });
  } else {
    pickupMarker.position = position;
    pickupMarker.map = bookingMap;
  }

  fitMapToLocations();
}

function updateDeliveryMarker(position) {
  if (
    !bookingMap ||
    !AdvancedMarkerElementClass ||
    !position
  ) {
    return;
  }

  if (!deliveryMarker) {
    deliveryMarker =
      new AdvancedMarkerElementClass({
        map: bookingMap,
        position,
        title: "Delivery Location",
        content: createMarkerContent(
          "D",
          "#dc3545"
        )
      });
  } else {
    deliveryMarker.position = position;
    deliveryMarker.map = bookingMap;
  }

  fitMapToLocations();
}

// ======================================
// MAP VIEW
// ======================================

function fitMapToLocations() {
  if (!bookingMap) {
    return;
  }

  const positions = [];

  if (
    pickupLatitude !== null &&
    pickupLongitude !== null
  ) {
    positions.push({
      lat: pickupLatitude,
      lng: pickupLongitude
    });
  }

  if (
    deliveryLatitude !== null &&
    deliveryLongitude !== null
  ) {
    positions.push({
      lat: deliveryLatitude,
      lng: deliveryLongitude
    });
  }

  if (!positions.length) {
    return;
  }

  if (positions.length === 1) {
    bookingMap.setCenter(
      positions[0]
    );

    bookingMap.setZoom(16);
    return;
  }

  const bounds =
    new google.maps.LatLngBounds();

  positions.forEach(position =>
    bounds.extend(position)
  );

  bookingMap.fitBounds(
    bounds,
    70
  );
}

// ======================================
// ROUTE LINE HELPERS
// ======================================

function clearRoutePolylines() {
  routePolylines.forEach(polyline => {
    try {
      polyline.setMap(null);
    } catch (error) {
      console.warn(
        "Could not remove route line:",
        error
      );
    }
  });

  routePolylines = [];
}

async function displayRouteOnMap(route) {
  clearRoutePolylines();

  if (
    !route ||
    !bookingMap
  ) {
    return;
  }

  try {
    const polylines =
      await route.createPolylines({
        polylineOptions: {
          strokeWeight: 5,
          strokeOpacity: 0.85
        }
      });

    polylines.forEach(polyline => {
      polyline.setMap(bookingMap);
    });

    routePolylines = polylines;

    if (route.viewport) {
      bookingMap.fitBounds(
        route.viewport,
        70
      );
    }
  } catch (error) {
    console.error(
      "Route line could not be displayed:",
      error
    );
  }
}

// ======================================
// CUSTOMER FARE CALCULATION
// ======================================

function calculateCustomerFare(
  distanceKm
) {
  const validDistance =
    Number(distanceKm);

  if (
    !Number.isFinite(validDistance) ||
    validDistance < 0
  ) {
    return null;
  }

  const extraStartedKilometres =
    Math.max(
      0,
      Math.ceil(validDistance - 2)
    );

  return (
    30 +
    extraStartedKilometres * 10
  );
}

// ======================================
// GOOGLE ROAD DISTANCE + ETA
// ======================================

async function updateFareEstimate() {
  if (
    pickupLatitude === null ||
    pickupLongitude === null ||
    deliveryLatitude === null ||
    deliveryLongitude === null
  ) {
    latestRouteRequestId += 1;

    currentRouteDistanceKm = null;
    currentRouteDurationMinutes = null;
    currentCustomerFare = null;

    clearRoutePolylines();

    fareEstimate.hidden = true;
    return;
  }

  if (!RouteClass) {
    console.warn(
      "Google Routes library is not ready."
    );

    fareEstimate.hidden = true;
    return;
  }

  const requestId =
    ++latestRouteRequestId;

  currentRouteDistanceKm = null;
  currentRouteDurationMinutes = null;
  currentCustomerFare = null;

  fareEstimate.hidden = false;

  estimatedDistance.textContent =
    "Calculating road distance...";

  estimatedFare.textContent =
    "Calculating...";

  try {
    const routeRequest = {
      origin: {
        lat: pickupLatitude,
        lng: pickupLongitude
      },

      destination: {
        lat: deliveryLatitude,
        lng: deliveryLongitude
      },

      travelMode: "DRIVING",

      routingPreference:
        "TRAFFIC_AWARE",

      computeAlternativeRoutes: false,

    

      fields: [
        "distanceMeters",
        "durationMillis",
        "path",
        "viewport"
      ]
    };

    const response =
      await RouteClass.computeRoutes(
        routeRequest
      );

    if (
      requestId !==
      latestRouteRequestId
    ) {
      return;
    }

    const route =
      response.routes?.[0];

    if (!route) {
      throw new Error(
        "Google did not return a road route."
      );
    }

    const distanceMeters =
      Number(route.distanceMeters);

    const durationMillis =
      Number(route.durationMillis);

    if (
      !Number.isFinite(
        distanceMeters
      ) ||
      distanceMeters <= 0
    ) {
      throw new Error(
        "Valid road distance was not received."
      );
    }

    const distanceKm =
      Number(
        (
          distanceMeters / 1000
        ).toFixed(2)
      );

    const durationMinutes =
      Number.isFinite(
        durationMillis
      )
        ? Math.max(
            1,
            Math.ceil(
              durationMillis /
                60000
            )
          )
        : null;

    const customerFare =
      calculateCustomerFare(
        distanceKm
      );

    currentRouteDistanceKm =
      distanceKm;

    currentRouteDurationMinutes =
      durationMinutes;

    currentCustomerFare =
      customerFare;

    estimatedDistance.textContent =
      durationMinutes
        ? `${distanceKm} km • Approx. ${durationMinutes} min`
        : `${distanceKm} km`;

    estimatedFare.textContent =
      `₹${customerFare}`;

    fareEstimate.hidden = false;

    await displayRouteOnMap(
      route
    );
  } catch (error) {
    if (
      requestId !==
      latestRouteRequestId
    ) {
      return;
    }

    console.error(
      "Google road distance failed:",
      error
    );

    currentRouteDistanceKm = null;
    currentRouteDurationMinutes = null;
    currentCustomerFare = null;

    clearRoutePolylines();

    estimatedDistance.textContent =
      "Road distance unavailable";

    estimatedFare.textContent =
      "Please try again";

    fareEstimate.hidden = false;
  }
}

// ======================================
// CLEAR BOOKING MAP
// ======================================

function clearMapLocations() {
  latestRouteRequestId += 1;

  pickupLatitude = null;
  pickupLongitude = null;
  deliveryLatitude = null;
  deliveryLongitude = null;

  currentRouteDistanceKm = null;
  currentRouteDurationMinutes = null;
  currentCustomerFare = null;

  clearRoutePolylines();

  if (pickupMarker) {
    pickupMarker.map = null;
    pickupMarker = null;
  }

  if (deliveryMarker) {
    deliveryMarker.map = null;
    deliveryMarker = null;
  }

  if (bookingMap) {
    bookingMap.setCenter(
      DEFAULT_MAP_CENTER
    );

    bookingMap.setZoom(13);
  }

  pickupLocationInput.value = "";
  deliveryLocationInput.value = "";

  setAutocompleteValue(
    pickupAutocomplete,
    ""
  );

  setAutocompleteValue(
    deliveryAutocomplete,
    ""
  );

  pickupLocationMessage.textContent = "";
  deliveryLocationMessage.textContent = "";

  estimatedDistance.textContent = "--";
  estimatedFare.textContent = "--";
  fareEstimate.hidden = true;
}
// ======================================
// INITIALIZE GOOGLE MAPS
// ======================================

async function initializeGoogleMaps() {
  try {
    if (!window.google?.maps?.importLibrary) {
      throw new Error(
        "Google Maps loader is not available."
      );
    }

    const [
      mapsLibrary,
      markerLibrary,
      placesLibrary,
      geocodingLibrary,
      routesLibrary
    ] = await Promise.all([
      google.maps.importLibrary("maps"),
      google.maps.importLibrary("marker"),
      google.maps.importLibrary("places"),
      google.maps.importLibrary("geocoding"),
      google.maps.importLibrary("routes")
    ]);

    const { Map } =
      mapsLibrary;

    const { AdvancedMarkerElement } =
      markerLibrary;

    const { PlaceAutocompleteElement } =
      placesLibrary;

    const { Geocoder } =
      geocodingLibrary;

    const { Route } =
      routesLibrary;

    AdvancedMarkerElementClass =
      AdvancedMarkerElement;

    RouteClass =
      Route;

    geocoder =
      new Geocoder();

    bookingMap =
      new Map(
        document.getElementById(
          "bookingMap"
        ),
        {
          center:
            DEFAULT_MAP_CENTER,

          zoom: 13,

          mapId:
            "DEMO_MAP_ID",

          mapTypeControl:
            false,

          streetViewControl:
            false,

          fullscreenControl:
            true
        }
      );

    // ==================================
    // PICKUP AUTOCOMPLETE
    // ==================================

    pickupAutocomplete =
      new PlaceAutocompleteElement();

    pickupAutocomplete.placeholder =
      "Search pickup address";

    pickupAutocomplete.includedRegionCodes =
      ["in"];

    pickupAutocomplete.locationBias = {
      center:
        DEFAULT_MAP_CENTER,

      radius:
        30000
    };

    // ==================================
    // DELIVERY AUTOCOMPLETE
    // ==================================

    deliveryAutocomplete =
      new PlaceAutocompleteElement();

    deliveryAutocomplete.placeholder =
      "Search delivery address";

    deliveryAutocomplete.includedRegionCodes =
      ["in"];

    deliveryAutocomplete.locationBias = {
      center:
        DEFAULT_MAP_CENTER,

      radius:
        30000
    };

    pickupAutocompleteContainer.appendChild(
      pickupAutocomplete
    );

    deliveryAutocompleteContainer.appendChild(
      deliveryAutocomplete
    );

    pickupAutocomplete.addEventListener(
      "gmp-select",
      async event => {
        await handlePlaceSelection(
          event,
          "pickup"
        );
      }
    );

    deliveryAutocomplete.addEventListener(
      "gmp-select",
      async event => {
        await handlePlaceSelection(
          event,
          "delivery"
        );
      }
    );

    console.log(
      "Google Maps, Places, Geocoder and Routes loaded successfully."
    );
  } catch (error) {
    console.error(
      "Google Maps initialization failed:",
      error
    );

    const mapElement =
      document.getElementById(
        "bookingMap"
      );

    if (mapElement) {
      mapElement.innerHTML = `
        <div
          style="
            padding:20px;
            text-align:center;
            line-height:1.5;
          "
        >
          Google Map load nahi hua.
          API key restrictions, billing aur enabled APIs check karein.
        </div>
      `;
    }

    pickupLocationMessage.textContent =
      "❌ Google address search load nahi hua.";

    deliveryLocationMessage.textContent =
      "❌ Google address search load nahi hua.";
  }
}

// ======================================
// PLACE SELECTION
// ======================================

async function handlePlaceSelection(
  event,
  locationType
) {
  try {
    const placePrediction =
      event.placePrediction;

    if (!placePrediction) {
      throw new Error(
        "No place prediction received."
      );
    }

    const place =
      placePrediction.toPlace();

    await place.fetchFields({
      fields: [
        "displayName",
        "formattedAddress",
        "location",
        "viewport",
        "addressComponents"
      ]
    });

    const position =
      getLatLngLiteral(
        place.location
      );

    if (!position) {
      throw new Error(
        "Selected address has no map location."
      );
    }

    const address =
      place.formattedAddress ||
      place.displayName ||
      "";

    const detectedPinCode =
      extractPinCode(
        place.addressComponents
      );

    if (
      detectedPinCode &&
      pinCodeInput &&
      !pinCodeInput.value.trim()
    ) {
      pinCodeInput.value =
        detectedPinCode;
    }

    if (
      locationType ===
      "pickup"
    ) {
      pickupLatitude =
        position.lat;

      pickupLongitude =
        position.lng;

      pickupLocationInput.value =
        address;

      pickupLocationMessage.textContent =
        "✅ Pickup address and map location selected.";

      updatePickupMarker(
        position
      );
    } else {
      deliveryLatitude =
        position.lat;

      deliveryLongitude =
        position.lng;

      deliveryLocationInput.value =
        address;

      deliveryLocationMessage.textContent =
        "✅ Delivery address and map location selected.";

      updateDeliveryMarker(
        position
      );
    }

    if (
      place.viewport &&
      bookingMap
    ) {
      bookingMap.fitBounds(
        place.viewport
      );
    } else if (bookingMap) {
      bookingMap.setCenter(
        position
      );

      bookingMap.setZoom(
        16
      );
    }

    window.setTimeout(
      fitMapToLocations,
      250
    );

    await updateFareEstimate();
  } catch (error) {
    console.error(
      "Place selection failed:",
      error
    );

    const message =
      "❌ Address select nahi hua. Dobara try karein.";

    if (
      locationType ===
      "pickup"
    ) {
      pickupLocationMessage.textContent =
        message;
    } else {
      deliveryLocationMessage.textContent =
        message;
    }
  }
}

// ======================================
// BROWSER CURRENT LOCATION
// ======================================

function getCurrentLocation() {
  return new Promise(
    (resolve, reject) => {
      if (
        !navigator.geolocation
      ) {
        reject(
          new Error(
            "Location service is not supported by this browser."
          )
        );

        return;
      }

      navigator.geolocation.getCurrentPosition(
        position => {
          resolve({
            latitude:
              position.coords.latitude,

            longitude:
              position.coords.longitude,

            accuracy:
              position.coords.accuracy
          });
        },

        error => {
          let message =
            "Unable to get your current location.";

          if (
            error.code ===
            error.PERMISSION_DENIED
          ) {
            message =
              "Location permission denied. Browser settings me location allow karein.";
          }

          if (
            error.code ===
            error.POSITION_UNAVAILABLE
          ) {
            message =
              "Current location unavailable. Address search use karein.";
          }

          if (
            error.code ===
            error.TIMEOUT
          ) {
            message =
              "Location request timed out. Dobara try karein.";
          }

          reject(
            new Error(message)
          );
        },

        {
          enableHighAccuracy:
            true,

          timeout:
            15000,

          maximumAge:
            0
        }
      );
    }
  );
}

// ======================================
// REVERSE GEOCODING
// ======================================

async function reverseGeocodeLocation(
  latitude,
  longitude
) {
  if (!geocoder) {
    throw new Error(
      "Google Geocoder is not ready."
    );
  }

  const response =
    await geocoder.geocode({
      location: {
        lat:
          latitude,

        lng:
          longitude
      }
    });

  const result =
    response.results?.[0];

  if (!result) {
    throw new Error(
      "Address not found for this GPS location."
    );
  }

  const pinCodeComponent =
    result.address_components?.find(
      component =>
        component.types?.includes(
          "postal_code"
        )
    );

  return {
    address:
      result.formatted_address,

    pinCode:
      pinCodeComponent?.long_name ||
      ""
  };
}

// ======================================
// CURRENT PICKUP LOCATION BUTTON
// ======================================

usePickupLocationButton.addEventListener(
  "click",
  async function () {
    const originalText =
      usePickupLocationButton.textContent;

    usePickupLocationButton.disabled =
      true;

    usePickupLocationButton.textContent =
      "Getting pickup location...";

    pickupLocationMessage.textContent =
      "Please allow location permission.";

    try {
      const location =
        await getCurrentLocation();

      const result =
        await reverseGeocodeLocation(
          location.latitude,
          location.longitude
        );

      pickupLatitude =
        location.latitude;

      pickupLongitude =
        location.longitude;

      pickupLocationInput.value =
        result.address;

      setAutocompleteValue(
        pickupAutocomplete,
        result.address
      );

      if (
        result.pinCode &&
        pinCodeInput &&
        !pinCodeInput.value.trim()
      ) {
        pinCodeInput.value =
          result.pinCode;
      }

      updatePickupMarker({
        lat:
          pickupLatitude,

        lng:
          pickupLongitude
      });

      pickupLocationMessage.textContent =
        "✅ Current pickup location and address captured.";

      await updateFareEstimate();
    } catch (error) {
      console.error(
        "Pickup current location failed:",
        error
      );

      pickupLatitude =
        null;

      pickupLongitude =
        null;

      pickupLocationInput.value =
        "";

      pickupLocationMessage.textContent =
        `❌ ${error.message}`;

      await updateFareEstimate();
    } finally {
      usePickupLocationButton.disabled =
        false;

      usePickupLocationButton.textContent =
        originalText;
    }
  }
);

// ======================================
// CURRENT DELIVERY LOCATION BUTTON
// ======================================

useDeliveryLocationButton.addEventListener(
  "click",
  async function () {
    const originalText =
      useDeliveryLocationButton.textContent;

    useDeliveryLocationButton.disabled =
      true;

    useDeliveryLocationButton.textContent =
      "Getting drop location...";

    deliveryLocationMessage.textContent =
      "Please allow location permission.";

    try {
      const location =
        await getCurrentLocation();

      const result =
        await reverseGeocodeLocation(
          location.latitude,
          location.longitude
        );

      deliveryLatitude =
        location.latitude;

      deliveryLongitude =
        location.longitude;

      deliveryLocationInput.value =
        result.address;

      setAutocompleteValue(
        deliveryAutocomplete,
        result.address
      );

      if (
        result.pinCode &&
        pinCodeInput &&
        !pinCodeInput.value.trim()
      ) {
        pinCodeInput.value =
          result.pinCode;
      }

      updateDeliveryMarker({
        lat:
          deliveryLatitude,

        lng:
          deliveryLongitude
      });

      deliveryLocationMessage.textContent =
        "✅ Current delivery location and address captured.";

      await updateFareEstimate();
    } catch (error) {
      console.error(
        "Delivery current location failed:",
        error
      );

      deliveryLatitude =
        null;

      deliveryLongitude =
        null;

      deliveryLocationInput.value =
        "";

      deliveryLocationMessage.textContent =
        `❌ ${error.message}`;

      await updateFareEstimate();
    } finally {
      useDeliveryLocationButton.disabled =
        false;

      useDeliveryLocationButton.textContent =
        originalText;
    }
  }
);

// ======================================
// BOOKING FORM SUBMIT
// ======================================

bookingForm.addEventListener(
  "submit",
  async function (event) {
    event.preventDefault();

    const submitButton =
      bookingForm.querySelector(
        'button[type="submit"]'
      );

    const originalButtonText =
      submitButton?.textContent ||
      "Book Delivery";

    const formData =
      new FormData(bookingForm);

    // Submit se pehle ensure karenge ki
    // latest road distance calculate ho chuki hai.
    if (
      pickupLatitude !== null &&
      pickupLongitude !== null &&
      deliveryLatitude !== null &&
      deliveryLongitude !== null &&
      (
        currentRouteDistanceKm === null ||
        currentCustomerFare === null
      )
    ) {
      bookingResult.innerHTML =
        "<p>Calculating road distance and delivery charge...</p>";

      await updateFareEstimate();
    }

    const bookingData = {
      customerName:
        formData
          .get("customerName")
          ?.trim(),

      mobileNumber:
        formData
          .get("mobileNumber")
          ?.trim(),

      pickupLocation:
        pickupLocationInput
          .value
          .trim(),

      deliveryLocation:
        deliveryLocationInput
          .value
          .trim(),

      pinCode:
        formData
          .get("pinCode")
          ?.trim(),

      pickupLatitude,
      pickupLongitude,
      deliveryLatitude,
      deliveryLongitude,

      // Google actual road-route values
      deliveryDistanceKm:
        currentRouteDistanceKm,

      routeDurationMinutes:
        currentRouteDurationMinutes,

      customerFare:
        currentCustomerFare
    };

    // ==================================
    // CUSTOMER DETAILS VALIDATION
    // ==================================

    if (!bookingData.customerName) {
      bookingResult.innerHTML =
        "<p>Please enter customer name.</p>";

      return;
    }

    if (
      !/^[0-9]{10}$/.test(
        bookingData.mobileNumber || ""
      )
    ) {
      bookingResult.innerHTML =
        "<p>Please enter a valid 10-digit mobile number.</p>";

      return;
    }

    // ==================================
    // PICKUP VALIDATION
    // ==================================

    if (
      !bookingData.pickupLocation ||
      pickupLatitude === null ||
      pickupLongitude === null
    ) {
      bookingResult.innerHTML =
        "<p>Please search and select a valid pickup address.</p>";

      return;
    }

    // ==================================
    // DELIVERY VALIDATION
    // ==================================

    if (
      !bookingData.deliveryLocation ||
      deliveryLatitude === null ||
      deliveryLongitude === null
    ) {
      bookingResult.innerHTML =
        "<p>Please search and select a valid delivery address.</p>";

      return;
    }

    // ==================================
    // PIN CODE VALIDATION
    // ==================================

    if (
      !/^[0-9]{6}$/.test(
        bookingData.pinCode || ""
      )
    ) {
      bookingResult.innerHTML =
        "<p>Please enter a valid 6-digit PIN code.</p>";

      return;
    }

    // ==================================
    // ROAD DISTANCE VALIDATION
    // ==================================

    if (
      !Number.isFinite(
        bookingData.deliveryDistanceKm
      ) ||
      bookingData.deliveryDistanceKm <= 0 ||
      !Number.isFinite(
        bookingData.customerFare
      )
    ) {
      bookingResult.innerHTML = `
        <p>
          Actual road distance calculate nahi hui.
          Pickup aur delivery address dobara select karke try karein.
        </p>
      `;

      return;
    }

    if (submitButton) {
      submitButton.disabled = true;

      submitButton.textContent =
        "Creating Booking...";
    }

    bookingResult.innerHTML = `
      <p>
        Creating booking for
        <strong>
          ${escapeHtml(
            bookingData.deliveryDistanceKm
          )} km
        </strong>
        at
        <strong>
          ₹${escapeHtml(
            bookingData.customerFare
          )}
        </strong>...
      </p>
    `;

    try {
      const response =
        await fetch(
          API_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify(
                bookingData
              )
          }
        );

      let data = null;

      try {
        data =
          await response.json();
      } catch (jsonError) {
        console.error(
          "Server response was not valid JSON:",
          jsonError
        );
      }

      if (
        response.ok &&
        data?.success
      ) {
        const booking =
          data.booking || {};

        const bookingId =
          escapeHtml(
            booking.bookingId
          );

        const savedDistance =
          booking.deliveryDistanceKm ??
          bookingData.deliveryDistanceKm;

        const savedCustomerFare =
          booking.customerFare ??
          bookingData.customerFare;

        const savedDuration =
          booking.routeDurationMinutes ??
          bookingData.routeDurationMinutes;

        bookingResult.innerHTML = `
          <div class="tracking-card">
            <h3>Booking Successful!</h3>

            <p>
              Your Booking ID:
              <strong>
                ${bookingId}
              </strong>
            </p>

            <p>
              <strong>
                Road Distance:
              </strong>
              ${escapeHtml(
                savedDistance
              )} km
            </p>

            ${
              savedDuration
                ? `
                  <p>
                    <strong>
                      Estimated Travel Time:
                    </strong>
                    ${escapeHtml(
                      savedDuration
                    )} minutes
                  </p>
                `
                : ""
            }

            <p>
              <strong>
                Delivery Charge:
              </strong>
              ₹${escapeHtml(
                savedCustomerFare
              )}
            </p>

            <p>
              Please save this Booking ID
              to track your delivery.
            </p>
          </div>
        `;

        bookingForm.reset();

        clearMapLocations();
      } else {
        bookingResult.innerHTML = `
          <p>
            ${escapeHtml(
              data?.message ||
              `Booking failed. Server returned status ${response.status}.`
            )}
          </p>
        `;
      }
    } catch (error) {
      console.error(
        "Booking request failed:",
        error
      );

      bookingResult.innerHTML = `
        <p>
          Unable to connect to DDN server.
          Please try again.
        </p>
      `;
    } finally {
      if (submitButton) {
        submitButton.disabled =
          false;

        submitButton.textContent =
          originalButtonText;
      }
    }
  }
);

// ======================================
// TRACKING FORM
// ======================================

const trackingForm =
  document.getElementById(
    "trackingForm"
  );

const trackingBookingIdInput =
  document.getElementById(
    "trackingBookingId"
  );

const trackingResult =
  document.getElementById(
    "trackingResult"
  );

  // ===============================
// CUSTOMER LIVE TRACKING MAP
// ===============================

async function updateCustomerTrackingMap(
  tracking
) {

  const mapContainer =
    document.getElementById(
      "trackingMap"
    );

  if (!mapContainer) {
    return;
  }

  const pickupLatitude =
    Number(
      tracking.pickupLatitude
    );

  const pickupLongitude =
    Number(
      tracking.pickupLongitude
    );

  const deliveryLatitude =
    Number(
      tracking.deliveryLatitude
    );

  const deliveryLongitude =
    Number(
      tracking.deliveryLongitude
    );

  const riderLatitude =
    Number(
      tracking.riderLatitude
    );

  const riderLongitude =
    Number(
      tracking.riderLongitude
    );

  const hasPickupLocation =
    Number.isFinite(
      pickupLatitude
    ) &&
    Number.isFinite(
      pickupLongitude
    );

  const hasDeliveryLocation =
    Number.isFinite(
      deliveryLatitude
    ) &&
    Number.isFinite(
      deliveryLongitude
    );

  const hasRiderLocation =
    tracking.riderLocationAvailable &&
    Number.isFinite(
      riderLatitude
    ) &&
    Number.isFinite(
      riderLongitude
    );

  if (
    !hasPickupLocation &&
    !hasDeliveryLocation &&
    !hasRiderLocation
  ) {

    mapContainer.style.display =
      "none";

    return;
  }

  try {

    const {
      Map
    } =
      await google.maps.importLibrary(
        "maps"
      );

    const {
      AdvancedMarkerElement
    } =
      await google.maps.importLibrary(
        "marker"
      );

    const initialPosition =
      hasRiderLocation
        ? {
            lat:
              riderLatitude,

            lng:
              riderLongitude
          }
        : hasPickupLocation
          ? {
              lat:
                pickupLatitude,

              lng:
                pickupLongitude
            }
          : {
              lat:
                deliveryLatitude,

              lng:
                deliveryLongitude
            };

    mapContainer.style.display =
      "block";

    if (!customerTrackingMap) {

      customerTrackingMap =
        new Map(
          mapContainer,
          {
            center:
              initialPosition,

            zoom:
              14,

            mapId:
              "DEMO_MAP_ID",

            disableDefaultUI:
              false,

            streetViewControl:
              false,

            mapTypeControl:
              false,

            fullscreenControl:
              true
          }
        );

    }

    if (
      hasPickupLocation &&
      !customerPickupMarker
    ) {

      customerPickupMarker =
        new AdvancedMarkerElement({
          map:
            customerTrackingMap,

          position: {
            lat:
              pickupLatitude,

            lng:
              pickupLongitude
          },

          title:
            "Pickup Location"
        });

    }

    if (
      hasDeliveryLocation &&
      !customerDeliveryMarker
    ) {

      customerDeliveryMarker =
        new AdvancedMarkerElement({
          map:
            customerTrackingMap,

          position: {
            lat:
              deliveryLatitude,

            lng:
              deliveryLongitude
          },

          title:
            "Delivery Location"
        });

    }

    if (hasRiderLocation) {

      if (!customerRiderMarker) {

        customerRiderMarker =
          new AdvancedMarkerElement({
            map:
              customerTrackingMap,

            position: {
              lat:
                riderLatitude,

              lng:
                riderLongitude
            },

            title:
              tracking.riderName ||
              "DDN Rider"
          });

      } else {

        customerRiderMarker.position = {
          lat:
            riderLatitude,

          lng:
            riderLongitude
        };

      }

    } else if (
      customerRiderMarker
    ) {

      customerRiderMarker.map =
        null;

      customerRiderMarker =
        null;

    }

    const bounds =
      new google.maps.LatLngBounds();

    if (hasPickupLocation) {

      bounds.extend({
        lat:
          pickupLatitude,

        lng:
          pickupLongitude
      });

    }

    if (hasDeliveryLocation) {

      bounds.extend({
        lat:
          deliveryLatitude,

        lng:
          deliveryLongitude
      });

    }

    if (hasRiderLocation) {

      bounds.extend({
        lat:
          riderLatitude,

        lng:
          riderLongitude
      });

    }

    customerTrackingMap.fitBounds(
      bounds
    );

    google.maps.event.addListenerOnce(
      customerTrackingMap,
      "idle",
      () => {

        if (
          customerTrackingMap.getZoom() >
          16
        ) {

          customerTrackingMap.setZoom(
            16
          );

        }

      }
    );

  } catch (error) {

    console.error(
      "Customer tracking map error:",
      error
    );

    mapContainer.style.display =
      "none";

  }

}

  // ===============================
// CUSTOMER REALTIME SOCKET
// ===============================

function connectCustomerSocket() {

  if (
    customerSocket &&
    customerSocket.connected
  ) {
    return;
  }

  if (typeof io === "undefined") {

    console.error(
      "Socket.IO client is not loaded"
    );

    return;

  }

  customerSocket =
    io(SOCKET_URL, {

      transports: [
        "websocket",
        "polling"
      ]

    });

  customerSocket.on(
    "connect",
    () => {

      console.log(
        "Customer socket connected:",
        customerSocket.id
      );

    }
  );

  customerSocket.on(
    "booking-status-updated",
    booking => {

      if (
        !activeTrackingBookingId
      ) {
        return;
      }

      if (
        booking.bookingId !==
        activeTrackingBookingId
      ) {
        return;
      }

      console.log(
        "Realtime booking update:",
        booking
      );

      trackingForm.dispatchEvent(
        new Event("submit")
      );

    }
  );

  customerSocket.on(
    "rider-location-updated",
    () => {

      if (
        !activeTrackingBookingId
      ) {
        return;
      }

      trackingForm.dispatchEvent(
        new Event("submit")
      );

    }
  );

}

trackingForm.addEventListener(
  "submit",
  async function (event) {
    event.preventDefault();

    const bookingId =
      trackingBookingIdInput
        .value
        .trim();

        activeTrackingBookingId =
  bookingId;

connectCustomerSocket();


    if (!bookingId) {
      trackingResult.innerHTML =
        "<p>Please enter your Booking ID.</p>";

      return;
    }

    const trackingButton =
      trackingForm.querySelector(
        'button[type="submit"]'
      );

    const originalButtonText =
      trackingButton?.textContent ||
      "Track Booking";

    if (trackingButton) {
      trackingButton.disabled =
        true;

      trackingButton.textContent =
        "Checking...";
    }

    trackingResult.innerHTML =
      "<p>Checking booking status...</p>";

    try {
      const response =
        await fetch(
          `${API_URL}/${encodeURIComponent(
  bookingId
)}/tracking`
        );

      let data = null;

      try {
        data =
          await response.json();
      } catch (jsonError) {
        console.error(
          "Tracking response was not valid JSON:",
          jsonError
        );
      }

      if (
        !response.ok ||
        !data?.success
      ) {
        trackingResult.innerHTML = `
          <p>
            ${escapeHtml(
              data?.message ||
              "Booking not found"
            )}
          </p>
        `;

        return;
      }

      const tracking =
  data.tracking || {};

latestCustomerTracking =
  tracking;

await updateCustomerTrackingMap(
  tracking
);

const distance =
  tracking.deliveryDistanceKm;

const customerFare =
  tracking.customerFare;

const createdAt =
  tracking.createdAt
    ? new Date(
        tracking.createdAt
      ).toLocaleString(
        "en-IN"
      )
    : "";

    trackingResult.innerHTML = `
  <div class="tracking-card">

    <h3>
      Live Delivery Tracking
    </h3>

    <p>
      <strong>
        Booking ID:
      </strong>

      ${escapeHtml(
        tracking.bookingId
      )}
    </p>

    <p>
      <strong>
        Pickup:
      </strong>

      ${escapeHtml(
        tracking.pickupLocation
      )}
    </p>

    <p>
      <strong>
        Delivery:
      </strong>

      ${escapeHtml(
        tracking.deliveryLocation
      )}
    </p>

    ${
      distance !== null &&
      distance !== undefined
        ? `
          <p>
            <strong>
              Delivery Distance:
            </strong>

            ${escapeHtml(
              distance
            )} km
          </p>
        `
        : ""
    }

    ${
      tracking.routeDurationMinutes !== null &&
      tracking.routeDurationMinutes !== undefined
        ? `
          <p>
            <strong>
              Estimated Travel Time:
            </strong>

            ${escapeHtml(
              tracking.routeDurationMinutes
            )} minutes
          </p>
        `
        : ""
    }

    ${
      customerFare !== null &&
      customerFare !== undefined
        ? `
          <p>
            <strong>
              Delivery Charge:
            </strong>

            ₹${escapeHtml(
              customerFare
            )}
          </p>
        `
        : ""
    }

    <p>
      <strong>
        Current Status:
      </strong>

      <span class="status">
        ${escapeHtml(
          tracking.status
        )}
      </span>
    </p>

    ${
      tracking.riderAssigned
        ? `
          <p>
            <strong>
              Rider:
            </strong>

            ${escapeHtml(
              tracking.riderName ||
              "Assigned Rider"
            )}
          </p>
        `
        : `
          <p>
            <strong>
              Rider:
            </strong>

            Waiting for rider assignment
          </p>
        `
    }

    ${
      tracking.riderLocationAvailable
        ? `
          <p>
            <strong>
              Live Rider Location:
            </strong>

            ${
              tracking.riderLocationStale
                ? "Location update is temporarily delayed."
                : "Rider location is active."
            }
          </p>

          <p>
            <strong>
              Last Location Update:
            </strong>

            ${
              tracking.lastUpdated
                ? escapeHtml(
                    new Date(
                      tracking.lastUpdated
                    ).toLocaleString(
                      "en-IN"
                    )
                  )
                : "Not available"
            }
          </p>
        `
        : `
          <p>
            <strong>
              Live Rider Location:
            </strong>

            Location will appear after the rider is assigned and online.
          </p>
        `
    }

    ${
      createdAt
        ? `
          <p>
            <strong>
              Booking Time:
            </strong>

            ${escapeHtml(
              createdAt
            )}
          </p>
        `
        : ""
    }

  </div>
`;  

    } catch (error) {
      console.error(
        "Tracking request failed:",
        error
      );

      trackingResult.innerHTML = `
        <p>
          Unable to connect to DDN server.
          Please try again.
        </p>
      `;
    } finally {
      if (trackingButton) {
        trackingButton.disabled =
          false;

        trackingButton.textContent =
          originalButtonText;
      }
    }
  }
);

// ======================================
// PAGE INITIALIZATION
// ======================================

document.addEventListener(
  "DOMContentLoaded",
  async function () {
    fareEstimate.hidden = true;

    estimatedDistance.textContent =
      "--";

    estimatedFare.textContent =
      "--";

    await initializeGoogleMaps();
  }
);