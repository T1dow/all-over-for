/**
 * test/numberToWords.test.js
 * Unit tests for the payslip "amount in words" converter.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { amountInWords, integerToWords } = require('../src/utils/numberToWords');

test('integerToWords: small numbers', () => {
  assert.equal(integerToWords(0), 'Zero');
  assert.equal(integerToWords(7), 'Seven');
  assert.equal(integerToWords(42), 'Forty Two');
  assert.equal(integerToWords(115), 'One Hundred and Fifteen');
});

test('integerToWords: thousands', () => {
  assert.equal(integerToWords(6004), 'Six Thousand and Four');
  assert.equal(integerToWords(3465), 'Three Thousand, Four Hundred and Sixty Five');
  assert.equal(integerToWords(1500000), 'One Million, Five Hundred Thousand');
});

test('amountInWords: cedis and pesewas', () => {
  assert.equal(amountInWords(6004.31), 'Six Thousand and Four Cedis and Thirty One Pesewas Only');
  assert.equal(amountInWords(3465.25), 'Three Thousand, Four Hundred and Sixty Five Cedis and Twenty Five Pesewas Only');
  assert.equal(amountInWords(100.00), 'One Hundred Cedis Only');
  assert.equal(amountInWords(0.50), 'Zero Cedis and Fifty Pesewas Only');
});
