const pool = require("../config/database");

const RIDER_CODE_PREFIX = "DDN-R-";
const RIDER_CODE_DIGITS = 6;

function formatRiderCode(number) {
  return (
    RIDER_CODE_PREFIX +
    String(number).padStart(RIDER_CODE_DIGITS, "0")
  );
}

function extractRiderNumber(riderCode) {
  if (
    typeof riderCode !== "string" ||
    !riderCode.startsWith(RIDER_CODE_PREFIX)
  ) {
    return 0;
  }

  const numberPart = riderCode.slice(
    RIDER_CODE_PREFIX.length
  );

  const riderNumber = parseInt(numberPart, 10);

  return Number.isInteger(riderNumber)
    ? riderNumber
    : 0;
}

async function generateRiderCode(client = pool) {
  const result = await client.query(`
    SELECT rider_code
    FROM riders
    WHERE rider_code IS NOT NULL
      AND rider_code LIKE 'DDN-R-%'
    ORDER BY id DESC
    LIMIT 1
  `);

  const latestCode =
    result.rows.length > 0
      ? result.rows[0].rider_code
      : null;

  const nextNumber =
    extractRiderNumber(latestCode) + 1;

  return formatRiderCode(nextNumber);
}

module.exports = {
  generateRiderCode,
  formatRiderCode,
  extractRiderNumber,
};