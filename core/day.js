'use strict';

// School days are plain "yyyy-MM-dd" strings (like `Day` in Models.swift), so they never shift
// with time zones. Arithmetic runs on UTC midnight of that date.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parse(s) {
  if (typeof s !== 'string') return null;
  const d = s.slice(0, 10);
  if (!DAY_RE.test(d)) return null;
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return isNaN(t) || format(new Date(t)) !== d ? null : d;
}

function format(date) {
  return date.toISOString().slice(0, 10);
}

/** Today on the device clock (the TV is set to Polish time). */
function today(now) {
  const d = now || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
}

/** 0 = Monday … 6 = Sunday. */
function weekday(day) {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Monday of this day's week. */
function weekStart(day) {
  return addDays(day, -weekday(day));
}

/** The current week, or the coming one on weekends (like Android and iOS). */
function defaultTimetableWeek(now) {
  const t = today(now);
  return weekday(t) >= 5 ? addDays(weekStart(t), 7) : weekStart(t);
}

/** "2025-10-01 10:00:00" → same string trimmed to 19 chars, or the date alone. */
function dateTime(s) {
  if (typeof s !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 19);
  const d = parse(s);
  return d ? `${d} 00:00:00` : null;
}

module.exports = { parse, today, addDays, weekday, weekStart, defaultTimetableWeek, dateTime };
