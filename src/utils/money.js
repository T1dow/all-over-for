/**
 * src/utils/money.js
 * ------------------------------------------------------------------
 * Money handling rules (business rule BR-02):
 *   1. NEVER use JavaScript floats for money — decimal.js is used so
 *      arithmetic like 0.1 + 0.2 === 0.3 works exactly.
 *   2. Every published figure is rounded ONCE, half-up, to 2 decimals.
 *   3. Totals are computed from unrounded line values and rounded at
 *      the end — never by summing rounded values ("penny-off" bug).
 * ------------------------------------------------------------------
 */
const Decimal = require('decimal.js');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Convert any numeric input into a Decimal (safe for strings/numbers). */
function dec(value) {
  if (value instanceof Decimal) return value;
  return new Decimal(value === null || value === undefined ? 0 : value);
}

/** Round half-up to the given number of decimal places (default 2). */
function round(value, places = 2) {
  return dec(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
}

/** Format a number as GH₵ currency for display. */
function money(value) {
  return `GH₵ ${round(value).toNumber().toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Sum an array of numeric values exactly, then round once. */
function sum(values) {
  return values.reduce((acc, v) => acc.plus(dec(v)), new Decimal(0));
}

module.exports = { dec, round, money, sum, Decimal };
