import { studyDateOf } from './dates';
import type { ActiveTimer, Millis, PauseSpan, StudySession, TimerDoc } from './types';

/** 이 길이보다 짧은 세션은 실수로 보고 저장하지 않는다 */
export const MIN_SESSION_SEC = 60;

function pausedMs(pauses: PauseSpan[], until: Millis): number {
  return pauses.reduce((acc, p) => acc + Math.max(0, Math.min(p.end, until) - p.start), 0);
}

/**
 * 실제 공부 시간(초). 화면 카운터가 아니라 시각 기록으로 매번 계산한다.
 * 일시정지 중이면 pausedAt 이후 시간은 포함하지 않는다.
 */
export function elapsedSec(t: Pick<ActiveTimer, 'startAt' | 'pauses' | 'pausedAt'>, now: Millis): number {
  const until = t.pausedAt ?? now;
  const ms = until - t.startAt - pausedMs(t.pauses, until);
  return Math.max(0, Math.floor(ms / 1000));
}

export function startTimer(
  args: { sessionId: string; subjectId: string; taskId: string | null; deviceId: string },
  now: Millis,
): ActiveTimer {
  return { ...args, startAt: now, pauses: [], pausedAt: null, updatedAt: now };
}

export function pauseTimer(t: ActiveTimer, now: Millis): ActiveTimer {
  if (t.pausedAt !== null) return t;
  return { ...t, pausedAt: now, updatedAt: now };
}

export function resumeTimer(t: ActiveTimer, now: Millis): ActiveTimer {
  if (t.pausedAt === null) return t;
  return { ...t, pauses: [...t.pauses, { start: t.pausedAt, end: now }], pausedAt: null, updatedAt: now };
}

/**
 * 타이머를 끝내고 저장할 세션을 만든다. 너무 짧으면 null.
 * endAt을 지정하면 그 시각에 끝난 것으로 계산한다(다른 기기와 겹침 잘라내기 등).
 */
export function finishTimer(
  t: ActiveTimer,
  endAt: Millis,
  ctx: { userId: string; dayStartHour: number; now: Millis },
): StudySession | null {
  const end = Math.max(t.startAt, endAt);
  // 일시정지 상태로 끝나면 일시정지 구간을 닫는다
  const pauses: PauseSpan[] = [...t.pauses];
  if (t.pausedAt !== null) pauses.push({ start: t.pausedAt, end: Math.max(t.pausedAt, end) });
  const clipped = pauses
    .filter((p) => p.start < end)
    .map((p) => ({ start: p.start, end: Math.min(p.end, end) }));
  const durationSec = Math.max(0, Math.floor((end - t.startAt - pausedMs(clipped, end)) / 1000));
  if (durationSec < MIN_SESSION_SEC) return null;
  return {
    id: t.sessionId,
    userId: ctx.userId,
    subjectId: t.subjectId,
    taskId: t.taskId,
    startAt: t.startAt,
    endAt: end,
    pauses: clipped,
    durationSec,
    studyDate: studyDateOf(t.startAt, ctx.dayStartHour),
    deviceId: t.deviceId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

export type TakeoverAction =
  | { action: 'none' }
  /** 같은 세션 — 다른 기기의 일시정지 등 최신 상태를 받아들인다 */
  | { action: 'sync'; timer: ActiveTimer }
  /** 다른 기기가 이 세션을 이미 종료·저장했다 */
  | { action: 'clear' }
  /** 다른 기기가 다른 세션을 시작했다 — 내 세션을 endAt에 끊어 저장 */
  | { action: 'close'; endAt: Millis };

/**
 * 이 기기가 시작한 타이머(local)와 서버의 타이머 문서(remote)를 비교한다.
 * remote가 null(문서 없음·캐시 비어 있음)이면 판단하지 않는다 → 기록을 잃지 않음.
 */
export function resolveRemoteTakeover(local: ActiveTimer, remote: TimerDoc | null, now: Millis): TakeoverAction {
  if (remote === null) return { action: 'none' };
  if (remote.sessionId === local.sessionId) {
    return remote.updatedAt > local.updatedAt ? { action: 'sync', timer: remote } : { action: 'none' };
  }
  if (remote.sessionId === null) {
    if (remote.lastEndedId === local.sessionId) return { action: 'clear' };
    return { action: 'close', endAt: Math.min(now, Math.max(local.startAt, remote.lastStartAt)) };
  }
  return { action: 'close', endAt: Math.min(now, Math.max(local.startAt, remote.startAt)) };
}

/** 세션 수정(기록 화면): 시작·종료를 바꾸고 범위 밖 일시정지는 잘라 다시 계산 */
export function editSession(
  s: StudySession,
  startAt: Millis,
  endAt: Millis,
  ctx: { dayStartHour: number; now: Millis },
): StudySession {
  if (endAt <= startAt) throw new Error('종료 시각은 시작 시각보다 뒤여야 합니다.');
  const pauses = s.pauses
    .map((p) => ({ start: Math.max(p.start, startAt), end: Math.min(p.end, endAt) }))
    .filter((p) => p.end > p.start);
  const durationSec = Math.floor((endAt - startAt - pausedMs(pauses, endAt)) / 1000);
  return {
    ...s,
    startAt,
    endAt,
    pauses,
    durationSec,
    studyDate: studyDateOf(startAt, ctx.dayStartHour),
    updatedAt: ctx.now,
  };
}

/** 같은 사용자의 다른 세션과 시간이 겹치는지 */
export function overlapping(s: Pick<StudySession, 'id' | 'startAt' | 'endAt'>, others: StudySession[]): StudySession[] {
  return others.filter((o) => o.id !== s.id && o.startAt < s.endAt && s.startAt < o.endAt);
}
