'use strict';

// Attendance is the largest payload (one entry per lesson), so the TV gets statistics plus only
// the entries that aren't plain presence. Percent formula as in the iOS AttendanceView.

const COUNTED = ['absent', 'absentExcused', 'belated', 'released'];

function attendanceStats(entries) {
  const stats = { total: 0, absent: 0, absentExcused: 0, belated: 0, released: 0, percent: null };
  for (const e of entries) {
    stats.total++;
    if (COUNTED.includes(e.base)) stats[e.base]++;
  }
  const absences = stats.absent + stats.absentExcused;
  stats.percent = stats.total > 0 ? ((stats.total - absences) / stats.total) * 100 : null;
  return stats;
}

function summarizeAttendance(entries) {
  const bySubject = {};
  for (const e of entries) {
    const key = e.subject || '—';
    (bySubject[key] = bySubject[key] || []).push(e);
  }
  return {
    stats: {
      all: attendanceStats(entries),
      1: attendanceStats(entries.filter((e) => e.semester === 1)),
      2: attendanceStats(entries.filter((e) => e.semester === 2)),
    },
    bySubject: Object.keys(bySubject)
      .map((subject) => Object.assign({ subject }, attendanceStats(bySubject[subject])))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'pl')),
    entries: entries.filter((e) => e.base !== 'present'),
  };
}

module.exports = { attendanceStats, summarizeAttendance };
