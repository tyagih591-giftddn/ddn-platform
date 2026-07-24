const bcrypt = require("bcryptjs");

const pool = require("../config/database");
const {
  generateRiderCode
} = require("../utils/riderIdGenerator");

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeUsername(value) {
  return cleanText(value).toLowerCase();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizeMobileNumber(value) {
  return cleanText(value).replace(/\s+/g, "");
}

async function findRiderByUsername(username) {
  const normalizedUsername =
    normalizeUsername(username);

  if (!normalizedUsername) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT
      id,
      rider_code,
      username,
      full_name,
      mobile_number,
      email,
      address,
      working_area,
      vehicle_type,
      vehicle_number,
      availability_status,
      verification_status,
      application_status,
      is_active,
      created_at,
      updated_at
    FROM riders
    WHERE username = $1
    LIMIT 1
    `,
    [normalizedUsername]
  );

  return result.rows[0] || null;
}

async function findRiderByMobileNumber(
  mobileNumber
) {
  const normalizedMobile =
    normalizeMobileNumber(mobileNumber);

  if (!normalizedMobile) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT
      id,
      rider_code,
      username,
      full_name,
      mobile_number,
      email,
      application_status
    FROM riders
    WHERE mobile_number = $1
    LIMIT 1
    `,
    [normalizedMobile]
  );

  return result.rows[0] || null;
}

async function createRider(riderData) {
  const username =
    normalizeUsername(riderData.username);

  const password =
    cleanText(riderData.password);

  const fullName =
    cleanText(riderData.fullName);

  const mobileNumber =
    normalizeMobileNumber(
      riderData.mobileNumber
    );

  const email =
    normalizeEmail(riderData.email);

  const address =
    cleanText(riderData.address);

  const workingArea =
    cleanText(riderData.workingArea);

  const vehicleType =
    cleanText(riderData.vehicleType);

  const vehicleNumber =
    cleanText(riderData.vehicleNumber)
      .toUpperCase();

  if (
    !username ||
    !password ||
    !fullName ||
    !mobileNumber
  ) {
    const error = new Error(
      "Username, password, full name and mobile number are required"
    );

    error.statusCode = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error(
      "Password must be at least 6 characters long"
    );

    error.statusCode = 400;
    throw error;
  }

  const existingUsername =
    await findRiderByUsername(username);

  if (existingUsername) {
    const error = new Error(
      "Username is already registered"
    );

    error.statusCode = 409;
    throw error;
  }

  const existingMobile =
    await findRiderByMobileNumber(
      mobileNumber
    );

  if (existingMobile) {
    const error = new Error(
      "Mobile number is already registered"
    );

    error.statusCode = 409;
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const riderCode =
      await generateRiderCode(client);

    const passwordHash =
      await bcrypt.hash(password, 12);

    const result = await client.query(
      `
      INSERT INTO riders
      (
        rider_code,
        username,
        password_hash,
        full_name,
        mobile_number,
        email,
        address,
        working_area,
        vehicle_type,
        vehicle_number,
        availability_status,
        verification_status,
        application_status,
        is_active
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14
      )
      RETURNING
        id,
        rider_code,
        username,
        full_name,
        mobile_number,
        email,
        address,
        working_area,
        vehicle_type,
        vehicle_number,
        availability_status,
        verification_status,
        application_status,
        is_active,
        created_at,
        updated_at
      `,
      [
        riderCode,
        username,
        passwordHash,
        fullName,
        mobileNumber,
        email || null,
        address || null,
        workingArea || null,
        vehicleType || null,
        vehicleNumber || null,
        "offline",
        "pending",
        "pending",
        false
      ]
    );

    await client.query("COMMIT");

    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      const duplicateError = new Error(
        "Rider username, mobile number or rider code already exists"
      );

      duplicateError.statusCode = 409;
      throw duplicateError;
    }

    throw error;
  } finally {
    client.release();
  }
}

async function getRiderById(riderId) {
  const parsedRiderId =
    Number.parseInt(riderId, 10);

  if (!Number.isInteger(parsedRiderId)) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT
      id,
      rider_code,
      username,
      full_name,
      mobile_number,
      email,
      address,
      working_area,
      vehicle_type,
      vehicle_number,
      availability_status,
      verification_status,
      application_status,
      is_active,
      created_at,
      updated_at
    FROM riders
    WHERE id = $1
    LIMIT 1
    `,
    [parsedRiderId]
  );

  return result.rows[0] || null;
}

module.exports = {
  createRider,
  getRiderById,
  findRiderByUsername,
  findRiderByMobileNumber
};