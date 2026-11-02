import { describe, expect, it } from 'vitest';
import { addDays, monthGrid, startOfWeek, studyDateOf, weekDates } from './dates';
import { buildOccurrence, expandTasks, occursOn, planRuleEdit } from './recurrence';
import { moveTask, overdueTasks, setSimpleDone, toggleSubtask } from './tasks';
import { elapsedSec, finishTimer, pauseTimer, resolveRemoteTakeover, resumeTimer, startTimer, editSession } from './timer';
import { secBySubject, secByTask } from './stats';
import { scheduleFor, validateSlots } from './timetable';
import type { RecurrenceRule, StudySession, Task, Timetable, TimetableException } from './types';

const at = (s: string) => new Date(s).getTime(); // 로컬 시각 (TZ=Asia/Seoul로 실행)

describe('공부일 경계', () => {
  it('새벽 4시 이전은 전날', () => {
    expect(studyDateOf(at('2026-11-03T01:30:00'), 4)).toBe('2026-11-02');
    expect(studyDateOf(at('2026-11-03T03:59:59'), 4)).toBe('2026-11-02');
    expect(studyDateOf(at('2026-11-03T04:00:00'), 4)).toBe('2026-11-03');
  });
  it('경계 0시면 달력 날짜 그대로', () => {
    expect(studyDateOf(at('2026-11-03T00:10:00'), 0)).toBe('2026-11-03');
  });
  it('월·연 경계 넘기기', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(studyDateOf(at('2027-01-01T02:00:00'), 4)).toBe('2026-12-31');
  });
  it('주 시작(월요일)', () => {
    expect(startOfWeek('2026-11-08', 1)).toBe('2026-11-02'); // 일요일 → 그 주 월요일
    expect(weekDates('2026-11-04', 1)[0]).toBe('2026-11-02');
    expect(weekDates('2026-11-04', 0)[0]).toBe('2026-11-01');
  });
  it('월간 달력 42칸, 1일 포함', () => {
    const g = monthGrid(2026, 10, 1);
    expect(g).toHaveLength(42);
    expect(g).toContain('2026-11-01');
    expect(g[0]).toBe('2026-10-26');
  });
});

const rule = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  id: 'rule1',
  seriesId: 'S1',
  userId: 'u',
  template: { subjectId: 'math', title: '수학 과제', planStart: null, estimateMin: 30, subtasks: [] },
  freq: 'weekdays',
  weekdays: [1, 3, 5],
  startDate: '2026-11-02',
  endDate: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('반복 과제', () => {
  it('특정 요일·종료일', () => {
    const r = rule({ endDate: '2026-11-06' });
    expect(occursOn(r, '2026-11-02')).toBe(true); // 월
    expect(occursOn(r, '2026-11-03')).toBe(false); // 화
    expect(occursOn(r, '2026-11-06')).toBe(true); // 금
    expect(occursOn(r, '2026-11-09')).toBe(false); // 종료 후
    expect(occursOn(r, '2026-11-01')).toBe(false); // 시작 전
  });
  it('매주 = 시작 요일', () => {
    const r = rule({ freq: 'weekly', startDate: '2026-11-04' });
    expect(occursOn(r, '2026-11-11')).toBe(true);
    expect(occursOn(r, '2026-11-12')).toBe(false);
  });
  it('저장된 발생분이 있으면 가상 생성하지 않음 (이동·건너뛰기 포함)', () => {
    const r = rule();
    const moved: Task = { ...moveTask(buildOccurrence(r, '2026-11-02', 1), '2026-11-03', null, 2) };
    const skipped: Task = { ...buildOccurrence(r, '2026-11-04', 1), status: 'skipped' };
    const list = expandTasks([moved, skipped], [r], '2026-11-02', '2026-11-08');
    const ids = list.map((t) => `${t.planDate}${'virtual' in t ? 'v' : ''}`);
    expect(ids).toEqual(['2026-11-03', '2026-11-06v']);
  });
  it('같은 날짜 발생분 ID는 항상 같다 (기기 두 대 중복 방지)', () => {
    expect(buildOccurrence(rule(), '2026-11-02', 1).id).toBe(buildOccurrence(rule({ id: 'other-version' }), '2026-11-02', 99).id);
  });
  it('규칙 수정: 시작된 규칙은 어제로 끝내고 새 버전을 오늘부터', () => {
    const plan = planRuleEdit(rule(), { weekdays: [2] }, '2026-11-10', 5);
    expect(plan.update.endDate).toBe('2026-11-09');
    expect(plan.create?.startDate).toBe('2026-11-10');
    expect(plan.create?.seriesId).toBe('S1');
    // 과거 발생분은 옛 규칙 그대로
    const all = [plan.update, plan.create!];
    const past = expandTasks([], all, '2026-11-02', '2026-11-08').map((t) => t.planDate);
    expect(past).toEqual(['2026-11-02', '2026-11-04', '2026-11-06']);
    const future = expandTasks([], all, '2026-11-09', '2026-11-15').map((t) => t.planDate);
    expect(future).toEqual(['2026-11-09', '2026-11-10']); // 11-09(월)은 옛 규칙, 11-10(화)부터 새 규칙
  });
  it('규칙 수정: 시작 전 규칙은 그대로 수정', () => {
    const plan = planRuleEdit(rule({ startDate: '2026-12-01' }), { weekdays: [2] }, '2026-11-10', 5);
    expect(plan.create).toBeNull();
    expect(plan.update.weekdays).toEqual([2]);
  });
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', userId: 'u', subjectId: 'math', title: '기출', planDate: '2026-11-02', planStart: null,
  estimateMin: null, dueDate: '2026-11-10', subtasks: [], completedAt: null, completedOn: null,
  status: 'active', firstPlanDate: '2026-11-02', recurrenceId: null, occurrenceDate: null, createdAt: 0, updatedAt: 0,
  ...over,
});

describe('과제', () => {
  it('하위 과제가 모두 끝나야 상위 과제 완료, 하나 취소하면 다시 미완료', () => {
    let t = task({ subtasks: [{ id: 'a', title: '1단원', doneAt: null }, { id: 'b', title: '오답', doneAt: null }] });
    t = toggleSubtask(t, 'a', 10, '2026-11-02');
    expect(t.completedAt).toBeNull();
    t = toggleSubtask(t, 'b', 20, '2026-11-02');
    expect(t.completedAt).toBe(20);
    expect(t.completedOn).toBe('2026-11-02');
    t = toggleSubtask(t, 'a', 30, '2026-11-02');
    expect(t.completedAt).toBeNull();
  });
  it('복합 과제는 직접 완료할 수 없다', () => {
    expect(() => setSimpleDone(task({ subtasks: [{ id: 'a', title: 'x', doneAt: null }] }), true, 1, '2026-11-02')).toThrow();
  });
  it('이동해도 ID·마감일·최초 계획일 유지', () => {
    const m = moveTask(task(), '2026-11-05', '19:00', 9);
    expect(m.id).toBe('t1');
    expect(m.dueDate).toBe('2026-11-10');
    expect(m.firstPlanDate).toBe('2026-11-02');
    expect(m.planDate).toBe('2026-11-05');
  });
  it('지난 미완료만 골라낸다', () => {
    const list = [task(), task({ id: 't2', completedAt: 1 }), task({ id: 't3', planDate: '2026-11-03' }), task({ id: 't4', status: 'skipped' })];
    expect(overdueTasks(list, '2026-11-03').map((t) => t.id)).toEqual(['t1']);
  });
});

describe('타이머', () => {
  const base = startTimer({ sessionId: 's1', subjectId: 'math', taskId: 't1', deviceId: 'd1' }, at('2026-11-02T19:00:00'));
  const ctx = { userId: 'u', dayStartHour: 4, now: 0 };
  it('일시정지 시간은 제외', () => {
    let t = pauseTimer(base, at('2026-11-02T19:20:00'));
    expect(elapsedSec(t, at('2026-11-02T19:30:00'))).toBe(20 * 60); // 일시정지 중엔 멈춰 있음
    t = resumeTimer(t, at('2026-11-02T19:30:00'));
    expect(elapsedSec(t, at('2026-11-02T19:40:00'))).toBe(30 * 60);
    const s = finishTimer(t, at('2026-11-02T19:40:00'), ctx)!;
    expect(s.durationSec).toBe(30 * 60);
    expect(s.pauses).toHaveLength(1);
    expect(s.id).toBe('s1');
  });
  it('일시정지 상태로 종료해도 정지 구간은 제외', () => {
    const t = pauseTimer(base, at('2026-11-02T19:10:00'));
    expect(finishTimer(t, at('2026-11-02T20:00:00'), ctx)!.durationSec).toBe(10 * 60);
  });
  it('자정을 넘긴 세션은 시작한 공부일에 귀속', () => {
    const t = startTimer({ sessionId: 's2', subjectId: 'm', taskId: null, deviceId: 'd' }, at('2026-11-02T23:30:00'));
    expect(finishTimer(t, at('2026-11-03T01:00:00'), ctx)!.studyDate).toBe('2026-11-02');
  });
  it('1분 미만은 저장하지 않음', () => {
    expect(finishTimer(base, base.startAt + 30_000, ctx)).toBeNull();
  });
  it('다른 기기가 나중에 시작하면 내 세션을 그 시각에 끊는다', () => {
    const remote = startTimer({ sessionId: 's9', subjectId: 'eng', taskId: null, deviceId: 'd2' }, at('2026-11-02T19:30:00'));
    const now = at('2026-11-02T19:45:00');
    expect(resolveRemoteTakeover(base, remote, now)).toEqual({ action: 'close', endAt: at('2026-11-02T19:30:00') });
    expect(resolveRemoteTakeover(base, base, now)).toEqual({ action: 'none' });
    expect(resolveRemoteTakeover(base, null, now)).toEqual({ action: 'none' }); // 판단 보류 — 기록 보존
    const paused = { ...base, pausedAt: now, updatedAt: now };
    expect(resolveRemoteTakeover(base, paused, now)).toEqual({ action: 'sync', timer: paused });
    const endedHere = { sessionId: null, lastEndedId: 's1', lastStartAt: base.startAt, updatedAt: now };
    expect(resolveRemoteTakeover(base, endedHere, now)).toEqual({ action: 'clear' });
    const endedOther = { sessionId: null, lastEndedId: 's9', lastStartAt: at('2026-11-02T19:10:00'), updatedAt: now };
    expect(resolveRemoteTakeover(base, endedOther, now)).toEqual({ action: 'close', endAt: at('2026-11-02T19:10:00') });
  });
  it('세션 수정 시 범위 밖 일시정지는 잘라내고 다시 계산', () => {
    const s: StudySession = {
      id: 's', userId: 'u', subjectId: 'm', taskId: null, startAt: at('2026-11-02T19:00:00'), endAt: at('2026-11-02T23:00:00'),
      pauses: [{ start: at('2026-11-02T20:00:00'), end: at('2026-11-02T20:30:00') }], durationSec: 0, studyDate: '2026-11-02', deviceId: 'd', createdAt: 0, updatedAt: 0,
    };
    const e = editSession(s, s.startAt, at('2026-11-02T20:15:00'), { dayStartHour: 4, now: 1 });
    expect(e.durationSec).toBe(60 * 60);
    expect(() => editSession(s, s.endAt, s.startAt, { dayStartHour: 4, now: 1 })).toThrow();
  });
});

describe('집계', () => {
  const mk = (id: string, subjectId: string, taskId: string | null, min: number) =>
    ({ id, subjectId, taskId, durationSec: min * 60, studyDate: '2026-11-02' }) as StudySession;
  it('자유 공부는 과목에만, 과제 세션은 양쪽에', () => {
    const list = [mk('a', 'math', 't1', 30), mk('b', 'math', null, 20), mk('c', 'eng', 't2', 10)];
    expect(secBySubject(list).get('math')).toBe(50 * 60);
    expect(secByTask(list).get('t1')).toBe(30 * 60);
    expect(secByTask(list).size).toBe(2);
  });
});

describe('시간표', () => {
  const slot = (id: string, weekday: number, period: number, start: string, end: string) =>
    ({ id, weekday, period, label: `과목${period}`, subjectId: null, start, end, memo: '' });
  const tt: Timetable = {
    id: 'tt', userId: 'u', name: '2학기', validFrom: '2026-08-17', validTo: null, createdAt: 0, updatedAt: 0,
    slots: [slot('a', 1, 1, '08:10', '09:00'), slot('b', 1, 2, '09:10', '10:00'), slot('c', 2, 1, '08:10', '09:00')],
  };
  it('기본 시간표는 매주 반복', () => {
    expect(scheduleFor('2026-11-02', [tt], new Map()).slots.map((s) => s.id)).toEqual(['a', 'b']);
    expect(scheduleFor('2026-11-09', [tt], new Map()).slots.map((s) => s.id)).toEqual(['a', 'b']);
  });
  it('날짜 예외는 그날만, 기본은 그대로', () => {
    const ex: TimetableException = { id: '2026-11-02', userId: 'u', date: '2026-11-02', slots: [slot('x', 1, 1, '09:00', '12:00')], note: '중간고사', createdAt: 0, updatedAt: 0 };
    const m = new Map([[ex.date, ex]]);
    expect(scheduleFor('2026-11-02', [tt], m).slots.map((s) => s.id)).toEqual(['x']);
    expect(scheduleFor('2026-11-09', [tt], m).slots.map((s) => s.id)).toEqual(['a', 'b']);
    expect(tt.slots).toHaveLength(3);
  });
  it('겹치는 교시 검출', () => {
    expect(validateSlots([slot('a', 1, 1, '08:10', '09:00'), slot('b', 1, 2, '08:50', '09:40')])).toMatch(/겹칩니다/);
    expect(validateSlots(tt.slots)).toBeNull();
  });
});

it('addDays 일관성', () => {
  expect(addDays('2026-11-02', -2)).toBe('2026-10-31');
});

describe('계획 실행률', () => {
  it('시간 실행률과 과제 완료율을 따로, 예상 시간 없는 과제는 시간 실행률에서 제외', async () => {
    const { planRates } = await import('./stats');
    const planned = [
      { id: 'a', status: 'active' as const, completedAt: 1, estimateMin: 60 },
      { id: 'b', status: 'active' as const, completedAt: null, estimateMin: 60 },
      { id: 'c', status: 'active' as const, completedAt: 1, estimateMin: null },
      { id: 'd', status: 'skipped' as const, completedAt: null, estimateMin: 30 },
    ];
    const s = (taskId: string | null, min: number) => ({ taskId, durationSec: min * 60 }) as StudySession;
    const r = planRates(planned, [s('a', 70), s('b', 26), s('c', 100), s(null, 50)]);
    expect(r.completion).toEqual({ done: 2, planned: 3, rate: 67 });
    expect(r.time).toEqual({ plannedMin: 120, actualSec: 96 * 60, counted: 2, rate: 80 });
  });
  it('계획이 없으면 비율을 만들지 않음', async () => {
    const { planRates } = await import('./stats');
    const r = planRates([], []);
    expect(r.completion.rate).toBeNull();
    expect(r.time.rate).toBeNull();
  });
});
