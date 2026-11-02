import type { HHmm, ISODate, Millis } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 로컬 시각 기준 'yyyy-MM-dd' */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'yyyy-MM-dd' → 로컬 자정 Date */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISODate(parseISODate(s)) === s;
}

/**
 * 시각이 속한 "공부일".
 * dayStartHour 이전 시각(예: 새벽 1시, 경계 4시)은 전날로 계산한다.
 */
export function studyDateOf(ms: Millis, dayStartHour: number): ISODate {
  const d = new Date(ms);
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return toISODate(d);
}

/** 공부일 시작 시각(경계 시각)의 epoch ms */
export function studyDayStartMs(date: ISODate, dayStartHour: number): Millis {
  const d = parseISODate(date);
  d.setHours(dayStartHour, 0, 0, 0);
  return d.getTime();
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 0=일 … 6=토 */
export function weekdayOf(date: ISODate): number {
  return parseISODate(date).getDay();
}

export function diffDays(a: ISODate, b: ISODate): number {
  // 일광절약시간이 없는 지역에서도 안전하도록 반올림
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

export function startOfWeek(date: ISODate, weekStartsOn: 0 | 1): ISODate {
  const wd = weekdayOf(date);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDays(date, -back);
}

export function weekDates(date: ISODate, weekStartsOn: 0 | 1): ISODate[] {
  const s = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** 월간 달력 칸 (해당 월을 포함하는 6주 = 42칸) */
export function monthGrid(year: number, month0: number, weekStartsOn: 0 | 1): ISODate[] {
  const first = toISODate(new Date(year, month0, 1));
  const s = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(s, i));
}

export function monthRange(year: number, month0: number): { from: ISODate; to: ISODate } {
  return {
    from: toISODate(new Date(year, month0, 1)),
    to: toISODate(new Date(year, month0 + 1, 0)),
  };
}

export function hhmmToMin(t: HHmm): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToHHmm(min: number): HHmm {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function isHHmm(s: unknown): s is HHmm {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** "11월 2일 (월)" */
export function formatDateKo(date: ISODate, withWeekday = true): string {
  const d = parseISODate(date);
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return withWeekday ? `${base} (${WEEKDAY_KO[d.getDay()]})` : base;
}

/** "1시간 5분", "12분", "0분" */
export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** "1:02:05" / "02:05" */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

/** epoch ms → 'HH:mm' (로컬) */
export function msToHHmm(ms: Millis): HHmm {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 마감까지 남은 날 표기: "오늘", "내일", "D-3", "2일 지남" */
export function dueLabel(due: ISODate, today: ISODate): string {
  const n = diffDays(due, today);
  if (n === 0) return '오늘 마감';
  if (n === 1) return '내일 마감';
  if (n > 1) return `D-${n}`;
  return `${-n}일 지남`;
}
