const bcrypt = require("bcryptjs");

const pool = require("./database");

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeUsername(value) {
  return cleanText(value).toLowerCase();
}

async function createDefaultRider() {
  const username = normalizeUsername(
    process.env.RIDER_USERNAME
  );

  const password = cleanText(
    process.env.RIDER_PASSWORD
  );

  if (!username || !password) {
    console.log(
      "Default rider environment variables are not configured"
    );

    return;
  }

  const existingRider = await pool.query(
    `
    SELECT id
    FROM riders
    WHERE username = $1
    `,
    [username]
  );

  if (existingRider.rows.length > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  await pool.query(
    `
    INSERT INTO riders
    (
      username,
      password_hash,
      full_name,
      availability_status,
      is_active,
      verification_status,
      application_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      username,
      passwordHash,
      cleanText(
        process.env.RIDER_FULL_NAME
      ) || "DDN Rider",
      "offline",
      true,
      "verified",
      "approved"
    ]
  );

  console.log(
    `Default rider created: ${username}`
  );
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,

      booking_id VARCHAR(100)
        UNIQUE NOT NULL,

      pickup_location TEXT
        NOT NULL,

      delivery_location TEXT
        NOT NULL,

      customer_name TEXT
        NOT NULL,

      mobile_number VARCHAR(20)
        NOT NULL,

      pin_code VARCHAR(6),

      customer_pickup_latitude
        DOUBLE PRECISION,

      customer_pickup_longitude
        DOUBLE PRECISION,

      customer_delivery_latitude
        DOUBLE PRECISION,

      customer_delivery_longitude
        DOUBLE PRECISION,

      delivery_distance_km
        NUMERIC(10, 2),

      route_duration_minutes
        INTEGER,

      customer_fare
        NUMERIC(10, 2),

      rider_earning
        NUMERIC(10, 2),

      platform_earning
        NUMERIC(10, 2),

      status VARCHAR(50)
        DEFAULT 'Pending',

      assigned_rider VARCHAR(100),

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    assigned_rider VARCHAR(100)
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    pin_code VARCHAR(6)
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    customer_pickup_latitude
    DOUBLE PRECISION
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    customer_pickup_longitude
    DOUBLE PRECISION
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    customer_delivery_latitude
    DOUBLE PRECISION
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    customer_delivery_longitude
    DOUBLE PRECISION
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    delivery_distance_km NUMERIC(10, 2)
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    route_duration_minutes INTEGER
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    customer_fare NUMERIC(10, 2)
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    rider_earning NUMERIC(10, 2)
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS
    platform_earning NUMERIC(10, 2)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS riders (
      id SERIAL PRIMARY KEY,

      username VARCHAR(100)
        UNIQUE NOT NULL,

      password_hash TEXT
        NOT NULL,

      full_name VARCHAR(150)
        NOT NULL,

      mobile_number VARCHAR(20),

      availability_status VARCHAR(20)
        NOT NULL DEFAULT 'offline',

      is_active BOOLEAN
        NOT NULL DEFAULT TRUE,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    rider_code VARCHAR(30)
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    email VARCHAR(150)
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    address TEXT
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    working_area VARCHAR(150)
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    vehicle_type VARCHAR(50)
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    vehicle_number VARCHAR(50)
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    verification_status VARCHAR(30)
      NOT NULL DEFAULT 'pending'
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    application_status VARCHAR(30)
      NOT NULL DEFAULT 'approved'
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    current_latitude DOUBLE PRECISION
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    current_longitude DOUBLE PRECISION
  `);

  await pool.query(`
    ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS
    last_location_updated_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    idx_riders_rider_code
    ON riders (rider_code)
    WHERE rider_code IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rider_documents (
      id SERIAL PRIMARY KEY,

      rider_id INTEGER
        NOT NULL
        REFERENCES riders(id)
        ON DELETE CASCADE,

      document_type VARCHAR(50)
        NOT NULL,

      file_path TEXT
        NOT NULL,

      document_number_last4 VARCHAR(10),

      verification_status VARCHAR(30)
        NOT NULL DEFAULT 'pending',

      verification_notes TEXT,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

      UNIQUE (rider_id, document_type)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rider_emergency_contacts (
      id SERIAL PRIMARY KEY,

      rider_id INTEGER
        NOT NULL
        REFERENCES riders(id)
        ON DELETE CASCADE,

      contact_name VARCHAR(150)
        NOT NULL,

      relation VARCHAR(100),

      mobile_number VARCHAR(20)
        NOT NULL,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rider_verification_logs (
      id SERIAL PRIMARY KEY,

      rider_id INTEGER
        NOT NULL
        REFERENCES riders(id)
        ON DELETE CASCADE,

      verified_by VARCHAR(150),

      action VARCHAR(50)
        NOT NULL,

      remarks TEXT,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_bookings_assigned_rider
    ON bookings (assigned_rider)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_bookings_created_at
    ON bookings (created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_rider_documents_rider_id
    ON rider_documents (rider_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_rider_verification_logs_rider_id
    ON rider_verification_logs (rider_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_riders_last_location_updated_at
    ON riders (last_location_updated_at DESC)
  `);

  await createDefaultRider();

  console.log(
    "Database tables are ready"
  );
}

module.exports = initializeDatabase;