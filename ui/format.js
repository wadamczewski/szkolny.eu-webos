// Polish date and number formatting. School days are "yyyy-MM-dd" strings.

const DAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
const DAY_SHORT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

const pad = (n) => String(n).padStart(2, '0');

export function today(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(day) {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function weekStart(day) {
  return addDays(day, -weekday(day));
}

/** The current week, or the coming one on weekends (like the phone apps). */
export function defaultWeek() {
  const t = today();
  return weekday(t) >= 5 ? addDays(weekStart(t), 7) : weekStart(t);
}

const parts = (day) => ({ d: Number(day.slice(8, 10)), m: Number(day.slice(5, 7)) - 1, y: Number(day.slice(0, 4)) });

export function dayLong(day) {
  if (!day) return '';
  const t = today();
  if (day === t) return 'Dzisiaj';
  if (day === addDays(t, 1)) return 'Jutro';
  if (day === addDays(t, -1)) return 'Wczoraj';
  const { d, m } = parts(day);
  return `${capitalize(DAY_NAMES[weekday(day)])}, ${d} ${MONTHS[m]}`;
}

/** "Dzisiaj", "Jutro" or "Śr 4 lis". */
export function dayCompact(day) {
  if (!day) return '';
  const t = today();
  if (day === t) return 'Dzisiaj';
  if (day === addDays(t, 1)) return 'Jutro';
  return `${DAY_SHORT[weekday(day)]} ${dayShort(day)}`;
}

export function dayMedium(day) {
  if (!day) return '';
  const { d, m } = parts(day);
  return `${d} ${MONTHS[m]}`;
}

export function dayShort(day) {
  if (!day) return '';
  const { d, m } = parts(day);
  return `${d} ${MONTHS_SHORT[m]}`;
}

export function dayName(day, short) {
  return short ? DAY_SHORT[weekday(day)] : capitalize(DAY_NAMES[weekday(day)]);
}

export function weekRange(start) {
  const end = addDays(start, 4);
  const a = parts(start);
  const b = parts(end);
  if (a.m === b.m) return `${a.d}–${b.d} ${MONTHS[b.m]} ${b.y}`;
  return `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
}

export function dateLong(now = new Date()) {
  return `${capitalize(DAY_NAMES[(now.getDay() + 6) % 7])}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

export function time(now = new Date()) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** "2025-10-01 10:00:00" → "1 paź". */
export function addedShort(dateTime) {
  return dateTime ? dayShort(dateTime.slice(0, 10)) : '';
}

export function sinceLabel(timestamp) {
  if (!timestamp) return 'nigdy';
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'przed chwilą';
  if (minutes < 60) return `${minutes} min temu`;
  const d = new Date(timestamp);
  const day = today(d);
  return day === today() ? `dziś ${time(d)}` : `${dayShort(day)} ${time(d)}`;
}

export function average(value) {
  return value === null || value === undefined ? '—' : value.toFixed(2).replace('.', ',');
}

export function percent(value) {
  return value === null || value === undefined ? '—' : `${value.toFixed(1).replace('.', ',')}%`;
}

export function weight(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Minutes since midnight for "08:55". */
export function minutes(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + m;
}
