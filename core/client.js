'use strict';

// Service methods called by the TV app (over the luna bus) and by the dev server. Each call gets
// the account (login, password, cookies) and returns the updated session state, so nothing has to
// survive in the service process between calls. Port of StudentClient.swift.

const P = require('./parsers');
const Day = require('./day');
const { SynergiaSession } = require('./session');
const { SynergiaWeb } = require('./synergia');
const { LibrusError } = require('./errors');
const { str, int, obj } = require('./json');
const { summarizeAttendance } = require('./summary');
const demo = require('./demo');

// Dictionaries from the last sync, so a timetable week doesn't refetch them (lost on restart).
const dictionaryCache = new Map();

function isDemo(account) {
  return !!account && String(account.login || '').trim().toLowerCase() === demo.LOGIN;
}

function openSession(payload) {
  const account = payload && payload.account;
  if (!account || !account.login || !account.password) throw new LibrusError('notLoggedIn');
  return new SynergiaSession(account);
}

function studentNames(meJson) {
  const me = obj(meJson.Me) || {};
  const account = obj(me.Account) || {};
  const user = obj(me.User) || {};
  const fullName = (o) => P.fixName([str(o.FirstName), str(o.LastName)].filter(Boolean).join(' '));
  const groupId = int(account.GroupId) || 0;
  return {
    studentName: fullName(user) || null,
    accountName: groupId === 5 ? fullName(account) || null : null,
    isParent: groupId >= 5 && groupId <= 6,
  };
}

async function login(payload) {
  if (isDemo(payload && payload.account)) return demo.login();
  const session = openSession(payload);
  await session.ensureLoggedIn(true);
  const names = studentNames(await session.get('Me'));
  return {
    profile: { login: session.login, studentName: names.studentName || session.login, isParent: names.isParent },
    session: session.state(),
  };
}

/** Runs `tasks` (functions returning promises) with at most `limit` in flight. */
async function runLimited(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await tasks[i]() };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const DICTIONARIES = [
  ['subjects', 'Przedmioty', 'Subjects'],
  ['teachers', 'Nauczyciele', 'Users'],
  ['classrooms', 'Sale', 'Classrooms'],
  ['gradeCategories', 'Kategorie ocen', 'Grades/Categories'],
  ['gradeComments', 'Komentarze ocen', 'Grades/Comments'],
  ['eventCategories', 'Kategorie wydarzeń', 'HomeWorks/Categories'],
  ['attendanceTypes', 'Typy frekwencji', 'Attendances/Types'],
  ['noticeCategories', 'Kategorie uwag', 'Notes/Categories'],
  ['lessons', 'Lekcje', 'Lessons'],
];

const SECTIONS = [
  ['grades', 'Oceny', 'Grades'],
  ['events', 'Terminarz', 'HomeWorks'],
  ['attendance', 'Frekwencja', 'Attendances'],
  ['notices', 'Uwagi', 'Notes'],
  ['announcements', 'Ogłoszenia', 'SchoolNotices'],
  ['luckyNumber', 'Szczęśliwy numerek', 'LuckyNumbers'],
];

function warningFor(label, result, warnings) {
  if (result.ok) return result.value;
  // Disabled features are expected in some schools; don't nag about them.
  if (result.error && result.error.code === 'featureNotActive') return null;
  warnings.push(`${label}: ${result.error && result.error.message ? result.error.message : result.error}`);
  return null;
}

async function sync(payload) {
  if (isDemo(payload && payload.account)) return demo.sync(payload.weekStart);
  const session = openSession(payload);
  const weekStart = Day.parse(payload.weekStart) || Day.defaultTimetableWeek();
  const warnings = [];

  // Fail fast on auth problems before firing ~17 requests.
  const names = studentNames(await session.get('Me'));

  const endpoints = DICTIONARIES.concat(SECTIONS, [['timetable', 'Plan lekcji', `Timetables?weekStart=${weekStart}`]]);
  const results = await runLimited(endpoints.map((e) => () => session.get(e[2])), 6);
  const raw = {};
  endpoints.forEach((e, i) => { raw[e[0]] = warningFor(e[1], results[i], warnings); });

  const dict = P.emptyDictionaries();
  for (const [key] of DICTIONARIES) {
    if (raw[key]) dict[key] = P[key](raw[key]);
  }
  if (!raw.subjects) dict.subjects = P.subjects({});
  dictionaryCache.set(session.login, dict);

  const attendance = raw.attendance ? P.attendance(raw.attendance, dict) : [];
  return {
    data: {
      fetchedAt: Date.now(),
      studentName: names.studentName,
      accountName: names.accountName,
      subjects: Object.keys(dict.subjects)
        .map((k) => dict.subjects[k])
        .sort((a, b) => a.name.localeCompare(b.name, 'pl')),
      grades: raw.grades ? P.grades(raw.grades, dict) : [],
      events: raw.events ? P.events(raw.events, dict) : [],
      attendance: summarizeAttendance(attendance),
      notices: raw.notices ? P.notices(raw.notices, dict) : [],
      announcements: raw.announcements ? P.announcements(raw.announcements, dict) : [],
      luckyNumber: raw.luckyNumber ? P.luckyNumber(raw.luckyNumber) : null,
      timetable: { weekStart, days: raw.timetable ? P.timetable(raw.timetable, dict) : [] },
      warnings,
    },
    session: session.state(),
  };
}

/** One timetable week, using dictionaries from the last sync (fetched again if needed). */
async function timetable(payload) {
  if (isDemo(payload && payload.account)) return demo.timetable(payload.weekStart);
  const session = openSession(payload);
  const weekStart = Day.parse(payload.weekStart);
  if (!weekStart) throw new LibrusError('badRequest', 'weekStart');
  let dict = dictionaryCache.get(session.login);
  if (!dict) {
    dict = P.emptyDictionaries();
    const [subjects, teachers, classrooms] = await Promise.all([
      session.get('Subjects'),
      session.get('Users'),
      session.get('Classrooms'),
    ]);
    dict.subjects = P.subjects(subjects);
    dict.teachers = P.teachers(teachers);
    dict.classrooms = P.classrooms(classrooms);
  }
  const json = await session.get(`Timetables?weekStart=${Day.weekStart(weekStart)}`);
  return { timetable: { weekStart: Day.weekStart(weekStart), days: P.timetable(json, dict) }, session: session.state() };
}

async function messages(payload) {
  if (isDemo(payload && payload.account)) return demo.messages(payload.folder);
  const session = openSession(payload);
  const list = await new SynergiaWeb(session).messages(payload.folder || 'inbox', int(payload.page) || 0);
  return { messages: list, session: session.state() };
}

async function message(payload) {
  if (isDemo(payload && payload.account)) return demo.message(payload.id);
  const session = openSession(payload);
  const detail = await new SynergiaWeb(session).message(payload.id, payload.folder || 'inbox');
  return { message: detail, session: session.state() };
}

module.exports = { login, sync, timetable, messages, message, studentNames };
