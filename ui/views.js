// Sections of the app. Each view renders into the content area from `app.data`.

import { h, f, icon, clear, append } from './dom.js';
import { focusFirst } from './nav.js';
import * as fmt from './format.js';
import * as store from './store.js';

const KIND_LABEL = {
  normal: 'Ocena',
  semesterProposed: 'Przewidywana śródroczna',
  semesterFinal: 'Śródroczna',
  yearProposed: 'Przewidywana roczna',
  yearFinal: 'Roczna',
};
const LESSON_LABEL = { cancelled: 'odwołana', change: 'zastępstwo', shiftedSource: 'przeniesiona', shiftedTarget: 'przeniesiona tutaj' };
const NOTICE_LABEL = { positive: 'Pozytywna', negative: 'Negatywna', neutral: 'Neutralna' };

function header(title, subtitle, actions) {
  return h(
    'header',
    { class: 'view-header' },
    h('div', null, h('h1', null, title), subtitle ? h('p', { class: 'subtitle' }, subtitle) : null),
    actions ? h('div', { class: 'view-actions', 'data-zone': 'actions' }, actions) : null
  );
}

function empty(text) {
  return h('div', { class: 'empty' }, text);
}

function loading(el, title) {
  el.append(header(title), h('div', { class: 'empty' }, h('span', { class: 'spinner' }), 'Pobieranie danych z Librusa…'));
}

function toggle(label, selected, key, onclick) {
  return f('button', { class: `button toggle ${selected ? 'selected' : ''}`, key, onclick }, label);
}

function gradeChip(grade, large) {
  return h(
    'span',
    {
      class: `grade-chip ${large ? 'large' : ''} ${grade.improvedById ? 'improved' : ''} ${grade.kind !== 'normal' ? 'final' : ''}`,
      style: { borderColor: grade.color || 'var(--line)' },
    },
    grade.name
  );
}

function colorBar(color) {
  return h('span', { class: 'color-bar', style: { background: color || 'var(--accent)' } });
}

// MARK: timetable helpers

function lessonsOn(app, day) {
  const days = app.weeks[fmt.weekStart(day)];
  const entry = days && days.find((d) => d.day === day);
  return entry ? entry.lessons : null;
}

/** Today's plan while lessons are on, else the next day with lessons in the loaded weeks. */
function upcomingSchoolDay(app) {
  const t = fmt.today();
  const nowMin = fmt.minutes(fmt.time());
  for (let i = 0; i < 14; i++) {
    const day = fmt.addDays(t, i);
    const lessons = lessonsOn(app, day);
    if (!lessons || !lessons.length) continue;
    if (i === 0 && fmt.minutes(lessons[lessons.length - 1].end) < nowMin) continue;
    return { day, lessons };
  }
  return null;
}

/** "zastępstwo · zamiast: Język polski", "przeniesiona na: 4 lis, lekcja 3"… */
function lessonStatus(l) {
  const parts = [LESSON_LABEL[l.kind]];
  if (l.kind === 'change' && l.oldSubject) parts.push(`zamiast: ${l.oldSubject}`);
  if (l.otherDay) parts.push(`${l.kind === 'shiftedSource' ? 'na' : 'z'}: ${fmt.dayShort(l.otherDay)}, lekcja ${l.otherNumber || '?'}`);
  return parts.join(' · ');
}

function lessonState(lesson) {
  if (lesson.day !== fmt.today()) return '';
  const now = fmt.minutes(fmt.time());
  if (now >= fmt.minutes(lesson.start) && now < fmt.minutes(lesson.end)) return 'now';
  return now >= fmt.minutes(lesson.end) ? 'past' : '';
}

// MARK: Start

function home(el, app) {
  const d = app.data;
  if (!d) return loading(el, 'Start');
  const t = fmt.today();
  el.append(header(`${fmt.dateLong()}`, [d.studentName, d.accountName ? `konto: ${d.accountName}` : null].filter(Boolean).join(' · ')));

  const plan = upcomingSchoolDay(app);
  const nextIndex = plan && plan.day === t ? plan.lessons.findIndex((l) => fmt.minutes(l.end) > fmt.minutes(fmt.time())) : -1;
  const lessonsCard = f(
    'section',
    { class: 'card span-rows', key: 'home-plan', onclick: () => app.go('timetable', true) },
    h('h2', null, plan ? `Plan: ${fmt.dayLong(plan.day)}` : 'Plan lekcji'),
    plan
      ? h(
          'ol',
          { class: 'mini-lessons' },
          plan.lessons.map((l, i) =>
            h(
              'li',
              { class: `${l.kind} ${lessonState(l)} ${i === nextIndex ? 'next' : ''}` },
              h('span', { class: 'no' }, l.number),
              h('span', { class: 'hours' }, `${l.start}–${l.end}`),
              h('span', { class: 'what' }, l.subject || '—', LESSON_LABEL[l.kind] ? h('em', null, ` · ${LESSON_LABEL[l.kind]}`) : null),
              h('span', { class: 'room' }, l.classroom || '')
            )
          )
        )
      : empty('Brak lekcji w najbliższych dniach.')
  );

  const lucky = d.luckyNumber;
  const luckyCard = f(
    'section',
    { class: 'card lucky', key: 'home-lucky' },
    h('h2', null, 'Szczęśliwy numerek'),
    h('div', { class: 'big-number' }, lucky ? lucky.number : '—'),
    h('p', { class: 'muted' }, lucky ? fmt.dayLong(lucky.day) : 'niedostępny')
  );

  const upcoming = d.events.filter((e) => e.day >= t && e.day <= fmt.addDays(t, 14)).slice(0, 4);
  const eventsCard = f(
    'section',
    { class: 'card', key: 'home-events', onclick: () => app.go('agenda', true) },
    h('h2', null, 'Najbliższe w terminarzu'),
    upcoming.length
      ? h(
          'ul',
          { class: 'mini-list' },
          upcoming.map((e) =>
            h('li', null, colorBar(e.color), h('span', { class: 'two-line' }, h('strong', null, `${e.category}${e.subject ? ` · ${e.subject}` : ''}`), h('small', null, `${fmt.dayCompact(e.day)}${e.lessonNumber ? `, lekcja ${e.lessonNumber}` : ''}`)))
          )
        )
      : empty('Nic zaplanowanego na 2 tygodnie.')
  );

  const subjects = Object.fromEntries(d.subjects.map((s) => [s.id, s.name]));
  const recent = d.grades
    .filter((g) => g.addedDate)
    .sort((a, b) => (a.addedDate < b.addedDate ? 1 : -1))
    .slice(0, 6);
  const gradesCard = f(
    'section',
    { class: 'card', key: 'home-grades', onclick: () => app.go('grades', true) },
    h('h2', null, 'Ostatnie oceny'),
    recent.length
      ? h('ul', { class: 'mini-list' }, recent.map((g) => h('li', null, gradeChip(g), h('span', { class: 'what' }, subjects[g.subjectId] || '—'), h('span', { class: 'when' }, fmt.addedShort(g.addedDate)))))
      : empty('Brak ocen.')
  );

  const stats = d.attendance.stats.all;
  const attendanceCard = f(
    'section',
    { class: 'card', key: 'home-attendance', onclick: () => app.go('attendance', true) },
    h('h2', null, 'Frekwencja'),
    h('div', { class: 'big-number medium' }, fmt.percent(stats.percent)),
    h('p', { class: 'muted' }, `nieobecności: ${stats.absent + stats.absentExcused} · spóźnienia: ${stats.belated}`)
  );

  const unreadAnnouncements = d.announcements.filter((a) => !a.read);
  const inbox = app.messages.inbox ? app.messages.inbox.list : null;
  const unreadMessages = inbox ? inbox.filter((m) => m.unread).length : null;
  const infoCard = f(
    'section',
    { class: 'card span-cols', key: 'home-info', onclick: () => app.go(unreadMessages ? 'messages' : 'announcements', true) },
    h('h2', null, 'Wiadomości i ogłoszenia'),
    h(
      'ul',
      { class: 'mini-list horizontal' },
      h('li', null, icon('mail'), h('span', { class: 'what' }, unreadMessages === null ? 'Wiadomości' : `Nowe wiadomości: ${unreadMessages}`)),
      h('li', null, icon('megaphone'), h('span', { class: 'what' }, `Nowe ogłoszenia: ${unreadAnnouncements.length}`)),
      d.notices[0] ? h('li', null, icon('flag'), h('span', { class: 'what' }, `Ostatnia uwaga: ${fmt.dayShort(d.notices[0].day)}`)) : null
    )
  );

  el.append(h('div', { class: 'home-grid' }, lessonsCard, eventsCard, gradesCard, luckyCard, attendanceCard, infoCard));
}

// MARK: Plan lekcji

function timetable(el, app) {
  const start = app.weekStart;
  const change = (days) => {
    app.weekStart = days === 0 ? fmt.defaultWeek() : fmt.addDays(start, days);
    app.render();
  };
  el.append(
    header('Plan lekcji', fmt.weekRange(start), [
      f('button', { class: 'button icon-button', key: 'week-prev', onclick: () => change(-7), title: 'Poprzedni tydzień' }, icon('left')),
      f('button', { class: 'button', key: 'week-now', onclick: () => change(0) }, 'Bieżący tydzień'),
      f('button', { class: 'button icon-button', key: 'week-next', onclick: () => change(7), title: 'Następny tydzień' }, icon('right')),
    ])
  );
  const days = app.weeks[start];
  if (!days) {
    el.append(empty('Wczytywanie tygodnia…'));
    app
      .loadWeek(start)
      .then(() => { if (app.section === 'timetable' && app.weekStart === start) app.render(); })
      .catch((e) => {
        if (app.section !== 'timetable' || app.weekStart !== start) return;
        clear(el.querySelector('.empty')).append(e.message);
      });
    return;
  }
  const weekDays = [0, 1, 2, 3, 4].map((i) => fmt.addDays(start, i));
  for (const extra of [5, 6]) {
    const day = fmt.addDays(start, extra);
    const entry = days.find((x) => x.day === day);
    if (entry && entry.lessons.length) weekDays.push(day);
  }
  const numbers = new Set();
  for (const entry of days) for (const l of entry.lessons) numbers.add(l.number);
  if (!numbers.size) {
    el.append(empty('Brak lekcji w tym tygodniu.'));
    return;
  }
  const sorted = Array.from(numbers).sort((a, b) => a - b);
  const grid = h('div', { class: 'timetable scroll', 'data-zone': 'timetable', style: { gridTemplateColumns: `56px repeat(${weekDays.length}, minmax(0, 1fr))` } });
  grid.append(h('div', { class: 'tt-corner' }));
  const t = fmt.today();
  for (const day of weekDays) {
    grid.append(h('div', { class: `tt-day ${day === t ? 'today' : ''}` }, h('strong', null, fmt.dayName(day)), h('span', null, fmt.dayShort(day))));
  }
  for (const number of sorted) {
    grid.append(h('div', { class: 'tt-no' }, number));
    for (const day of weekDays) {
      const entry = days.find((x) => x.day === day);
      const lessons = entry ? entry.lessons.filter((l) => l.number === number) : [];
      const cell = h('div', { class: `tt-cell ${day === t ? 'today' : ''}` });
      for (const l of lessons) {
        cell.append(
          f(
            'div',
            { class: `lesson ${l.kind} ${lessonState(l)}`, key: `l-${day}-${l.number}-${l.subject}-${l.kind}` },
            h('span', { class: 'hours' }, `${l.start}–${l.end}`),
            h('strong', { class: 'lesson-subject' }, l.subject || '—'),
            h('span', { class: 'lesson-meta' }, [l.classroom ? `s. ${l.classroom}` : null, l.teacher].filter(Boolean).join(' · ')),
            LESSON_LABEL[l.kind] ? h('span', { class: 'lesson-status' }, lessonStatus(l)) : null
          )
        );
      }
      grid.append(cell);
    }
  }
  el.append(grid);
}

// MARK: Oceny

function grades(el, app) {
  const d = app.data;
  if (!d) return loading(el, 'Oceny');
  if (!app.ui.semester) {
    const latest = d.grades.filter((g) => g.addedDate).sort((a, b) => (a.addedDate < b.addedDate ? 1 : -1))[0];
    app.ui.semester = latest ? latest.semester : 1;
  }
  const semester = app.ui.semester;
  const setSemester = (s) => { app.ui.semester = s; app.render(); };
  const rows = d.subjects
    .map((s) => ({ subject: s, grades: d.grades.filter((g) => g.subjectId === s.id && g.semester === semester).sort((a, b) => ((a.addedDate || '') < (b.addedDate || '') ? -1 : 1)) }))
    .filter((r) => r.grades.length);
  const averages = rows.map((r) => average(r.grades)).filter((a) => a !== null);
  const overall = averages.length ? averages.reduce((s, a) => s + a, 0) / averages.length : null;
  el.append(
    header('Oceny', `Średnia ze średnich: ${fmt.average(overall)}`, [
      toggle('Semestr 1', semester === 1, 'sem-1', () => setSemester(1)),
      toggle('Semestr 2', semester === 2, 'sem-2', () => setSemester(2)),
    ])
  );
  if (!rows.length) {
    el.append(empty(`Brak ocen w semestrze ${semester}.`));
    return;
  }
  const detail = h('div', { class: 'pane detail scroll', 'data-zone': 'grade-list' });
  const list = h('div', { class: 'pane list scroll', 'data-zone': 'subjects' });
  const show = (row) => {
    clear(detail);
    const finals = row.grades.filter((g) => g.kind !== 'normal');
    append(detail, [
      h('div', { class: 'detail-head' }, h('h2', null, row.subject.name), h('div', { class: 'avg' }, h('small', null, 'średnia'), fmt.average(average(row.grades)))),
      finals.length ? h('div', { class: 'finals' }, finals.map((g) => h('span', { class: 'final-pill' }, `${KIND_LABEL[g.kind]}: `, h('strong', null, g.name)))) : null,
      row.grades
        .filter((g) => g.kind === 'normal')
        .slice()
        .reverse()
        .map((g) =>
          f(
            'div',
            { class: 'row grade-row', key: `g-${g.id}` },
            gradeChip(g, true),
            h(
              'div',
              { class: 'row-main' },
              h('strong', null, g.category || 'Ocena'),
              h('small', null, [`waga ${fmt.weight(g.weight)}`, fmt.addedShort(g.addedDate), g.teacher, g.improvedById ? 'poprawiona' : null, g.isImprovement ? 'poprawa' : null].filter(Boolean).join(' · ')),
              g.comment ? h('p', { class: 'comment' }, g.comment) : null
            )
          )
        ),
    ]);
  };
  for (const row of rows) {
    const proposed = row.grades.filter((g) => g.kind !== 'normal').pop();
    list.append(
      f(
        'div',
        { class: 'row subject-row', key: `s-${row.subject.id}`, onfocus: () => show(row), onclick: () => focusFirst(detail) },
        h(
          'div',
          { class: 'row-main' },
          h('strong', null, row.subject.name),
          h('div', { class: 'chips' }, row.grades.filter((g) => g.kind === 'normal').slice(-10).map((g) => gradeChip(g)))
        ),
        proposed ? h('span', { class: 'badge' }, `${proposed.kind.endsWith('Proposed') ? 'przew.' : 'końc.'} ${proposed.name}`) : null,
        h('span', { class: 'avg' }, fmt.average(average(row.grades)))
      )
    );
  }
  show(rows[0]);
  el.append(h('div', { class: 'split' }, list, detail));
}

function average(list) {
  const counted = list.filter((g) => g.kind === 'normal' && g.weight > 0 && g.value !== null);
  const weights = counted.reduce((s, g) => s + g.weight, 0);
  return weights > 0 ? counted.reduce((s, g) => s + g.value * g.weight, 0) / weights : null;
}

// MARK: Terminarz

function agenda(el, app) {
  const d = app.data;
  if (!d) return loading(el, 'Terminarz');
  const past = !!app.ui.agendaPast;
  const t = fmt.today();
  const set = (v) => { app.ui.agendaPast = v; app.render(); };
  const events = past ? d.events.filter((e) => e.day < t).reverse() : d.events.filter((e) => e.day >= t);
  el.append(header('Terminarz', past ? 'Minione wydarzenia' : 'Sprawdziany, kartkówki i wydarzenia', [toggle('Nadchodzące', !past, 'ag-next', () => set(false)), toggle('Minione', past, 'ag-past', () => set(true))]));
  if (!events.length) {
    el.append(empty(past ? 'Brak minionych wydarzeń.' : 'Nic nie zaplanowano.'));
    return;
  }
  const list = h('div', { class: 'pane scroll full', 'data-zone': 'agenda' });
  let lastDay = null;
  for (const e of events) {
    if (e.day !== lastDay) {
      list.append(h('h3', { class: 'group' }, `${fmt.dayLong(e.day)}${fmt.dayLong(e.day).includes(',') ? '' : ` · ${fmt.dayMedium(e.day)}`}`));
      lastDay = e.day;
    }
    list.append(
      f(
        'div',
        { class: 'row event-row', key: `e-${e.id}` },
        colorBar(e.color),
        h(
          'div',
          { class: 'row-main' },
          h('strong', null, [e.category, e.subject].filter(Boolean).join(' · ')),
          e.topic ? h('p', { class: 'body-text' }, e.topic) : null,
          h('small', null, [e.lessonNumber ? `lekcja ${e.lessonNumber}` : null, e.time, e.teacher].filter(Boolean).join(' · '))
        )
      )
    );
  }
  el.append(list);
}

// MARK: Frekwencja

function attendance(el, app) {
  const d = app.data;
  if (!d) return loading(el, 'Frekwencja');
  const scope = app.ui.attendanceScope || 'all';
  const set = (v) => { app.ui.attendanceScope = v; app.render(); };
  const stats = d.attendance.stats[scope];
  const entries = d.attendance.entries.filter((e) => scope === 'all' || String(e.semester) === scope);
  el.append(
    header('Frekwencja', `Obecność: ${fmt.percent(stats.percent)}`, [
      toggle('Cały rok', scope === 'all', 'at-all', () => set('all')),
      toggle('Semestr 1', scope === '1', 'at-1', () => set('1')),
      toggle('Semestr 2', scope === '2', 'at-2', () => set('2')),
    ])
  );
  const summary = h(
    'div',
    { class: 'pane list scroll', 'data-zone': 'att-summary' },
    f(
      'div',
      { class: 'card stat-card', key: 'att-stats' },
      h('div', { class: 'big-number medium' }, fmt.percent(stats.percent)),
      h(
        'dl',
        { class: 'stats' },
        h('dt', null, 'Lekcje'), h('dd', null, stats.total),
        h('dt', null, 'Nieobecności'), h('dd', null, stats.absent),
        h('dt', null, 'Usprawiedliwione'), h('dd', null, stats.absentExcused),
        h('dt', null, 'Spóźnienia'), h('dd', null, stats.belated),
        h('dt', null, 'Zwolnienia'), h('dd', null, stats.released)
      )
    ),
    scope === 'all'
      ? [h('h3', { class: 'group' }, 'Według przedmiotów'), d.attendance.bySubject.map((s) => f('div', { class: 'row', key: `as-${s.subject}` }, h('div', { class: 'row-main' }, h('strong', null, s.subject), h('small', null, `${s.total} lekcji · nieobecności: ${s.absent + s.absentExcused}`)), h('span', { class: 'avg' }, fmt.percent(s.percent))))]
      : null
  );
  const list = h('div', { class: 'pane detail scroll', 'data-zone': 'att-list' });
  if (!entries.length) list.append(empty('Brak nieobecności, spóźnień ani zwolnień.'));
  for (const e of entries) {
    list.append(
      f(
        'div',
        { class: 'row', key: `a-${e.id}` },
        h('span', { class: 'type-chip', style: { background: e.color || 'var(--surface-3)' } }, e.typeShort),
        h('div', { class: 'row-main' }, h('strong', null, `${e.typeName}${e.subject ? ` · ${e.subject}` : ''}`), h('small', null, `${fmt.dayLong(e.day)} · lekcja ${e.lessonNumber}${e.teacher ? ` · ${e.teacher}` : ''}`))
      )
    );
  }
  el.append(h('div', { class: 'split' }, summary, list));
}

// MARK: Wiadomości

function messages(el, app) {
  const folder = app.ui.folder || 'inbox';
  const set = (v) => { app.ui.folder = v; app.render(); };
  const reload = () => {
    app.messages[folder] = null;
    app.render();
  };
  el.append(
    header('Wiadomości', 'Tylko do odczytu. Odpowiadaj w telefonie.', [
      toggle('Odebrane', folder === 'inbox', 'mf-inbox', () => set('inbox')),
      toggle('Wysłane', folder === 'sent', 'mf-sent', () => set('sent')),
      f('button', { class: 'button icon-button', key: 'mf-reload', onclick: reload, title: 'Odśwież' }, icon('refresh')),
    ])
  );
  const cached = app.messages[folder];
  if (!cached) {
    const box = empty('Wczytywanie wiadomości…');
    el.append(box);
    app
      .loadMessages(folder, true)
      .then(() => {
        if (app.section !== 'messages' || (app.ui.folder || 'inbox') !== folder) return;
        const wasInContent = el.contains(document.activeElement);
        app.render();
        // Entered while loading: land on the first message instead of the folder buttons.
        const list = el.querySelector('[data-zone="messages"]');
        if (wasInContent && list) focusFirst(list);
      })
      .catch((e) => { box.textContent = e.message; });
    return;
  }
  if (!cached.list.length) {
    el.append(empty('Brak wiadomości.'));
    return;
  }
  const list = h('div', { class: 'pane scroll full', 'data-zone': 'messages' });
  for (const m of cached.list) {
    list.append(
      f(
        'div',
        { class: `row message-row ${m.unread ? 'unread' : ''}`, key: `m-${m.id}`, onclick: () => openMessage(app, m) },
        h('span', { class: 'unread-dot' }),
        h('div', { class: 'row-main' }, h('strong', null, m.subject || '(bez tematu)'), h('small', null, `${folder === 'inbox' ? 'Od' : 'Do'}: ${m.correspondent}`)),
        m.hasAttachments ? icon('clip') : null,
        h('span', { class: 'when' }, m.date.slice(0, 16))
      )
    );
  }
  el.append(list);
}

function openMessage(app, summary) {
  const body = h('div', { class: 'reader-body scroll-region focusable', tabindex: '-1', 'data-key': 'reader' }, h('span', { class: 'spinner' }), 'Wczytywanie…');
  const close = app.openLayer(() =>
    h(
      'div',
      { class: 'reader' },
      h('header', null, h('h2', null, summary.subject || '(bez tematu)'), h('p', { class: 'muted' }, `${summary.correspondent} · ${summary.date}`)),
      body,
      h('p', { class: 'hint' }, '▲▼ przewijanie · ↩ zamknij')
    )
  );
  app
    .api('message', { id: summary.id, folder: summary.folder })
    .then(({ message }) => {
      clear(body).append(message.text || '(pusta wiadomość)');
      if (message.attachments.length) {
        body.append(h('div', { class: 'attachments' }, h('strong', null, 'Załączniki (pobierz w telefonie):'), message.attachments.map((a) => h('div', null, icon('clip'), a.filename))));
      }
      if (summary.unread) {
        summary.unread = false;
        store.saveMessages(app.account.login, app.messages);
      }
    })
    .catch((e) => {
      clear(body).append(e.message);
    });
  return close;
}

// MARK: Uwagi, Ogłoszenia

function notices(el, app) {
  const d = app.data;
  if (!d) return loading(el, 'Uwagi');
  el.append(header('Uwagi', `${d.notices.length} wpisów`));
  if (!d.notices.length) {
    el.append(empty('Brak uwag.'));
    return;
  }
  const list = h('div', { class: 'pane scroll full', 'data-zone': 'notices' });
  for (const n of d.notices) {
    list.append(
      f(
        'div',
        { class: `row notice ${n.kind}`, key: `n-${n.id}` },
        h('span', { class: 'color-bar' }),
        h('div', { class: 'row-main' }, h('strong', null, [NOTICE_LABEL[n.kind], n.category].filter(Boolean).join(' · ')), h('p', { class: 'body-text' }, n.text), h('small', null, [fmt.dayLong(n.day), n.teacher].filter(Boolean).join(' · ')))
      )
    );
  }
  el.append(list);
}

function announcements(el, app) {
  const d = app.data;
  if (!d) return loading(el, 'Ogłoszenia');
  el.append(header('Ogłoszenia', `${d.announcements.filter((a) => !a.read).length} nowych`));
  if (!d.announcements.length) {
    el.append(empty('Brak ogłoszeń.'));
    return;
  }
  const list = h('div', { class: 'pane scroll full', 'data-zone': 'announcements' });
  for (const a of d.announcements) {
    list.append(
      f(
        'div',
        {
          class: `row ${a.read ? '' : 'unread'}`,
          key: `an-${a.id}`,
          onclick: () =>
            app.openLayer(() =>
              h(
                'div',
                { class: 'reader' },
                h('header', null, h('h2', null, a.subject), h('p', { class: 'muted' }, [a.startDay ? `od ${fmt.dayShort(a.startDay)}` : null, a.endDay ? `do ${fmt.dayShort(a.endDay)}` : null, a.author].filter(Boolean).join(' · '))),
                h('div', { class: 'reader-body scroll-region focusable', tabindex: '-1' }, a.text),
                h('p', { class: 'hint' }, '▲▼ przewijanie · ↩ zamknij')
              )
            ),
        },
        h('span', { class: 'unread-dot' }),
        h('div', { class: 'row-main' }, h('strong', null, a.subject), h('p', { class: 'body-text clamp' }, a.text), h('small', null, [a.startDay ? fmt.dayLong(a.startDay) : null, a.author].filter(Boolean).join(' · ')))
      )
    );
  }
  el.append(list);
}

// MARK: Konto

function account(el, app) {
  const d = app.data;
  const list = store.accounts();
  el.append(header('Konto', 'Uczniowie, odświeżanie i informacje'));
  const people = h('div', { class: 'pane list scroll', 'data-zone': 'accounts' }, h('h3', { class: 'group' }, 'Uczniowie na tym telewizorze'));
  for (const a of list) {
    const active = a.login === app.account.login;
    people.append(
      f(
        'div',
        { class: `row ${active ? 'selected' : ''}`, key: `acc-${a.login}`, onclick: () => (active ? null : app.switchAccount(a.login)) },
        h('span', { class: 'avatar small' }, (a.studentName || '?').slice(0, 1)),
        h('div', { class: 'row-main' }, h('strong', null, a.studentName), h('small', null, a.login === 'demo' ? 'dane demonstracyjne' : `login: ${a.login}`)),
        active ? h('span', { class: 'badge' }, 'aktywny') : h('span', { class: 'muted' }, 'OK – przełącz')
      )
    );
  }
  people.append(
    h(
      'div',
      { class: 'actions column' },
      f('button', { class: 'button', key: 'acc-add', onclick: () => app.addAccount() }, icon('plus'), 'Dodaj ucznia'),
      f('button', { class: 'button', key: 'acc-refresh', onclick: () => app.refresh(true) }, icon('refresh'), 'Odśwież dane teraz'),
      f('button', { class: 'button danger', key: 'acc-remove', onclick: () => confirmRemove(app) }, icon('trash'), `Usuń z telewizora: ${app.account.studentName}`)
    )
  );
  const info = h(
    'div',
    { class: 'pane detail scroll', 'data-zone': 'about' },
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'Stan danych'),
      h('p', null, `Ostatnia aktualizacja: ${fmt.sinceLabel(d && d.fetchedAt)}`),
      app.error ? h('p', { class: 'error-text' }, app.error) : null,
      d && d.warnings.length ? [h('p', null, 'Nie wczytały się:'), h('ul', { class: 'warnings' }, d.warnings.map((w) => h('li', null, w)))] : null
    ),
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'O aplikacji'),
      h('p', null, 'Dziennik 1.0 na telewizory LG webOS. Nieoficjalny klient Librus® Synergia oparty na otwartym kodzie Szkolny.eu (GPL-3.0). Nie jest powiązany z Librus Sp. z o.o.'),
      h('p', null, 'Login i hasło są zapisane tylko na tym telewizorze. Aplikacja łączy się wyłącznie z serwerami *.librus.pl.'),
      h('p', { class: 'muted' }, 'Pilot: OK wybiera, ↩ cofa, czerwony odświeża, zielony zmienia ucznia, żółty otwiera plan lekcji, niebieski oceny. CH+/CH− zmienia tydzień planu.')
    )
  );
  el.append(h('div', { class: 'split' }, people, info));
}

function confirmRemove(app) {
  const name = app.account.studentName;
  app.openLayer((close) =>
    h(
      'div',
      { class: 'dialog' },
      h('h2', null, 'Usunąć ucznia z telewizora?'),
      h('p', null, `${name}: login, hasło i pobrane dane zostaną usunięte z tego telewizora. Konto w Librusie się nie zmieni.`),
      h(
        'div',
        { class: 'actions' },
        f('button', { class: 'button', key: 'rm-cancel', onclick: close }, 'Anuluj'),
        f('button', { class: 'button danger', key: 'rm-ok', onclick: () => { close(); app.removeAccount(app.account.login); } }, 'Usuń')
      )
    )
  );
}

export const VIEWS = { home, timetable, grades, agenda, attendance, messages, notices, announcements, account };
