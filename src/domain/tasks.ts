import type { HHmm, ISODate, Millis, Task } from './types';

export const isDone = (t: Pick<Task, 'completedAt'>) => t.completedAt !== null;
export const isComposite = (t: Pick<Task, 'subtasks'>) => t.subtasks.length > 0;

export function subtaskProgress(t: Pick<Task, 'subtasks'>): { done: number; total: number } {
  return { done: t.subtasks.filter((s) => s.doneAt !== null).length, total: t.subtasks.length };
}

/** 단순 과제 완료/취소. 복합 과제는 하위 과제로만 완료 상태가 바뀐다. */
export function setSimpleDone(t: Task, done: boolean, now: Millis, studyDate: ISODate): Task {
  if (isComposite(t)) throw new Error('복합 과제는 하위 과제로 완료 처리합니다.');
  return done
    ? { ...t, completedAt: now, completedOn: studyDate, updatedAt: now }
    : { ...t, completedAt: null, completedOn: null, updatedAt: now };
}

/** 하위 과제 토글 → 상위 과제 완료 상태 자동 계산 */
export function toggleSubtask(t: Task, subtaskId: string, now: Millis, studyDate: ISODate): Task {
  const subtasks = t.subtasks.map((s) =>
    s.id === subtaskId ? { ...s, doneAt: s.doneAt === null ? now : null } : s,
  );
  return withDerivedCompletion({ ...t, subtasks, updatedAt: now }, now, studyDate);
}

/** 하위 과제 목록이 바뀐 뒤 상위 과제 완료 상태를 다시 맞춘다 */
export function withDerivedCompletion(t: Task, now: Millis, studyDate: ISODate): Task {
  if (!isComposite(t)) return t;
  const allDone = t.subtasks.every((s) => s.doneAt !== null);
  if (allDone && t.completedAt === null) return { ...t, completedAt: now, completedOn: studyDate };
  if (!allDone && t.completedAt !== null) return { ...t, completedAt: null, completedOn: null };
  return t;
}

/** 계획 날짜만 바꾼다. ID·마감일·하위 과제·기록은 그대로. */
export function moveTask(t: Task, planDate: ISODate | null, planStart: HHmm | null, now: Millis): Task {
  return {
    ...t,
    planDate,
    planStart: planDate ? planStart : null,
    firstPlanDate: t.firstPlanDate ?? planDate,
    updatedAt: now,
  };
}

/**
 * 특정 공부일에 목록에 보일 과제.
 * - planDate가 그날인 과제 (완료한 것도 취소선으로 남김)
 * - 건너뛴·보관 과제 제외
 */
export function tasksForDay<T extends Task>(tasks: T[], date: ISODate): T[] {
  return tasks.filter((t) => t.planDate === date && t.status === 'active');
}

/** 지난 날짜에 계획되었으나 아직 완료하지 않은 과제 (자동 이월하지 않음) */
export function overdueTasks<T extends Task>(tasks: T[], today: ISODate): T[] {
  return tasks.filter(
    (t) => t.status === 'active' && t.planDate !== null && t.planDate < today && t.completedAt === null,
  );
}

/** 오늘 목록 정렬: 시간 지정 → 시간 순, 그 다음 요일 지정 과제, 완료한 것은 아래로 */
export function sortForDay<T extends Task>(tasks: T[], subjectOrder: Map<string, number>): T[] {
  return [...tasks].sort((a, b) => {
    const da = isDone(a) ? 1 : 0;
    const db = isDone(b) ? 1 : 0;
    if (da !== db) return da - db;
    if (a.planStart && b.planStart) return a.planStart.localeCompare(b.planStart);
    if (a.planStart) return -1;
    if (b.planStart) return 1;
    const sa = subjectOrder.get(a.subjectId) ?? 999;
    const sb = subjectOrder.get(b.subjectId) ?? 999;
    if (sa !== sb) return sa - sb;
    return a.createdAt - b.createdAt;
  });
}

export function matchesSearch(
  t: Task,
  q: { text?: string; subjectId?: string | null; done?: 'all' | 'done' | 'open'; date?: ISODate | null; dueFrom?: ISODate | null; dueTo?: ISODate | null },
): boolean {
  if (t.status === 'archived') return false;
  if (q.text && !t.title.toLowerCase().includes(q.text.trim().toLowerCase())) return false;
  if (q.subjectId && t.subjectId !== q.subjectId) return false;
  if (q.done === 'done' && !isDone(t)) return false;
  if (q.done === 'open' && isDone(t)) return false;
  if (q.date && t.planDate !== q.date) return false;
  if (q.dueFrom && (!t.dueDate || t.dueDate < q.dueFrom)) return false;
  if (q.dueTo && (!t.dueDate || t.dueDate > q.dueTo)) return false;
  return true;
}
