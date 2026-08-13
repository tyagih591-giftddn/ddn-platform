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
// CUSTOMER MOBILE SESSION
// ======================================

const CUSTOMER_SESSION_KEY =
  "ddn_customer_session_v1";

const customerEntrySection =
  document.getElementById(
    "customerEntrySection"
  );

  const customerApp =
  document.getElementById(
    "customerApp"
  );

const customerEntryForm =
  document.getElementById(
    "customerEntryForm"
  );

const customerEntryName =
  document.getElementById(
    "customerEntryName"
  );

const customerEntryMobile =
  document.getElementById(
    "customerEntryMobile"
  );

const customerEntryMessage =
  document.getElementById(
    "customerEntryMessage"
  );

function getCustomerSession() {
  try {
    const savedSession =
      localStorage.getItem(
        CUSTOMER_SESSION_KEY
      );

    if (!savedSession) {
      return null;
    }

    const session =
      JSON.parse(savedSession);

    const customerName =
      String(
        session?.customerName || ""
      ).trim();

    const mobileNumber =
      String(
        session?.mobileNumber || ""
      ).trim();

    if (
      !customerName ||
      !/^[0-9]{10}$/.test(
        mobileNumber
      )
    ) {
      localStorage.removeItem(
        CUSTOMER_SESSION_KEY
      );

      return null;
    }

    return {
      customerName,
      mobileNumber
    };
  } catch (error) {
    console.error(
      "Customer session could not be read:",
      error
    );

    localStorage.removeItem(
      CUSTOMER_SESSION_KEY
    );

    return null;
  }
}

function saveCustomerSession(
  customerName,
  mobileNumber
) {
  const session = {
    customerName:
      String(customerName).trim(),

    mobileNumber:
      String(mobileNumber).trim(),

    createdAt:
      new Date().toISOString(),

    // Future backend OTP integration
    otpVerified:
      false,

    sessionVersion:
      1
  };

  localStorage.setItem(
    CUSTOMER_SESSION_KEY,
    JSON.stringify(session)
  );

  return session;
}

function fillBookingCustomerDetails(
  session
) {
  if (!session) {
    return;
  }

  const customerNameInput =
    document.querySelector(
      '#bookingForm input[name="customerName"]'
    );

  const mobileNumberInput =
    document.querySelector(
      '#bookingForm input[name="mobileNumber"]'
    );

  if (customerNameInput) {
    customerNameInput.value =
      session.customerName;
  }

  if (mobileNumberInput) {
    mobileNumberInput.value =
      session.mobileNumber;
  }
}

function showCustomerPanel(
  session
) {
  if (customerEntrySection) {
    customerEntrySection.style.display =
      "none";
  }

  if (customerApp) {
    customerApp.style.display =
      "";
  }

  fillBookingCustomerDetails(
    session
  );
}

function showCustomerEntry() {
  if (customerApp) {
    customerApp.style.display =
      "none";
  }

  if (customerEntrySection) {
    customerEntrySection.style.display =
      "flex";
  }
}

function initializeCustomerSession() {
  const session =
    getCustomerSession();

  if (session) {
    showCustomerPanel(
      session
    );

    return;
  }

  showCustomerEntry();
}

customerEntryForm?.addEventListener(
  "submit",
  function (event) {
    event.preventDefault();

    const customerName =
      String(
        customerEntryName?.value || ""
      ).trim();

    const mobileNumber =
      String(
        customerEntryMobile?.value || ""
      )
        .replace(/\D/g, "")
        .trim();

    if (!customerName) {
      customerEntryMessage.textContent =
        "Please enter your name.";

      customerEntryName?.focus();
      return;
    }

    if (
      !/^[0-9]{10}$/.test(
        mobileNumber
      )
    ) {
      customerEntryMessage.textContent =
        "Please enter a valid 10-digit mobile number.";

      customerEntryMobile?.focus();
      return;
    }

    try {
      const session =
        saveCustomerSession(
          customerName,
          mobileNumber
        );

      customerEntryMessage.textContent =
        "";

      showCustomerPanel(
        session
      );
    } catch (error) {
      console.error(
        "Customer session could not be saved:",
        error
      );

      customerEntryMessage.textContent =
        "Unable to save your details. Please try again.";
    }
  }
);

initializeCustomerSession();

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
    40 +
    extraStartedKilometres * 10
  );
}

// ======================================
// SHARED GOOGLE ROUTE METRICS
// ======================================

async function calculateRouteMetrics(
  origin,
  destination
) {

  if (!RouteClass) {
    throw new Error(
      "Google Routes library is not ready."
    );
  }

  const originLatitude =
    Number(origin?.lat);

  const originLongitude =
    Number(origin?.lng);

  const destinationLatitude =
    Number(destination?.lat);

  const destinationLongitude =
    Number(destination?.lng);

  const validOrigin =
    Number.isFinite(originLatitude) &&
    Number.isFinite(originLongitude) &&
    originLatitude >= -90 &&
    originLatitude <= 90 &&
    originLongitude >= -180 &&
    originLongitude <= 180;

  const validDestination =
    Number.isFinite(destinationLatitude) &&
    Number.isFinite(destinationLongitude) &&
    destinationLatitude >= -90 &&
    destinationLatitude <= 90 &&
    destinationLongitude >= -180 &&
    destinationLongitude <= 180;

  if (
    !validOrigin ||
    !validDestination
  ) {
    throw new Error(
      "Valid route coordinates are required."
    );
  }

  const response =
    await RouteClass.computeRoutes({
      origin: {
        lat:
          originLatitude,

        lng:
          originLongitude
      },

      destination: {
        lat:
          destinationLatitude,

        lng:
          destinationLongitude
      },

      travelMode:
        "DRIVING",

      routingPreference:
        "TRAFFIC_AWARE",

      computeAlternativeRoutes:
        false,

      fields: [
        "distanceMeters",
        "durationMillis",
        "path",
        "viewport"
      ]
    });

  const route =
    response.routes?.[0];

  if (!route) {
    throw new Error(
      "Google did not return a road route."
    );
  }

  const distanceMeters =
    Number(
      route.distanceMeters
    );

  const durationMillis =
    Number(
      route.durationMillis
    );

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
            durationMillis / 60000
          )
        )
      : null;

  return {
    distanceMeters,
    durationMillis,
    distanceKm,
    durationMinutes,
    route
  };
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

    currentRouteDistanceKm =
      null;

    currentRouteDurationMinutes =
      null;

    currentCustomerFare =
      null;

    clearRoutePolylines();

    fareEstimate.hidden =
      true;

    return;
  }

  const requestId =
    ++latestRouteRequestId;

  currentRouteDistanceKm =
    null;

  currentRouteDurationMinutes =
    null;

  currentCustomerFare =
    null;

  fareEstimate.hidden =
    false;

  estimatedDistance.textContent =
    "Calculating road distance...";

  estimatedFare.textContent =
    "Calculating...";

  try {

    const metrics =
      await calculateRouteMetrics(
        {
          lat:
            pickupLatitude,

          lng:
            pickupLongitude
        },
        {
          lat:
            deliveryLatitude,

          lng:
            deliveryLongitude
        }
      );

    if (
      requestId !==
      latestRouteRequestId
    ) {
      return;
    }

    const customerFare =
      calculateCustomerFare(
        metrics.distanceKm
      );

    currentRouteDistanceKm =
      metrics.distanceKm;

    currentRouteDurationMinutes =
      metrics.durationMinutes;

    currentCustomerFare =
      customerFare;

    estimatedDistance.textContent =
      metrics.durationMinutes
        ? `${metrics.distanceKm} km • Approx. ${metrics.durationMinutes} min`
        : `${metrics.distanceKm} km`;

    estimatedFare.textContent =
      `₹${customerFare}`;

    fareEstimate.hidden =
      false;

    await displayRouteOnMap(
      metrics.route
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

    currentRouteDistanceKm =
      null;

    currentRouteDurationMinutes =
      null;

    currentCustomerFare =
      null;

    clearRoutePolylines();

    estimatedDistance.textContent =
      "Road distance unavailable";

    estimatedFare.textContent =
      "Please try again";

    fareEstimate.hidden =
      false;
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
// RESOLVE TYPED PICKUP ADDRESS
// ======================================

async function resolveTypedPickupAddress() {

  if (!geocoder) {
    throw new Error(
      "Google Geocoder is not ready."
    );
  }

  const typedAddress =
    String(
      pickupAutocomplete?.value ||
      pickupLocationInput.value ||
      ""
    ).trim();

  if (!typedAddress) {
    throw new Error(
      "Please enter the pickup address."
    );
  }

  const currentSelectedAddress =
    pickupLocationInput
      .value
      .trim();

  const typedAddressChanged =
    typedAddress.toLowerCase() !==
    currentSelectedAddress.toLowerCase();

  /*
    Agar customer ne Google suggestion
    select ki thi aur uske valid coordinates
    already available hain, to dobara
    geocode karne ki zarurat nahi.
  */
  if (
    !typedAddressChanged &&
    Number.isFinite(
      pickupLatitude
    ) &&
    Number.isFinite(
      pickupLongitude
    )
  ) {
    return;
  }

  pickupLocationMessage.textContent =
    "Searching the pickup address you entered...";

  const pinCode =
    pinCodeInput?.value
      .trim() || "";

  const addressCandidates = [];

  const exactAddress =
    pinCode &&
    !typedAddress.includes(
      pinCode
    )
      ? `${typedAddress}, ${pinCode}`
      : typedAddress;

  addressCandidates.push(
    exactAddress
  );

  /*
    Example:
    4/8 Kad Road, Shipra Suncity,
    Indirapuram

    Fallback:
    Shipra Suncity, Indirapuram
  */
  const addressParts =
    typedAddress
      .split(",")
      .map(part =>
        part.trim()
      )
      .filter(Boolean);

  if (
    addressParts.length >= 2
  ) {
    const localityAddress =
      addressParts
        .slice(1)
        .join(", ");

    const localityWithPin =
      pinCode &&
      !localityAddress.includes(
        pinCode
      )
        ? `${localityAddress}, ${pinCode}`
        : localityAddress;

    if (
      localityWithPin &&
      !addressCandidates.includes(
        localityWithPin
      )
    ) {
      addressCandidates.push(
        localityWithPin
      );
    }
  }

  let selectedResult = null;
  let matchedCandidate = "";
  let partialFallback = null;
  let partialCandidate = "";

  for (
    const candidate of
    addressCandidates
  ) {
    try {
      const response =
        await geocoder.geocode({
          address:
            candidate,

          region:
            "IN"
        });

      const results =
        response.results || [];

      if (!results.length) {
        continue;
      }

      const acceptableResults =
  results.filter(
    result =>
      !propertyNumbersConflict(
        candidate,
        result
      )
  );

const completeResult =
  acceptableResults.find(
    result =>
      !result.partial_match
  );

if (completeResult) {
  selectedResult =
    completeResult;

  matchedCandidate =
    candidate;

  break;
}

if (
  !partialFallback &&
  acceptableResults.length
) {
  partialFallback =
    acceptableResults[0];

  partialCandidate =
    candidate;
}

    } catch (error) {
      console.warn(
        `Pickup address search failed for "${candidate}":`,
        error
      );
    }
  }

  if (!selectedResult) {
    selectedResult =
      partialFallback;

    matchedCandidate =
      partialCandidate;
  }

  if (!selectedResult) {
    pickupLatitude =
      null;

    pickupLongitude =
      null;

    pickupLocationInput.value =
      typedAddress;

    throw new Error(
      "Entered pickup address could not be located. Please add road, locality, city and PIN code."
    );
  }

  const position =
    getLatLngLiteral(
      selectedResult.geometry
        ?.location
    );

  if (!position) {
    throw new Error(
      "Google did not return valid coordinates for the pickup address."
    );
  }

  pickupLatitude =
    position.lat;

  pickupLongitude =
    position.lng;

  /*
    Customer ka exact typed address
    booking me preserve hoga.
  */
  pickupLocationInput.value =
    typedAddress;

  updatePickupMarker(
    position
  );

  if (bookingMap) {
    if (
      selectedResult.geometry
        ?.viewport
    ) {
      bookingMap.fitBounds(
        selectedResult.geometry
          .viewport
      );
    } else {
      bookingMap.setCenter(
        position
      );

      bookingMap.setZoom(
        17
      );
    }
  }

  const exactMatch =
    matchedCandidate ===
    exactAddress &&
    !selectedResult
      .partial_match;

  pickupLocationMessage.textContent =
    exactMatch
      ? "✅ Entered pickup address located on the map."
      : `✅ Nearby pickup location found: ${
          selectedResult
            .formatted_address
        }`;

  await updateFareEstimate();
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

usePickupLocationButton?.addEventListener(
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
// ADDRESS NUMBER MATCH HELPERS
// ======================================

function extractTypedPropertyNumber(
  address
) {
  const text =
    String(address || "")
      .trim();

  /*
    Supports examples:
    Plot no 1031
    Plot 1031
    House no 1031
    D-236
    D 236
    4/8
    1031
  */
  const labelledMatch =
    text.match(
      /\b(?:plot|house|flat|shop|unit|door)\s*(?:no\.?|number)?\s*[:#-]?\s*([a-z]?\s*[-/]?\s*\d+(?:\/\d+)?)/i
    );

  if (labelledMatch) {
    return labelledMatch[1]
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  const startingMatch =
    text.match(
      /^\s*([a-z]?\s*[-/]?\s*\d+(?:\/\d+)?)/i
    );

  return startingMatch
    ? startingMatch[1]
        .replace(/\s+/g, "")
        .toLowerCase()
    : "";
}

function extractGooglePropertyNumber(
  geocoderResult
) {
  const components =
    geocoderResult
      ?.address_components ||
    [];

  const streetNumberComponent =
    components.find(
      component =>
        component.types?.includes(
          "street_number"
        )
    );

  if (
    streetNumberComponent
      ?.long_name
  ) {
    return String(
      streetNumberComponent.long_name
    )
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  const formattedAddress =
    String(
      geocoderResult
        ?.formatted_address ||
      ""
    );

  const startingMatch =
    formattedAddress.match(
      /^\s*([a-z]?\s*[-/]?\s*\d+(?:\/\d+)?)/i
    );

  return startingMatch
    ? startingMatch[1]
        .replace(/\s+/g, "")
        .toLowerCase()
    : "";
}

function propertyNumbersConflict(
  typedAddress,
  geocoderResult
) {
  const typedNumber =
    extractTypedPropertyNumber(
      typedAddress
    );

  const googleNumber =
    extractGooglePropertyNumber(
      geocoderResult
    );

  return Boolean(
    typedNumber &&
    googleNumber &&
    typedNumber !==
      googleNumber
  );
}

// ======================================
// RESOLVE TYPED DELIVERY ADDRESS
// ======================================

async function resolveTypedDeliveryAddress() {

  if (!geocoder) {
    throw new Error(
      "Google Geocoder is not ready."
    );
  }

  const typedAddress =
    String(
      deliveryAutocomplete?.value ||
      deliveryLocationInput.value ||
      ""
    ).trim();

  if (!typedAddress) {
    throw new Error(
      "Please enter the delivery address."
    );
  }

  const currentSelectedAddress =
    deliveryLocationInput
      .value
      .trim();

  const typedAddressChanged =
    typedAddress.toLowerCase() !==
    currentSelectedAddress.toLowerCase();

  /*
    Agar customer ne Google suggestion
    select ki thi aur uske valid coordinates
    already available hain, to dobara
    geocode karne ki zarurat nahi.
  */
  if (
    !typedAddressChanged &&
    Number.isFinite(
      deliveryLatitude
    ) &&
    Number.isFinite(
      deliveryLongitude
    )
  ) {
    return;
  }

  deliveryLocationMessage.textContent =
    "Searching the address you entered...";

  const pinCode =
    pinCodeInput?.value
      .trim() || "";

  const addressCandidates = [];

  const exactAddress =
    pinCode &&
    !typedAddress.includes(
      pinCode
    )
      ? `${typedAddress}, ${pinCode}`
      : typedAddress;

  addressCandidates.push(
    exactAddress
  );

  /*
    Example:
    4/8 Kad Road, Shipra Suncity,
    Indirapuram

    Fallback:
    Shipra Suncity, Indirapuram
  */
  const addressParts =
    typedAddress
      .split(",")
      .map(part =>
        part.trim()
      )
      .filter(Boolean);

  if (
    addressParts.length >= 2
  ) {
    const localityAddress =
      addressParts
        .slice(1)
        .join(", ");

    const localityWithPin =
      pinCode &&
      !localityAddress.includes(
        pinCode
      )
        ? `${localityAddress}, ${pinCode}`
        : localityAddress;

    if (
      localityWithPin &&
      !addressCandidates.includes(
        localityWithPin
      )
    ) {
      addressCandidates.push(
        localityWithPin
      );
    }
  }

  let selectedResult = null;
  let matchedCandidate = "";
  let partialFallback = null;
  let partialCandidate = "";

  for (
    const candidate of
    addressCandidates
  ) {
    try {
      const response =
        await geocoder.geocode({
          address:
            candidate,

          region:
            "IN"
        });

      const results =
        response.results || [];

      if (!results.length) {
        continue;
      }

      const acceptableResults =
  results.filter(
    result =>
      !propertyNumbersConflict(
        candidate,
        result
      )
  );

const completeResult =
  acceptableResults.find(
    result =>
      !result.partial_match
  );

if (completeResult) {
  selectedResult =
    completeResult;

  matchedCandidate =
    candidate;

  break;
}

if (
  !partialFallback &&
  acceptableResults.length
) {
  partialFallback =
    acceptableResults[0];

  partialCandidate =
    candidate;
}
    } catch (error) {
      console.warn(
        `Address search failed for "${candidate}":`,
        error
      );
    }
  }

  if (!selectedResult) {
    selectedResult =
      partialFallback;

    matchedCandidate =
      partialCandidate;
  }

  if (!selectedResult) {
    deliveryLatitude =
      null;

    deliveryLongitude =
      null;

    deliveryLocationInput.value =
      typedAddress;

    throw new Error(
      "Entered delivery address could not be located. Please add road, locality, city and PIN code."
    );
  }

  const position =
    getLatLngLiteral(
      selectedResult.geometry
        ?.location
    );

  if (!position) {
    throw new Error(
      "Google did not return valid coordinates for the delivery address."
    );
  }

  deliveryLatitude =
    position.lat;

  deliveryLongitude =
    position.lng;

  /*
    Customer ka exact typed address
    booking me preserve hoga.
  */
  deliveryLocationInput.value =
    typedAddress;

  updateDeliveryMarker(
    position
  );

  if (bookingMap) {
    if (
      selectedResult.geometry
        ?.viewport
    ) {
      bookingMap.fitBounds(
        selectedResult.geometry
          .viewport
      );
    } else {
      bookingMap.setCenter(
        position
      );

      bookingMap.setZoom(
        17
      );
    }
  }

  const exactMatch =
    matchedCandidate ===
    exactAddress &&
    !selectedResult
      .partial_match;

  deliveryLocationMessage.textContent =
    exactMatch
      ? "✅ Entered delivery address located on the map."
      : `✅ Nearby map location found: ${
          selectedResult
            .formatted_address
        }`;

  await updateFareEstimate();
}

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

      try {

  await resolveTypedPickupAddress();

  await resolveTypedDeliveryAddress();

} catch (addressError) {

  console.error(
    "Address resolution failed:",
    addressError
  );

  bookingResult.innerHTML = `
    <p>
      ❌ ${escapeHtml(
        addressError.message
      )}
    </p>
  `;

  return;
}

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

const savedCustomerSession =
  getCustomerSession();

fillBookingCustomerDetails(
  savedCustomerSession
);

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