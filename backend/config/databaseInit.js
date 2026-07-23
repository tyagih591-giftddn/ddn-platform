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
      is_active
    )
    VALUES ($1, $2, $3, $4, $5)
    `,
    [
      username,
      passwordHash,
      cleanText(
        process.env.RIDER_FULL_NAME
      ) || "DDN Rider",
      "offline",
      true
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
      pickup_location TEXT NOT NULL,
      delivery_location TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      mobile_number VARCHAR(20)
        NOT NULL,
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
    CREATE TABLE IF NOT EXISTS riders (
      id SERIAL PRIMARY KEY,

      username VARCHAR(100)
        UNIQUE NOT NULL,

      password_hash TEXT NOT NULL,

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
    CREATE INDEX IF NOT EXISTS
    idx_bookings_assigned_rider
    ON bookings (assigned_rider)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_bookings_created_at
    ON bookings (created_at DESC)
  `);

  await createDefaultRider();

  console.log(
    "Database tables are ready"
  );
}

module.exports = initializeDatabase;