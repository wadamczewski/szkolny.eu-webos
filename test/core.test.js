'use strict';

// Offline checks against the synthetic (fake) fixtures shared with the iOS app and Android TV.
// The expected values are the same as in LibrusKitCheck/main.swift. No network, no real data.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../core/parsers');
const Day = require('../core/day');
const { formEncode } = require('../core/http');
const { messageList, messageDetail, isLoggedOut } = require('../core/synergia');
const { summarizeAttendance } = require('../core/summary');
const { throwError } = require('../core/session');
const demo = require('../core/demo');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const json = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
const html = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

function dictionaries() {
  const dict = P.emptyDictionaries();
  dict.subjects = P.subjects(json('subjects.json'));
  dict.teachers = P.teachers(json('users.json'));
  dict.classrooms = P.classrooms(json('classrooms.json'));
  dict.gradeCategories = P.gradeCategories(json('grade_categories.json'));
  dict.gradeComments = P.gradeComments(json('grade_comments.json'));
  dict.attendanceTypes = P.attendanceTypes(json('attendance_types.json'));
  dict.lessons = P.lessons(json('lessons.json'));
  return dict;
}

test('grade values', () => {
  assert.strictEqual(P.gradeValue('5'), 5);
  assert.strictEqual(P.gradeValue('4+'), 4.5);
  assert.strictEqual(P.gradeValue('3-'), 2.75);
  assert.strictEqual(P.gradeValue('np'), null);
  assert.strictEqual(P.gradeValue('+'), null);
});

test('form encoding matches the Swift client', () => {
  assert.strictEqual(formEncode([['wyslij', 'Wyślij']]), 'wyslij=Wy%C5%9Blij');
  assert.strictEqual(formEncode([['t', 'a b+c&d=e']]), 't=a+b%2Bc%26d%3De');
  assert.strictEqual(formEncode([['x', '1'], ['x', '2']]), 'x=1&x=2');
});

test('dictionaries', () => {
  const dict = dictionaries();
  assert.strictEqual(Object.keys(dict.subjects).length, 3, 'subjects incl. synthetic Zachowanie');
  assert.strictEqual(dict.teachers[500].fullName, 'Jan Testowy');
  assert.strictEqual(dict.teachers[501].fullName, 'Anna Przykładowa-Nowak');
  assert.strictEqual(dict.gradeCategories[1].weight, 3);
  assert.strictEqual(dict.gradeCategories[1].name, 'Sprawdzian');
  assert.strictEqual(dict.gradeCategories[2].weight, 2, 'string weight');
  assert.strictEqual(dict.gradeCategories[3].weight, 0, 'not counted → weight 0');
  assert.strictEqual(dict.classrooms[3], '12 sala matematyczna');
});

test('grades', () => {
  const grades = P.grades(json('grades.json'), dictionaries());
  const byId = (id) => grades.find((g) => g.id === id);
  assert.strictEqual(grades.length, 6);
  assert.strictEqual(byId(1001).comment, 'Bardzo dobra praca (dane fikcyjne)');
  assert.strictEqual(byId(1001).color, '#FF0000');
  assert.strictEqual(byId(1001).addedDate, '2025-10-01 10:00:00');
  assert.strictEqual(byId(1003).weight, 0, "'+' has no weight");
  assert.strictEqual(byId(1004).improvedById, 1005);
  assert.strictEqual(byId(1004).weight, 0, 'improved nb weight 0');
  assert.strictEqual(byId(1005).isImprovement, true);
  assert.strictEqual(byId(1006).kind, 'semesterProposed');
  const math = P.average(grades.filter((g) => g.subjectId === 10));
  assert.ok(Math.abs(math - (5 * 3 + 2.75 * 2) / 5) < 0.0001, 'weighted average math = 4.1');
  assert.strictEqual(P.average(grades.filter((g) => g.subjectId === 11)), 4.5);
});

test('timetable', () => {
  const week = P.timetable(json('timetable.json'), dictionaries());
  assert.strictEqual(week.length, 2);
  const monday = week[0].lessons;
  assert.strictEqual(monday.length, 3);
  assert.strictEqual(monday[0].teacher, 'Jan Testowy');
  assert.strictEqual(monday[0].classroom, '12 sala matematyczna');
  assert.strictEqual(monday[1].kind, 'cancelled');
  assert.strictEqual(monday[2].kind, 'change');
  assert.strictEqual(monday[2].oldSubject, 'Język polski');
  assert.deepStrictEqual(week[1].lessons, []);
});

test('days', () => {
  assert.strictEqual(Day.weekStart('2025-10-08'), '2025-10-06');
  assert.strictEqual(Day.weekStart('2025-10-12'), '2025-10-06', 'Sunday belongs to previous week');
  assert.strictEqual(Day.parse('2025-02-30'), null);
  assert.strictEqual(Day.addDays('2025-12-31', 1), '2026-01-01');
  assert.strictEqual(Day.defaultTimetableWeek(new Date(2025, 9, 11, 12)), '2025-10-13', 'Saturday shows next week');
  assert.strictEqual(Day.defaultTimetableWeek(new Date(2025, 9, 8, 12)), '2025-10-06');
});

test('attendance and lucky number', () => {
  const attendance = P.attendance(json('attendances.json'), dictionaries());
  assert.strictEqual(attendance.length, 2);
  const absence = attendance.find((a) => a.id === 't123');
  assert.strictEqual(absence.base, 'absent');
  assert.strictEqual(absence.subject, 'Matematyka');
  assert.strictEqual(absence.color, '#FF0000');
  assert.strictEqual(P.luckyNumber(json('lucky.json')).number, 13);

  const summary = summarizeAttendance(attendance);
  assert.strictEqual(summary.stats.all.total, 2);
  assert.strictEqual(summary.stats.all.absent, 1);
  assert.strictEqual(summary.stats.all.percent, 50);
  assert.strictEqual(summary.entries.length, 1, 'plain presence is left out');
});

test('Synergia messages HTML', () => {
  const inbox = messageList(html('inbox.html'), 'inbox');
  assert.strictEqual(inbox.length, 2);
  assert.strictEqual(inbox[0].id, '111111');
  assert.ok(inbox[0].unread && inbox[0].hasAttachments, 'first unread with attachment');
  assert.strictEqual(inbox[0].subject, 'Wycieczka klasowa', 'nbsp cleaned');
  assert.ok(!inbox[1].unread && !inbox[1].hasAttachments, 'second read, no attachment');

  const detail = messageDetail(html('message.html'), '111111');
  assert.strictEqual(detail.sender, 'Testowy Jan (Nauczyciel)');
  assert.strictEqual(detail.subject, 'Wycieczka klasowa');
  assert.strictEqual(detail.date, '2025-10-01 12:00:00');
  assert.strictEqual(detail.text, 'Dzień dobry,\nto jest fikcyjna wiadomość testowa.');
  assert.deepStrictEqual(detail.attachments, [{ id: '555', messageId: '111111', filename: 'regulamin.pdf' }]);

  assert.strictEqual(isLoggedOut(html('inbox.html')), false);
  assert.strictEqual(isLoggedOut('<a href="/loguj/portalRodzina">Zaloguj</a>'), true);
});

test('API error mapping', () => {
  assert.throws(() => throwError({ Code: 'TokenIsExpired' }, 401), { code: 'tokenExpired' });
  assert.throws(() => throwError({ Code: 'LuckyNumberIsNotActive' }, 403), { code: 'featureNotActive' });
  assert.throws(() => throwError({ Code: 'AccessDeny', Message: 'Student timetable is not public' }, 403), { code: 'timetableNotPublic' });
  assert.throws(() => throwError({}, 500), { code: 'api' });
});

test('demo data is complete and synthetic', () => {
  const { data } = demo.sync();
  assert.ok(data.grades.length > 20);
  assert.strictEqual(data.timetable.days.length, 5);
  assert.ok(data.attendance.stats.all.total > 0);
  assert.ok(demo.messages('inbox').messages.length > 0);
  assert.match(demo.message('900001').message.text, /fikcyjna/);
});
