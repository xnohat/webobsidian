import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TaskRecord } from '../src/lib/api';
import {
  axisWidth,
  barFor,
  barGeometry,
  barsFor,
  computeRange,
  DAY_MS,
  dayGridlines,
  daysAheadVisible,
  dayToISO,
  dayToShort,
  EMPTY_RANGE_HALF_DAYS,
  isWeekend,
  monthLabel,
  monthSpans,
  isRealDate,
  MIN_BAR_PX,
  MIN_FUTURE_DAYS,
  MIN_LABEL_GAP_PX,
  PAD_DAYS,
  SHORT_LABEL_GAP_PX,
  parseDay,
  rangeDays,
  sortBars,
  ticksFor,
  WEEK_AHEAD_DAYS,
  WEEK_MAX_PX_PER_DAY,
  WEEK_SHORT_LABEL_SPACING_PX,
  WEEK_MIN_PX_PER_DAY,
  weekendSpans,
  weekZoomPxPerDay,
  todayX,
  xForDay,
  zoomLevel,
} from '../src/lib/gantt';

const TODAY = parseDay('2026-10-01');
if (TODAY === null) throw new Error('fixture date must parse');

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    path: 'Wiki/tasks/one.md',
    title: 'One',
    status: 'open',
    statusRaw: 'open',
    priority: 'P2',
    owner: 'hung',
    due: null,
    raised: null,
    created: null,
    updated: null,
    tags: [],
    ...overrides,
  };
}

test('parseDay accepts real YYYY-MM-DD dates and rejects everything else', () => {
  assert.deepEqual(parseDay('2026-10-01'), Math.floor(Date.UTC(2026, 9, 1) / DAY_MS));
  // Round trip through the same UTC basis.
  assert.equal(dayToISO(parseDay('2026-10-01')!), '2026-10-01');
  assert.equal(parseDay('2026-02-30'), null, 'a rolled-over date must not silently become Mar 2');
  assert.equal(parseDay('2026-13-01'), null);
  assert.equal(parseDay(''), null);
  assert.equal(parseDay(null), null);
  assert.equal(parseDay(undefined), null);
  assert.equal(parseDay('none'), null);
  assert.equal(parseDay('next friday'), null);
});

test('isRealDate mirrors parseDay for the values the vault actually stores', () => {
  assert.equal(isRealDate('2026-09-29'), true);
  assert.equal(isRealDate('none'), false);
  assert.equal(isRealDate(null), false);
});

test('a bar starts at raised, falls back to created, then to today', () => {
  const raised = barFor(task({ raised: '2026-09-10', created: '2026-08-01', due: '2026-10-05' }), TODAY);
  assert.equal(raised.startSource, 'raised');
  assert.equal(dayToISO(raised.startDay), '2026-09-10');

  const created = barFor(task({ created: '2026-08-01', due: '2026-10-05' }), TODAY);
  assert.equal(created.startSource, 'created');
  assert.equal(dayToISO(created.startDay), '2026-08-01');

  const neither = barFor(task({ due: '2026-10-05' }), TODAY);
  assert.equal(neither.startSource, 'today');
  assert.equal(dayToISO(neither.startDay), '2026-10-01');
});

test('a missing / "none" / free-text due is an open-ended bar running to today', () => {
  for (const due of [null, 'none', 'asap']) {
    const bar = barFor(task({ raised: '2026-09-01', due }), TODAY);
    assert.equal(bar.openEnded, true, `due=${String(due)}`);
    assert.equal(bar.endDay, TODAY);
    assert.equal(bar.overdue, false, 'an open-ended bar is never overdue');
  }
});

test('overdue follows the board rule: due in the past and status is not done', () => {
  const past = '2026-09-20';
  assert.equal(barFor(task({ due: past, status: 'open' }), TODAY).overdue, true);
  assert.equal(barFor(task({ due: past, status: 'done' }), TODAY).overdue, false);
  assert.equal(barFor(task({ due: '2026-10-01', status: 'open' }), TODAY).overdue, false, 'due today is not overdue');
  assert.equal(barFor(task({ due: '2026-10-05', status: 'open' }), TODAY).overdue, false);
});

test('a due before the start is clamped to a single day (never a negative width)', () => {
  const bar = barFor(task({ raised: '2026-10-05', due: '2026-09-20' }), TODAY);
  assert.equal(bar.startDay, parseDay('2026-10-05'));
  assert.equal(bar.endDay, bar.startDay);
  assert.equal(bar.overdue, true, 'the malformed due is still reported as overdue');
});

test('computeRange pads both sides and always contains today', () => {
  const bars = barsFor(
    [
      task({ path: 'a.md', raised: '2026-09-10', due: '2026-09-20' }),
      task({ path: 'b.md', raised: '2026-10-20', due: '2026-10-25' }),
    ],
    TODAY,
  );
  const r = computeRange(bars, TODAY);
  assert.equal(dayToISO(r.from), '2026-09-07', 'earliest start minus the pad');
  assert.equal(dayToISO(r.to), '2026-11-29', 'eight weeks of runway past today, plus the pad');
  assert.equal(PAD_DAYS, 3);
  assert.equal(MIN_FUTURE_DAYS, 56);
});

test('computeRange keeps today inside a range made only of past or future tasks', () => {
  const past = computeRange(barsFor([task({ raised: '2026-01-01', due: '2026-01-05' })], TODAY), TODAY);
  assert.ok(past.from <= TODAY && TODAY <= past.to, 'today must be inside a fully-past range');
  assert.equal(dayToISO(past.to), '2026-11-29', 'the runway is drawn even with nothing ahead of today');
  assert.ok(past.to - TODAY >= MIN_FUTURE_DAYS, 'at least eight weeks ahead');

  const future = computeRange(barsFor([task({ raised: '2026-12-01', due: '2026-12-05' })], TODAY), TODAY);
  assert.ok(future.from <= TODAY && future.to > parseDay('2026-12-05')!, 'a task beyond the runway still fits');
  assert.equal(dayToISO(future.from), '2026-09-28');
});

test('computeRange with no bars is a fixed window around today, runway included', () => {
  const r = computeRange([], TODAY);
  assert.equal(r.from, TODAY - EMPTY_RANGE_HALF_DAYS);
  assert.equal(r.to, TODAY + MIN_FUTURE_DAYS + PAD_DAYS);
  assert.equal(EMPTY_RANGE_HALF_DAYS, 15);
});

test('week zoom scale fits eight weeks ahead, clamped for extreme widths', () => {
  // A wide pane: on target (eight weeks ahead + 12% of context behind today).
  const wide = weekZoomPxPerDay(1188);
  assert.ok(Math.abs(daysAheadVisible(1188, wide) - WEEK_AHEAD_DAYS) < 0.01, `wide pane shows ${daysAheadVisible(1188, wide)} days ahead`);
  // An ultrawide pane: the ceiling applies and therefore shows MORE than eight weeks.
  const ultrawide = weekZoomPxPerDay(1400);
  assert.equal(ultrawide, WEEK_MAX_PX_PER_DAY, 'the ceiling holds a week back from stretching');
  assert.ok(daysAheadVisible(1400, ultrawide) > WEEK_AHEAD_DAYS, 'ultrawide exceeds the target');
  // A laptop pane: still on target.
  const laptop = weekZoomPxPerDay(600);
  assert.ok(Math.abs(daysAheadVisible(600, laptop) - WEEK_AHEAD_DAYS) < 0.01, `laptop shows ${daysAheadVisible(600, laptop)} days ahead`);
  // A 390px phone: the floor applies, because eight weeks of legible week labels
  // do not physically fit in ~258px of axis. Honest rather than pretend.
  // A 390px phone leaves ~258px of axis: just above the floor, still eight weeks.
  assert.ok(weekZoomPxPerDay(258) >= WEEK_MIN_PX_PER_DAY);
  const phone = daysAheadVisible(258, weekZoomPxPerDay(258));
  assert.ok(phone >= WEEK_AHEAD_DAYS - 1, `phone shows ${phone.toFixed(1)} days ahead`);
  // A truly squeezed pane (both sidebars plus a narrow window) hits the floor;
  // that is the only case where eight weeks is not achievable and the scale stops
  // shrinking rather than becoming illegible.
  assert.equal(weekZoomPxPerDay(200), WEEK_MIN_PX_PER_DAY);
  assert.ok(daysAheadVisible(200, WEEK_MIN_PX_PER_DAY) < WEEK_AHEAD_DAYS, 'the floor is a real limit, stated rather than hidden');
  // A laptop whose pane is squeezed by an open sidebar still gets eight weeks.
  assert.ok(daysAheadVisible(272, weekZoomPxPerDay(272)) >= WEEK_AHEAD_DAYS - 1, 'a narrow pane still targets eight weeks');
  // Degenerate inputs never produce a silly scale.
  assert.equal(weekZoomPxPerDay(0), WEEK_MAX_PX_PER_DAY);
  assert.equal(weekZoomPxPerDay(-5), WEEK_MAX_PX_PER_DAY);
  // Zoom ordering still holds: Month < Week < Day.
  assert.ok(zoomLevel('month').pxPerDay < WEEK_MIN_PX_PER_DAY, 'Month stays below the Week floor');
  assert.ok(WEEK_MAX_PX_PER_DAY < zoomLevel('day').pxPerDay);
});

test('week labels fit their spacing: dates when roomy, day numbers when dense', () => {
  const r = { from: parseDay('2026-08-03')!, to: parseDay('2026-10-05')! };
  // Roomy (16px/day → 112px between Mondays): a date per Monday.
  const roomy = ticksFor(r, 'week', 16);
  assert.ok(roomy.length > 0);
  assert.ok(roomy.every((t) => t.label !== null));
  assert.match(roomy[0].label!, /^[A-Z][a-z]{2} \d+$/, 'reads as a date when there is room');
  // Dense (4px/day → 28px between Mondays): day numbers only, every Monday kept.
  const dense = ticksFor(r, 'week', 4);
  assert.equal(dense.length, roomy.length, 'the same Mondays are still ticks');
  assert.ok(dense.every((t) => t.major), 'and still carry their gridlines');
  assert.ok(
    dense.every((t) => t.label === null || /^\d{2}$/.test(t.label)),
    `dense labels are day numbers: ${dense.map((t) => t.label).join(',')}`,
  );
  assert.ok(dense.filter((t) => t.label !== null).length >= Math.ceil(dense.length / 2), 'most Mondays keep a label');
  // Absurdly dense (2px/day → 14px): the spacing rule starts dropping them.
  const crushed = ticksFor(r, 'week', 2);
  assert.ok(crushed.filter((t) => t.label !== null).length < crushed.length, 'below the short-label gap, labels drop');
  assert.ok(SHORT_LABEL_GAP_PX < MIN_LABEL_GAP_PX);
});

test('geometry: inclusive duration, offset by the padded range, floored at MIN_BAR_PX', () => {
  const bar = barFor(task({ raised: '2026-09-10', due: '2026-09-19' }), TODAY); // 10 days inclusive
  const r = computeRange([bar], TODAY);

  const day = zoomLevel('day');
  const g = barGeometry(bar, r, day.pxPerDay);
  assert.equal(g.x, day.pxPerDay * (parseDay('2026-09-10')! - r.from), 'x = padded offset of the start day');
  assert.equal(g.width, 10 * day.pxPerDay, 'ten inclusive days');

  // A same-day task is one day wide, and at month zoom the floor keeps it visible.
  const sameDay = barFor(task({ raised: '2026-09-10', due: '2026-09-10' }), TODAY);
  const month = zoomLevel('month');
  assert.equal(barGeometry(sameDay, r, day.pxPerDay).width, day.pxPerDay);
  assert.equal(barGeometry(sameDay, r, month.pxPerDay).width, MIN_BAR_PX);
  assert.ok(month.pxPerDay < MIN_BAR_PX, 'the floor only bites at the densest zoom');
  assert.equal(MIN_BAR_PX, 8);
});

test('an open-ended bar covers today\'s column, up to the day after the today line', () => {
  const bar = barFor(task({ raised: '2026-09-01', due: null }), TODAY);
  const r = computeRange([bar], TODAY);
  const px = zoomLevel('week').pxPerDay;
  const g = barGeometry(bar, r, px);
  // Durations are inclusive, so a bar ending today occupies today's whole day
  // column: its right edge is one pxPerDay past the today line, which marks the
  // *start* of today. (The chart draws the line that way on purpose.)
  assert.equal(g.x + g.width, todayX(r, px, TODAY) + px);
  assert.equal(g.x + g.width - px, todayX(r, px, TODAY), 'the line sits on the last day of the bar');
});

test('axis measurements are consistent with the range', () => {
  const r = { from: 100, to: 109 };
  assert.equal(rangeDays(r), 10);
  assert.equal(axisWidth(r, 8), 80);
  assert.equal(xForDay(100, r, 8), 0);
  assert.equal(xForDay(109, r, 8), 72);
  assert.equal(todayX(r, 8, 104), 32);
});

test('sortBars orders by start, then latest due, then title', () => {
  const bars = barsFor(
    [
      task({ path: 'b.md', title: 'B', raised: '2026-09-10', due: '2026-09-12' }),
      task({ path: 'a.md', title: 'A', raised: '2026-09-10', due: '2026-09-20' }),
      task({ path: 'c.md', title: 'C', raised: '2026-09-01', due: '2026-09-05' }),
    ],
    TODAY,
  );
  assert.deepEqual(
    sortBars(bars).map((b) => b.title),
    ['C', 'A', 'B'],
  );
});

test('short date labels read as dates, not codes', () => {
  assert.equal(dayToShort(parseDay('2026-09-28')!), 'Sep 28');
  assert.equal(dayToShort(parseDay('2026-10-05')!), 'Oct 5');
  assert.equal(monthLabel(parseDay('2026-09-28')!), 'September 2026');
  assert.equal(monthLabel(parseDay('2026-10-01')!), 'October 2026');
});

test('weekends are Saturday and Sunday', () => {
  assert.equal(isWeekend(parseDay('2026-09-26')!), true); // Sat
  assert.equal(isWeekend(parseDay('2026-09-27')!), true); // Sun
  assert.equal(isWeekend(parseDay('2026-09-25')!), false); // Fri
  assert.equal(isWeekend(parseDay('2026-09-28')!), false); // Mon
});

test('weekend spans merge Sat+Sun and carry padded offsets', () => {
  const r = { from: parseDay('2026-09-25')!, to: parseDay('2026-10-06')! };
  const px = 16;
  const spans = weekendSpans(r, px);
  assert.equal(spans.length, 2, 'two weekends in this range');
  assert.deepEqual(spans.map((s) => dayToISO(s.from)), ['2026-09-26', '2026-10-03']);
  assert.deepEqual(spans.map((s) => dayToISO(s.to)), ['2026-09-27', '2026-10-04']);
  assert.equal(spans[0].x, (parseDay('2026-09-26')! - r.from) * px);
  assert.equal(spans[0].width, 2 * px, 'Saturday + Sunday are one block');
  assert.ok(spans.every((s) => s.x >= 0 && s.x + s.width <= rangeDays(r) * px));
});

test('weekend spans never run past the end of the range', () => {
  const r = { from: parseDay('2026-09-28')!, to: parseDay('2026-10-03')! }; // Mon → Sat (open-ended)
  const spans = weekendSpans(r, 10);
  assert.deepEqual(spans.map((s) => dayToISO(s.from)), ['2026-10-03']);
  assert.equal(spans[0].width, 1 * 10, 'a lone Saturday is one day wide');
});

test('month spans tile the range exactly, in order, with labels', () => {
  const r = { from: parseDay('2026-09-25')!, to: parseDay('2026-10-06')! };
  const spans = monthSpans(r, 16);
  assert.deepEqual(spans.map((s) => s.label), ['September 2026', 'October 2026']);
  assert.equal(dayToISO(spans[0].from), '2026-09-25');
  assert.equal(dayToISO(spans[0].to), '2026-09-30');
  assert.equal(dayToISO(spans[1].from), '2026-10-01');
  assert.equal(dayToISO(spans[1].to), '2026-10-06');
  assert.equal(spans[0].x, 0);
  assert.equal(spans[1].x, spans[0].width, 'the bands tile without a gap');
  const total = spans.reduce((n, s) => n + s.width, 0);
  assert.equal(total, rangeDays(r) * 16, 'bands cover the whole axis');
});

test('a range inside one month yields a single band', () => {
  const r = { from: parseDay('2026-09-10')!, to: parseDay('2026-09-20')! };
  const spans = monthSpans(r, 4);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].label, 'September 2026');
  assert.equal(spans[0].width, rangeDays(r) * 4);
});

test('day hairlines cover every day when there is room, and none when there is not', () => {
  const r = { from: parseDay('2026-09-25')!, to: parseDay('2026-10-06')! };
  const lines = dayGridlines(r, 16);
  assert.equal(lines.length, rangeDays(r), 'one hairline per day');
  assert.equal(lines[0].x, 0);
  assert.equal(lines[1].x, 16);
  assert.deepEqual(dayGridlines(r, 8), [], 'too dense — no hairlines');
  assert.equal(dayGridlines(r, 12).length, rangeDays(r), 'the threshold is inclusive');
});

test('day zoom labels every day and majors on Mondays', () => {
  const r = { from: parseDay('2026-09-28')!, to: parseDay('2026-10-04')! }; // Mon → Sun
  const px = zoomLevel('day').pxPerDay;
  const ticks = ticksFor(r, 'day', px);
  assert.equal(ticks.length, rangeDays(r), 'one gridline per day');
  assert.equal(ticks[0].x, 0);
  assert.equal(ticks[1].x, px, 'gridlines are one pxPerDay apart');
  // 2026-09-28 is a Monday.
  assert.equal(ticks[0].major, true);
  assert.equal(ticks[0].label, 'Sep 28', 'a Monday reads as a date');
  assert.equal(ticks[2].major, false);
  assert.equal(ticks[2].label, '30');
});

test('week zoom labels Mondays only, month zoom labels the first of each month', () => {
  const r = { from: parseDay('2026-09-25')!, to: parseDay('2026-10-06')! };
  const week = ticksFor(r, 'week', zoomLevel('week').pxPerDay);
  assert.deepEqual(
    week.map((t) => dayToISO(t.day)),
    ['2026-09-28', '2026-10-05'],
    'Mondays inside the range',
  );
  assert.deepEqual(week.map((t) => t.label), ['Sep 28', 'Oct 5']);
  assert.ok(week.every((t) => t.major && t.label));

  const month = ticksFor(r, 'month', zoomLevel('month').pxPerDay);
  assert.deepEqual(month.map((t) => dayToISO(t.day)), ['2026-10-01']);
  assert.equal(month[0].label, 'Oct 2026');
});

test('a range with no Monday / month start still gets one labelled tick', () => {
  const r = { from: parseDay('2026-09-29')!, to: parseDay('2026-09-30')! }; // Tue → Wed
  const week = ticksFor(r, 'week', zoomLevel('week').pxPerDay);
  assert.equal(week.length, 1);
  assert.equal(week[0].x, 0);
  assert.equal(week[0].label, '2026-09-29');
  assert.equal(ticksFor(r, 'month', zoomLevel('month').pxPerDay).length, 1);
});
