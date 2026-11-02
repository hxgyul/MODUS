import { addDays, diffDays, weekdayOf } from './dates';
import { newId, occurrenceId } from './ids';
import type { ISODate, Millis, RecurrenceRule, Task } from './types';

/** 화면에 보여 주기 위해 계산한, 아직 저장되지 않은 반복 발생분 */
export type TaskView = Task & { virtual?: true };

export function occursOn(rule: RecurrenceRule, date: ISODate): boolean {
  if (date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  switch (rule.freq) {
    case 'daily':
      return true;
    case 'weekly':
      return weekdayOf(date) === weekdayOf(rule.startDate);
    case 'weekdays':
      return rule.weekdays.includes(weekdayOf(date));
  }
}

/** 규칙과 날짜로부터 발생분 과제를 만든다. ID는 항상 결정적이다. */
export function buildOccurrence(rule: RecurrenceRule, date: ISODate, now: Millis): Task {
  return {
    id: occurrenceId(rule.seriesId, date),
    userId: rule.userId,
    subjectId: rule.template.subjectId,
    title: rule.template.title,
    planDate: date,
    planStart: rule.template.planStart,
    estimateMin: rule.template.estimateMin,
    dueDate: null,
    subtasks: rule.template.subtasks.map((s) => ({ id: s.id, title: s.title, doneAt: null })),
    completedAt: null,
    completedOn: null,
    status: 'active',
    firstPlanDate: date,
    recurrenceId: rule.seriesId,
    occurrenceDate: date,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * [from, to] 구간의 과제 목록 = 저장된 과제(planDate가 구간 안) + 아직 저장되지 않은 반복 발생분.
 * 이미 저장된 발생분(이동·건너뛰기 포함)은 occurrenceDate 기준으로 가상 생성에서 제외한다.
 */
export function expandTasks(
  stored: Task[],
  rules: RecurrenceRule[],
  from: ISODate,
  to: ISODate,
): TaskView[] {
  const out: TaskView[] = stored.filter(
    (t) => t.planDate !== null && t.planDate >= from && t.planDate <= to && t.status === 'active',
  );
  const materialized = new Set(
    stored.filter((t) => t.recurrenceId && t.occurrenceDate).map((t) => `${t.recurrenceId}|${t.occurrenceDate}`),
  );
  const span = diffDays(to, from);
  for (const rule of rules) {
    for (let i = 0; i <= span; i++) {
      const date = addDays(from, i);
      if (!occursOn(rule, date)) continue;
      if (materialized.has(`${rule.seriesId}|${date}`)) continue;
      out.push({ ...buildOccurrence(rule, date, rule.updatedAt), virtual: true });
    }
  }
  return out;
}

export interface RuleEditPlan {
  /** 덮어쓸 기존 규칙 (in-place 수정 또는 종료일 지정) */
  update: RecurrenceRule;
  /** 새로 만들 규칙 버전 (없으면 in-place 수정) */
  create: RecurrenceRule | null;
}

/**
 * 반복 규칙 수정 계획.
 * - 규칙이 아직 시작 전(startDate ≥ today)이면 그 자리에서 수정한다.
 * - 이미 시작된 규칙이면 어제 날짜로 끝내고, 오늘부터 적용되는 새 버전을 같은 seriesId로 만든다.
 *   → 과거 발생분(완료·미완료 모두)은 바뀌지 않는다.
 */
export function planRuleEdit(
  rule: RecurrenceRule,
  changes: Partial<Pick<RecurrenceRule, 'template' | 'freq' | 'weekdays' | 'endDate'>>,
  today: ISODate,
  now: Millis,
): RuleEditPlan {
  if (rule.startDate >= today) {
    return { update: { ...rule, ...changes, updatedAt: now }, create: null };
  }
  const ended: RecurrenceRule = { ...rule, endDate: addDays(today, -1), updatedAt: now };
  const next: RecurrenceRule = {
    ...rule,
    ...changes,
    id: newId(),
    startDate: today,
    createdAt: now,
    updatedAt: now,
  };
  if (next.endDate && next.endDate < today) {
    // 종료일을 과거로 당긴 경우: 새 버전 없이 기존 규칙만 그날로 끝낸다
    return { update: { ...rule, endDate: next.endDate, updatedAt: now }, create: null };
  }
  return { update: ended, create: next };
}

export function describeRule(rule: Pick<RecurrenceRule, 'freq' | 'weekdays' | 'startDate' | 'endDate'>): string {
  const W = ['일', '월', '화', '수', '목', '금', '토'];
  let s: string;
  switch (rule.freq) {
    case 'daily':
      s = '매일';
      break;
    case 'weekly':
      s = `매주 ${W[weekdayOf(rule.startDate)]}요일`;
      break;
    case 'weekdays':
      s = [...rule.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => W[d]).join('·');
      break;
  }
  return rule.endDate ? `${s} (~${rule.endDate.slice(5).replace('-', '/')})` : s;
}
