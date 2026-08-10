/**
 * src/utils/settings.js
 * Read/write helpers for SystemSetting, with typed accessors:
 *   getSetting('ssnit.rate')          -> raw string
 *   getSettingNumber('ssnit.rate')    -> Number
 *   getSettingJson('tax.paye_brackets')-> parsed object
 * Values are cached per process and invalidated on write.
 */
const { SystemSetting } = require('../models');

const cache = new Map();

async function loadAll() {
  const rows = await SystemSetting.findAll();
  cache.clear();
  for (const row of rows) cache.set(row.key, row.value);
}

async function getSetting(key) {
  if (!cache.has(key)) {
    const row = await SystemSetting.findOne({ where: { key } });
    cache.set(key, row ? row.value : null);
  }
  return cache.get(key);
}

async function getSettingNumber(key) {
  const v = await getSetting(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function getSettingJson(key) {
  const v = await getSetting(key);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

async function setSetting(key, value, updatedBy = null, description = null) {
  const [row] = await SystemSetting.findOrCreate({
    where: { key },
    defaults: { value: String(value), description, updated_by: updatedBy },
  });
  row.value = String(value);
  if (description !== null) row.description = description;
  row.updated_by = updatedBy;
  await row.save();
  cache.set(key, String(value));
  return row;
}

module.exports = { loadAll, getSetting, getSettingNumber, getSettingJson, setSetting };
