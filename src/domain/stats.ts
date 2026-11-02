import type { ISODate, StudySession, Task } from './types';

/** 기간 [from, to] 안의 세션 */
export function sessionsIn(sessions: StudySession[], from: ISODate, to: ISODate): StudySession[] {
  return sessions.filter((s) => s.studyDate >= from && s.studyDate <= to);
}

export function totalSec(sessions: StudySession[]): number {
  return sessions.reduce((a, s) => a + s.durationSec, 0);
}

/** 과목별 합계 — 자유 공부(taskId=null) 포함 */
export function secBySubject(sessions: StudySession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) m.set(s.subjectId, (m.get(s.subjectId) ?? 0) + s.durationSec);
  return m;
}

/** 과제별 합계 — 과제에 연결된 세션만 (자유 공부 제외) */
export function secByTask(sessions: StudySession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    if (s.taskId) m.set(s.taskId, (m.get(s.taskId) ?? 0) + s.durationSec);
  }
  return m;
}

export function secByDate(sessions: StudySession[]): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const s of sessions) m.set(s.studyDate, (m.get(s.studyDate) ?? 0) + s.durationSec);
  return m;
}

export interface PlanRates {
  completion: { done: number; planned: number; rate: number | null };
  /** 예상 소요 시간이 입력된 과제만 대상 */
  time: { plannedMin: number; actualSec: number; counted: number; rate: number | null };
}

/**
 * 계획 실행률 — 두 지표를 합산하지 않고 따로 계산한다.
 * planned: 기간 안에 계획된 과제(반복 발생분 포함, 건너뛰기·보관 제외)
 * 시간 실행률의 실제 시간 = 그 과제들에 연결된 세션 합계 (자유 공부 제외)
 */
export function planRates(planned: Pick<Task, 'id' | 'status' | 'completedAt' | 'estimateMin'>[], sessions: StudySession[]): PlanRates {
  const list = planned.filter((t) => t.status === 'active');
  const done = list.filter((t) => t.completedAt !== null).length;
  const withEst = list.filter((t) => t.estimateMin && t.estimateMin > 0);
  const ids = new Set(withEst.map((t) => t.id));
  const actualSec = sessions.reduce((a, s) => (s.taskId && ids.has(s.taskId) ? a + s.durationSec : a), 0);
  const plannedMin = withEst.reduce((a, t) => a + (t.estimateMin ?? 0), 0);
  return {
    completion: { done, planned: list.length, rate: list.length ? Math.round((done / list.length) * 100) : null },
    time: { plannedMin, actualSec, counted: withEst.length, rate: plannedMin ? Math.round((actualSec / 60 / plannedMin) * 100) : null },
  };
}
