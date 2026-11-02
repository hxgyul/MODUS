import { useMemo } from 'react';
import { useData } from './DataProvider';
import { addDays, studyDateOf } from '@/domain/dates';
import { expandTasks, type TaskView } from '@/domain/recurrence';
import { overdueTasks } from '@/domain/tasks';
import { secBySubject, secByTask } from '@/domain/stats';
import type { ISODate, Subject } from '@/domain/types';

/** 오늘(공부일). now를 넘기면 그 시각 기준 */
export function useToday(now?: number): ISODate {
  const { settings } = useData();
  return studyDateOf(now ?? Date.now(), settings.dayStartHour);
}

/** 기간 안의 과제 (반복 발생분 포함) */
export function useTasksInRange(from: ISODate, to: ISODate): TaskView[] {
  const { tasks, recurrences } = useData();
  return useMemo(() => expandTasks(tasks, recurrences, from, to), [tasks, recurrences, from, to]);
}

/** 지난 미완료 — 최근 기간만 (반복 발생분은 오래된 것까지 쌓이지 않도록 21일) */
export const OVERDUE_LOOKBACK_DAYS = 21;
export function useOverdue(today: ISODate): TaskView[] {
  const { tasks, recurrences } = useData();
  return useMemo(() => {
    const from = addDays(today, -OVERDUE_LOOKBACK_DAYS);
    const expanded = expandTasks(tasks, recurrences, from, addDays(today, -1));
    // 21일보다 오래된 일반 과제도 미완료라면 포함 (직접 만든 과제는 사라지면 안 됨)
    const older = tasks.filter((t) => !t.recurrenceId && t.planDate !== null && t.planDate < from);
    return overdueTasks([...expanded, ...older], today).sort((a, b) => (a.planDate ?? '').localeCompare(b.planDate ?? ''));
  }, [tasks, recurrences, today]);
}

export function useSubjectMap(): Map<string, Subject> {
  const { subjects } = useData();
  return useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
}

export function useSubjectOrder(): Map<string, number> {
  const { subjects } = useData();
  return useMemo(() => new Map(subjects.map((s, i) => [s.id, i])), [subjects]);
}

/** 과제별 누적 공부 시간(전체 기간) */
export function useTaskSeconds(): Map<string, number> {
  const { sessions } = useData();
  return useMemo(() => secByTask(sessions), [sessions]);
}

/** 특정 공부일의 과목별 공부 시간 */
export function useDaySubjectSeconds(date: ISODate): Map<string, number> {
  const { sessions } = useData();
  return useMemo(() => secBySubject(sessions.filter((s) => s.studyDate === date)), [sessions, date]);
}
