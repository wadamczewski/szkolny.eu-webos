'use strict';

// Lenient accessors mirroring JSON.swift: Librus payloads mix numbers and numeric strings.

function str(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return null;
}

function int(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === 'string') return /^\s*-?\d+\s*$/.test(v) ? parseInt(v, 10) : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

function dbl(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.replace(',', '.').trim();
    return s !== '' && !isNaN(Number(s)) ? Number(s) : null;
  }
  return null;
}

function bool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['1', 'true'].includes(v.toLowerCase());
  return null;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/** `{"Id": 123, "Url": "..."}` reference → 123. */
function refId(v) {
  const o = obj(v);
  return o ? int(o.Id) : null;
}

function isNull(v) {
  return v === null || v === undefined;
}

module.exports = { str, int, dbl, bool, arr, obj, refId, isNull };
