'use strict';

// Demo mode (login "demo"): SYNTHETIC, GENERATED DATA ONLY. Every name, grade and message here is
// fake. It lets you try the TV app without a Librus account and is used for UI checks.

const Day = require('./day');
const { gradeValue } = require('./parsers');
const { summarizeAttendance } = require('./summary');

const LOGIN = 'demo';

const SUBJECTS = [
  { id: 1, name: 'Zachowanie', short: 'zach' },
  { id: 10, name: 'Matematyka', short: 'mat' },
  { id: 11, name: 'Język polski', short: 'pol' },
  { id: 12, name: 'Język angielski', short: 'ang' },
  { id: 13, name: 'Historia', short: 'his' },
  { id: 14, name: 'Biologia', short: 'bio' },
  { id: 15, name: 'Geografia', short: 'geo' },
  { id: 16, name: 'Fizyka', short: 'fiz' },
  { id: 17, name: 'Informatyka', short: 'inf' },
  { id: 18, name: 'Wychowanie fizyczne', short: 'wf' },
];
const TEACHERS = ['Jan Testowy', 'Anna Przykładowa', 'Ewa Fikcyjna', 'Piotr Demo', 'Maria Wzorcowa', 'Tomasz Próbny'];
const ROOMS = ['12', '14', '21 pracownia', '3', 'sala gim.', '7'];
const HOURS = [
  ['08:00', '08:45'], ['08:55', '09:40'], ['09:50', '10:35'], ['10:55', '11:40'],
  ['11:50', '12:35'], ['12:45', '13:30'], ['13:40', '14:25'],
];
const CATEGORIES = [
  { name: 'Sprawdzian', weight: 3, color: '#FF0000' },
  { name: 'Kartkówka', weight: 2, color: '#87CEFA' },
  { name: 'Odpowiedź ustna', weight: 2, color: '#32CD32' },
  { name: 'Praca domowa', weight: 1, color: '#DAA520' },
  { name: 'Aktywność', weight: 0, color: '#BA55D3' },
];
const GRADE_NAMES = ['5', '4', '4+', '3', '5-', '6', '3+', '4-', '2', '5', '+'];

// Small deterministic generator so the demo looks the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function teacherFor(subjectId) {
  return TEACHERS[subjectId % TEACHERS.length];
}

function schoolYearStart(today) {
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 9 ? 1 : 0);
  return `${year}-09-01`;
}

function semesterOf(day) {
  const month = Number(day.slice(5, 7));
  return month >= 2 && month < 9 ? 2 : 1;
}

function weekTimetable(weekStart) {
  const days = [];
  for (let d = 0; d < 5; d++) {
    const day = Day.addDays(weekStart, d);
    const random = rng(Number(day.replace(/-/g, '')));
    const count = 5 + Math.floor(random() * 3);
    const lessons = [];
    for (let n = 1; n <= count; n++) {
      const subject = SUBJECTS[1 + Math.floor(random() * (SUBJECTS.length - 1))];
      const roll = random();
      const lesson = {
        day, number: n, start: HOURS[n - 1][0], end: HOURS[n - 1][1],
        kind: 'normal', subject: subject.name, teacher: teacherFor(subject.id), classroom: pick(random, ROOMS),
        oldSubject: null, oldTeacher: null, otherDay: null, otherNumber: null,
      };
      if (roll < 0.05) lesson.kind = 'cancelled';
      else if (roll < 0.1) {
        lesson.kind = 'change';
        lesson.oldSubject = SUBJECTS[2].name;
        lesson.oldTeacher = teacherFor(SUBJECTS[2].id);
      }
      lessons.push(lesson);
    }
    days.push({ day, lessons });
  }
  return days;
}

function grades(today) {
  const random = rng(42);
  const start = schoolYearStart(today);
  const span = Math.max(1, Math.round((Date.parse(today) - Date.parse(start)) / 86400000));
  const list = [];
  let id = 5000;
  for (const subject of SUBJECTS.slice(1)) {
    const count = 3 + Math.floor(random() * 6);
    for (let i = 0; i < count; i++) {
      const name = pick(random, GRADE_NAMES);
      const category = pick(random, CATEGORIES);
      const day = Day.addDays(start, Math.floor(((i + random()) / count) * span));
      list.push({
        id: id++, name, kind: 'normal', value: gradeValue(name),
        weight: name === '+' ? 0 : category.weight,
        category: category.name, color: category.color,
        comment: random() < 0.25 ? 'Komentarz testowy (dane fikcyjne)' : null,
        semester: semesterOf(day), teacher: teacherFor(subject.id), subjectId: subject.id,
        addedDate: `${day} 1${Math.floor(random() * 4)}:00:00`, isImprovement: false, improvedById: null,
      });
    }
  }
  list.push({
    id: id++, name: 'bdb', kind: 'semesterProposed', value: null, weight: 0, category: 'Zachowanie', color: '#2196F3',
    comment: null, semester: 1, teacher: TEACHERS[0], subjectId: 1, addedDate: `${today} 08:00:00`,
    isImprovement: false, improvedById: null,
  });
  return list;
}

function events(today) {
  const random = rng(7);
  const kinds = [['Sprawdzian', '#FF0000'], ['Kartkówka', '#87CEFA'], ['Zadanie domowe', '#DAA520'], ['Wycieczka', '#32CD32']];
  const list = [];
  for (let i = 0; i < 10; i++) {
    const kind = pick(random, kinds);
    const subject = SUBJECTS[1 + Math.floor(random() * (SUBJECTS.length - 1))];
    const day = Day.addDays(today, -6 + Math.floor(random() * 24));
    if (Day.weekday(day) >= 5) continue;
    list.push({
      id: 7000 + i, day, time: null, lessonNumber: 1 + Math.floor(random() * 6),
      topic: `${kind[0]}: rozdział ${1 + Math.floor(random() * 9)} (dane fikcyjne)`,
      category: kind[0], color: kind[1], subject: subject.name, teacher: teacherFor(subject.id),
      addedDate: `${Day.addDays(day, -7)} 12:00:00`,
    });
  }
  return list.sort((a, b) => (a.day < b.day ? -1 : 1));
}

function attendance(today) {
  const random = rng(99);
  const start = schoolYearStart(today);
  const types = [
    ['obecność', 'ob', 'present', null], ['nieobecność', 'nb', 'absent', '#FF0000'],
    ['nieobecność uspr.', 'u', 'absentExcused', '#FFA07A'], ['spóźnienie', 'sp', 'belated', '#DAA520'],
    ['zwolnienie', 'zw', 'released', '#87CEFA'],
  ];
  const list = [];
  for (let day = start; day < today; day = Day.addDays(day, 1)) {
    if (Day.weekday(day) >= 5) continue;
    for (let n = 1; n <= 6; n++) {
      const roll = random();
      const type = roll < 0.9 ? types[0] : roll < 0.93 ? types[1] : roll < 0.97 ? types[2] : roll < 0.99 ? types[3] : types[4];
      const subject = SUBJECTS[1 + Math.floor(random() * (SUBJECTS.length - 1))];
      list.push({
        id: `${day}-${n}`, day, lessonNumber: n, typeName: type[0], typeShort: type[1], base: type[2], color: type[3],
        subject: subject.name, teacher: teacherFor(subject.id), semester: semesterOf(day),
      });
    }
  }
  return list.reverse();
}

function data(weekStart) {
  const today = Day.today();
  const week = Day.parse(weekStart) || Day.defaultTimetableWeek();
  return {
    fetchedAt: Date.now(),
    studentName: 'Uczeń Demonstracyjny',
    accountName: 'Rodzic Demonstracyjny',
    subjects: SUBJECTS.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    grades: grades(today),
    events: events(today),
    attendance: summarizeAttendance(attendance(today)),
    notices: [
      { id: 1, day: Day.addDays(today, -3), kind: 'positive', category: 'Pochwała', text: 'Pomoc w organizacji apelu (dane fikcyjne).', teacher: TEACHERS[1] },
      { id: 2, day: Day.addDays(today, -20), kind: 'negative', category: 'Uwaga', text: 'Brak stroju na zajęciach (dane fikcyjne).', teacher: TEACHERS[4] },
    ],
    announcements: [
      { id: 'a1', subject: 'Dzień otwarty szkoły', text: 'Zapraszamy na dzień otwarty w sobotę o 10:00. To jest fikcyjne ogłoszenie demonstracyjne.', startDay: Day.addDays(today, -2), endDay: Day.addDays(today, 5), author: TEACHERS[0], read: false },
      { id: 'a2', subject: 'Zebranie z rodzicami', text: 'Zebranie odbędzie się w sali 12. Treść demonstracyjna.', startDay: Day.addDays(today, -10), endDay: Day.addDays(today, 1), author: TEACHERS[2], read: true },
    ],
    luckyNumber: { day: today, number: 13 },
    timetable: { weekStart: week, days: weekTimetable(week) },
    warnings: [],
  };
}

const MESSAGES = [
  { id: '900001', correspondent: 'Testowy Jan (Nauczyciel)', subject: 'Wycieczka klasowa', hasAttachments: true,
    text: 'Dzień dobry,\n\nw przyszły piątek planujemy wycieczkę do muzeum. Prosimy o zgody do środy.\n\nTo jest fikcyjna wiadomość demonstracyjna.' },
  { id: '900002', correspondent: 'Przykładowa Anna (Wychowawca)', subject: 'Zebranie z rodzicami', hasAttachments: false,
    text: 'Szanowni Państwo,\n\nzapraszam na zebranie w czwartek o 17:30.\n\nWiadomość demonstracyjna, dane fikcyjne.' },
  { id: '900003', correspondent: 'Sekretariat (Administracja)', subject: 'Legitymacje szkolne', hasAttachments: false,
    text: 'Legitymacje są do odbioru w sekretariacie.\n\n(dane fikcyjne)' },
];

module.exports = {
  LOGIN,
  login() {
    return { profile: { login: LOGIN, studentName: 'Uczeń Demonstracyjny', isParent: true }, session: { cookies: null, sessionAt: 0 } };
  },
  sync(weekStart) {
    return { data: data(weekStart), session: { cookies: null, sessionAt: 0 } };
  },
  timetable(weekStart) {
    const week = Day.weekStart(Day.parse(weekStart) || Day.defaultTimetableWeek());
    return { timetable: { weekStart: week, days: weekTimetable(week) }, session: { cookies: null, sessionAt: 0 } };
  },
  messages(folder) {
    const today = Day.today();
    const list = folder === 'sent' ? [] : MESSAGES.map((m, i) => ({
      id: m.id, folder: 'inbox', correspondent: m.correspondent, subject: m.subject,
      date: `${Day.addDays(today, -i * 3)} 1${i}:15:00`, unread: i === 0, hasAttachments: m.hasAttachments,
    }));
    return { messages: list, session: { cookies: null, sessionAt: 0 } };
  },
  message(id) {
    const m = MESSAGES.find((x) => x.id === String(id)) || MESSAGES[0];
    return {
      message: {
        id: m.id, sender: m.correspondent, subject: m.subject, date: `${Day.today()} 10:15:00`, text: m.text,
        attachments: m.hasAttachments ? [{ id: '1', messageId: m.id, filename: 'zgoda-na-wycieczke.pdf' }] : [],
      },
      session: { cookies: null, sessionAt: 0 },
    };
  },
};
