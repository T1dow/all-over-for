/**
 * src/utils/numberToWords.js
 * ------------------------------------------------------------------
 * Converts an amount to words for the payslip's "Net pay in words"
 * line (zone 6 of the reference design, docs/00):
 *
 *   3465.25 → "Three Thousand Four Hundred and Sixty-Five Cedis
 *              and Twenty-Five Pesewas Only"
 * ------------------------------------------------------------------
 */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

/** Convert an integer (0..999) to words, UK/Ghana convention ("one hundred and fifteen"). */
function threeDigits(n) {
  const words = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) words.push(`${ONES[hundreds]} Hundred`);
  if (rest >= 20) {
    if (hundreds) words.push('and');
    words.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) words.push(ONES[rest % 10]);
  } else if (rest) {
    if (hundreds) words.push('and');
    words.push(ONES[rest]);
  }
  return words.join(' ');
}

function integerToWords(n) {
  if (n === 0) return 'Zero';
  let num = n;
  const groups = [];
  while (num > 0) {
    groups.push(num % 1000);
    num = Math.floor(num / 1000);
  }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const words = threeDigits(groups[i]);
    const scale = SCALES[i];
    parts.push(scale ? `${words} ${scale}` : words);
  }
  // Standard reading: groups joined with commas; "and" before the final
  // group unless that group already contains an internal "and"
  // (e.g. "Three Thousand, Four Hundred and Sixty Five").
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1).join(', ');
  if (last.includes('and')) return `${head}, ${last}`;
  return `${head} and ${last}`;
}

/**
 * Amount in Ghanaian words.
 * @param {number|string} amount
 */
function amountInWords(amount) {
  const n = Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
  const cedis = Math.floor(n);
  const pesewas = Math.round((n - cedis) * 100);
  const c = integerToWords(cedis);
  const p = pesewas ? ` and ${integerToWords(pesewas)} Pesewas` : '';
  return `${c} Cedis${p} Only`;
}

module.exports = { amountInWords, integerToWords };
