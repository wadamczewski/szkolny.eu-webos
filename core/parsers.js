'use strict';

// Pure JSON → model mapping, ported from LibrusParsers.swift (itself a port of the
// `LibrusApi*.kt` endpoint classes of szkolny-android). No networking, checked against fixtures.

const { str, int, dbl, bool, arr, obj, refId, isNull } = require('./json');
const Day = require('./day');

/** "KOWALSKI JAN" / "jan kowalski" → "Jan Kowalski" (port of `fixName()`). */
function fixName(s) {
  return String(s || '')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-'))
    .join(' ');
}

function trim(s) {
  return String(s || '').trim();
}

function emptyDictionaries() {
  return {
    subjects: {},
    teachers: {},
    classrooms: {},
    gradeCategories: {},
    gradeComments: {},
    eventCategories: {},
    attendanceTypes: {},
    noticeCategories: {},
    lessons: {},
  };
}

function subjectName(dict, id) {
  return id !== null && dict.subjects[id] ? dict.subjects[id].name : null;
}

function teacherName(dict, id) {
  return id !== null && dict.teachers[id] ? dict.teachers[id].fullName : null;
}

// MARK: Dictionaries

function subjects(json) {
  const result = {};
  for (const s of arr(json.Subjects)) {
    const id = int(s.Id);
    if (id === null) continue;
    result[id] = { id, name: str(s.Name) || '', short: str(s.Short) || '' };
  }
  if (!result[1]) result[1] = { id: 1, name: 'Zachowanie', short: 'zach' };
  return result;
}

function teachers(json) {
  const result = {};
  for (const u of arr(json.Users)) {
    const id = int(u.Id);
    if (id === null) continue;
    const firstName = fixName(str(u.FirstName));
    const lastName = fixName(str(u.LastName));
    result[id] = { id, firstName, lastName, fullName: `${firstName} ${lastName}`.trim() };
  }
  return result;
}

function classrooms(json) {
  const result = {};
  for (const c of arr(json.Classrooms)) {
    const id = int(c.Id);
    if (id === null) continue;
    const name = str(c.Name) || '';
    const symbol = str(c.Symbol) || '';
    result[id] = !symbol || name.toLowerCase().includes(symbol.toLowerCase()) ? name : `${symbol} ${name}`;
  }
  return result;
}

function gradeCategories(json) {
  const result = {};
  for (const c of arr(json.Categories)) {
    const id = int(c.Id);
    if (id === null) continue;
    result[id] = {
      name: trim(str(c.Name)),
      weight: bool(c.CountToTheAverage) === true ? dbl(c.Weight) || 0 : 0,
      color: librusColor(refId(c.Color)),
    };
  }
  return result;
}

function gradeComments(json) {
  const result = {};
  for (const c of arr(json.Comments)) {
    const id = int(c.Id);
    const text = str(c.Text);
    if (id === null || text === null) continue;
    result[id] = text.trim();
  }
  return result;
}

function eventCategories(json) {
  const result = {};
  for (const c of arr(json.Categories)) {
    const id = int(c.Id);
    if (id === null) continue;
    result[id] = { name: str(c.Name) || '', color: librusColor(refId(c.Color)) };
  }
  return result;
}

function attendanceTypes(json) {
  const result = {};
  for (const t of arr(json.Types)) {
    const id = int(t.Id);
    if (id === null) continue;
    const standard = bool(t.Standard) || false;
    const standardType = refId(t.StandardType);
    let base;
    switch (standardType !== null ? standardType : id) {
      case 1: base = 'absent'; break;
      case 2: base = 'belated'; break;
      case 3: base = 'absentExcused'; break;
      case 4: base = 'released'; break;
      default: base = standard ? 'present' : 'presentCustom';
    }
    const rgb = str(t.ColorRGB);
    result[id] = { name: str(t.Name) || '', short: str(t.Short) || '?', base, color: rgb ? `#${rgb}` : null };
  }
  return result;
}

function noticeCategories(json) {
  const result = {};
  for (const c of arr(json.Categories)) {
    const id = int(c.Id);
    if (id === null) continue;
    result[id] = str(c.CategoryName) || '';
  }
  return result;
}

function lessons(json) {
  const result = {};
  for (const l of arr(json.Lessons)) {
    const id = int(l.Id);
    if (id === null) continue;
    result[id] = { subjectId: refId(l.Subject), teacherId: refId(l.Teacher) };
  }
  return result;
}

// MARK: Data

const GRADE_KINDS = {
  normal: 'Ocena',
  semesterProposed: 'Przewidywana śródroczna',
  semesterFinal: 'Śródroczna',
  yearProposed: 'Przewidywana roczna',
  yearFinal: 'Roczna',
};

function grades(json, dict) {
  const list = [];
  const improvements = {}; // old grade id → new grade id
  for (const g of arr(json.Grades)) {
    const id = int(g.Id);
    const semester = int(g.Semester);
    if (id === null || semester === null) continue;
    const name = str(g.Grade) || '';
    const categoryId = refId(g.Category);
    const category = categoryId !== null ? dict.gradeCategories[categoryId] : null;
    let kind;
    if (bool(g.IsConstituent) === true) kind = 'normal';
    else if (bool(g.IsSemester) === true) kind = 'semesterFinal';
    else if (bool(g.IsSemesterProposition) === true) kind = 'semesterProposed';
    else if (bool(g.IsFinal) === true) kind = 'yearFinal';
    else if (bool(g.IsFinalProposition) === true) kind = 'yearProposed';
    else kind = 'normal';
    const zeroWeight = ['-', '+', 'np', 'bz'].includes(name.toLowerCase());
    const commentId = arr(g.Comments).length ? refId(arr(g.Comments)[0]) : null;
    const oldId = refId(g.Improvement);
    if (oldId !== null) improvements[oldId] = id;
    list.push({
      id,
      name,
      kind,
      value: gradeValue(name),
      weight: zeroWeight ? 0 : category ? category.weight : 0,
      category: category ? category.name : '',
      color: category ? category.color : null,
      comment: commentId !== null && dict.gradeComments[commentId] !== undefined ? dict.gradeComments[commentId] : null,
      semester,
      teacher: teacherName(dict, refId(g.AddedBy)),
      subjectId: refId(g.Subject) !== null ? refId(g.Subject) : -1,
      addedDate: Day.dateTime(str(g.AddDate)),
      isImprovement: !isNull(g.Improvement),
      improvedById: null,
    });
  }
  for (const grade of list) {
    const by = improvements[grade.id];
    grade.improvedById = by !== undefined ? by : null;
    if (grade.improvedById !== null && grade.name.toLowerCase() === 'nb') grade.weight = 0;
  }
  return list;
}

function timetable(json, dict) {
  const days = obj(json.Timetable);
  if (!days) return [];
  const result = [];
  for (const dateString of Object.keys(days)) {
    const day = Day.parse(dateString);
    if (!day) continue;
    const list = [];
    for (const slot of arr(days[dateString])) {
      for (const l of arr(slot)) {
        const lesson = parseLesson(day, l, dict);
        if (lesson) list.push(lesson);
      }
    }
    list.sort((a, b) => a.number - b.number || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    result.push({ day, lessons: list });
  }
  return result.sort((a, b) => (a.day < b.day ? -1 : 1));
}

function parseLesson(day, l, dict) {
  const number = int(l.LessonNo);
  const start = str(l.HourFrom);
  const end = str(l.HourTo);
  if (number === null || start === null || end === null) return null;
  const isSubstitution = bool(l.IsSubstitutionClass) || false;
  const isCancelled = bool(l.IsCanceled) || false;
  const subjectObj = obj(l.Subject) || {};
  const teacherObj = obj(l.Teacher) || {};
  const subject = str(subjectObj.Name) || subjectName(dict, refId(l.Subject));
  const inlineTeacher = [str(teacherObj.FirstName), str(teacherObj.LastName)].filter(Boolean).join(' ');
  const teacher = teacherName(dict, refId(l.Teacher)) || inlineTeacher || null;
  const classroomId = refId(l.Classroom);
  const classroom = classroomId !== null && dict.classrooms[classroomId] !== undefined ? dict.classrooms[classroomId] : null;
  const base = { day, number, start, end, subject, teacher, classroom, oldSubject: null, oldTeacher: null, otherDay: null, otherNumber: null };

  if (isSubstitution && isCancelled) {
    // Lesson moved away from here.
    return Object.assign(base, { kind: 'shiftedSource', otherDay: Day.parse(str(l.NewDate)), otherNumber: int(l.NewLessonNo) });
  }
  if (isSubstitution) {
    const orgDay = Day.parse(str(l.OrgDate));
    const orgNumber = int(l.OrgLessonNo);
    const moved = orgDay !== null && (orgDay !== day || orgNumber !== number);
    return Object.assign(base, {
      kind: moved ? 'shiftedTarget' : 'change',
      oldSubject: subjectName(dict, refId(l.OrgSubject)),
      oldTeacher: teacherName(dict, refId(l.OrgTeacher)),
      otherDay: moved ? orgDay : null,
      otherNumber: moved ? orgNumber : null,
    });
  }
  return Object.assign(base, { kind: isCancelled ? 'cancelled' : 'normal' });
}

function events(json, dict) {
  const result = [];
  for (const e of arr(json.HomeWorks)) {
    const id = int(e.Id);
    const day = Day.parse(str(e.Date));
    if (id === null || !day) continue;
    let topic = trim(str(e.Content));
    const online = obj(e.onlineLessonUrl) || {};
    const url = str(online.url);
    if (url) {
      const text = str(online.text);
      topic += '\n\n' + (text ? `${text} - ` : '') + url;
    }
    const categoryId = refId(e.Category);
    const category = categoryId !== null ? dict.eventCategories[categoryId] : null;
    const time = str(e.TimeFrom);
    result.push({
      id,
      day,
      time: time ? time.slice(0, 5) : null,
      lessonNumber: int(e.LessonNo),
      topic,
      category: category ? category.name : 'Wydarzenie',
      color: category ? category.color : null,
      subject: subjectName(dict, refId(e.Subject)),
      teacher: teacherName(dict, refId(e.CreatedBy)),
      addedDate: Day.dateTime(str(e.AddDate)),
    });
  }
  return result.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

function attendance(json, dict) {
  const result = [];
  for (const a of arr(json.Attendances)) {
    const id = str(a.Id);
    const number = int(a.LessonNo);
    const day = Day.parse(str(a.Date));
    const semester = int(a.Semester);
    const typeId = refId(a.Type);
    if (id === null || number === null || !day || semester === null || typeId === null) continue;
    const type = dict.attendanceTypes[typeId];
    const lessonId = refId(a.Lesson);
    const lesson = lessonId !== null ? dict.lessons[lessonId] : null;
    const addedBy = refId(a.AddedBy);
    result.push({
      id,
      day,
      lessonNumber: number,
      typeName: type ? type.name : 'nieznany rodzaj',
      typeShort: type ? type.short : '?',
      base: type ? type.base : 'unknown',
      color: type ? type.color : null,
      subject: subjectName(dict, lesson ? lesson.subjectId : null),
      teacher: teacherName(dict, addedBy !== null ? addedBy : lesson ? lesson.teacherId : null),
      semester,
    });
  }
  return result.sort((a, b) => (a.day !== b.day ? (a.day < b.day ? 1 : -1) : b.lessonNumber - a.lessonNumber));
}

function notices(json, dict) {
  const result = [];
  for (const n of arr(json.Notes)) {
    const id = int(n.Id);
    const day = Day.parse(str(n.Date));
    if (id === null || !day) continue;
    const positive = int(n.Positive);
    const categoryId = refId(n.Category);
    result.push({
      id,
      day,
      kind: positive === 0 ? 'negative' : positive === 1 ? 'positive' : 'neutral',
      category: (categoryId !== null && dict.noticeCategories[categoryId]) || '',
      text: str(n.Text) || '',
      teacher: teacherName(dict, refId(n.Teacher)),
    });
  }
  return result.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

function announcements(json, dict) {
  const result = [];
  for (const a of arr(json.SchoolNotices)) {
    const id = str(a.Id);
    if (id === null) continue;
    result.push({
      id,
      subject: str(a.Subject) || '',
      text: str(a.Content) || '',
      startDay: Day.parse(str(a.StartDate)),
      endDay: Day.parse(str(a.EndDate)),
      author: teacherName(dict, refId(a.AddedBy)),
      read: bool(a.WasRead) || false,
    });
  }
  return result.sort((a, b) => ((a.startDay || '') < (b.startDay || '') ? 1 : (a.startDay || '') > (b.startDay || '') ? -1 : 0));
}

function luckyNumber(json) {
  const l = obj(json.LuckyNumber) || {};
  const number = int(l.LuckyNumber);
  const day = Day.parse(str(l.LuckyNumberDay));
  return number !== null && day ? { day, number } : null;
}

/** Librus color ids → hex (table from `DataLibrus.getColor`). */
const COLORS = {
  1: '#F0E68C', 2: '#87CEFA', 3: '#B0C4DE', 4: '#F0F8FF', 5: '#F0FFFF', 6: '#F5F5DC',
  7: '#FFEBCD', 8: '#FFF8DC', 9: '#A9A9A9', 10: '#BDB76B', 11: '#8FBC8F', 12: '#DCDCDC',
  13: '#DAA520', 14: '#E6E6FA', 15: '#FFA07A', 16: '#32CD32', 17: '#66CDAA', 18: '#66CDAA',
  19: '#C0C0C0', 20: '#D2B48C', 21: '#3333FF', 22: '#7B68EE', 23: '#BA55D3', 24: '#FFB6C1',
  25: '#FF1493', 26: '#DC143C', 27: '#FF0000', 28: '#FF8C00', 29: '#FFD700', 30: '#ADFF2F',
  31: '#7CFC00',
};

function librusColor(id) {
  return (id !== null && COLORS[id]) || '#2196F3';
}

// MARK: Grade math

const PLUS_VALUE = 0.5;
const MINUS_VALUE = 0.25;

/** "4+" → 4.5, "3-" → 2.75, "np" → null. */
function gradeValue(grade) {
  const trimmed = String(grade || '').trim();
  const base = /^[0-6]/.test(trimmed) ? Number(trimmed[0]) : null;
  if (base === null) return null;
  const rest = trimmed.slice(1);
  if (rest === '') return base;
  if (rest === '+') return base + PLUS_VALUE;
  if (rest === '-') return base - MINUS_VALUE;
  const decimal = trimmed.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(decimal) ? Number(decimal) : base;
}

function countsToAverage(g) {
  return g.kind === 'normal' && g.weight > 0 && g.value !== null;
}

/** Weighted average of grades that count (normal grades with weight > 0). */
function average(list) {
  const counted = list.filter(countsToAverage);
  const weights = counted.reduce((s, g) => s + g.weight, 0);
  if (weights <= 0) return null;
  return counted.reduce((s, g) => s + g.value * g.weight, 0) / weights;
}

module.exports = {
  fixName,
  emptyDictionaries,
  subjects,
  teachers,
  classrooms,
  gradeCategories,
  gradeComments,
  eventCategories,
  attendanceTypes,
  noticeCategories,
  lessons,
  grades,
  timetable,
  events,
  attendance,
  notices,
  announcements,
  luckyNumber,
  librusColor,
  gradeValue,
  average,
  GRADE_KINDS,
};
