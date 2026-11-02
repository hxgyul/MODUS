import { weekdayOf } from './dates';
import type { ISODate, Timetable, TimetableException, TimetableSlot } from './types';

/** 날짜에 적용되는 학기 시간표 (validFrom이 가장 늦은 것 우선) */
export function timetableFor(date: ISODate, tables: Timetable[]): Timetable | null {
  const candidates = tables
    .filter((t) => t.validFrom <= date && (t.validTo === null || t.validTo >= date))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  return candidates[0] ?? null;
}

export interface DaySchedule {
  slots: TimetableSlot[];
  isException: boolean;
  note: string;
}

/** 날짜별 예외가 있으면 그것을, 없으면 기본 시간표의 해당 요일을 쓴다 */
export function scheduleFor(
  date: ISODate,
  tables: Timetable[],
  exceptions: Map<ISODate, TimetableException>,
): DaySchedule {
  const ex = exceptions.get(date);
  if (ex) return { slots: sortSlots(ex.slots), isException: true, note: ex.note };
  const tt = timetableFor(date, tables);
  const wd = weekdayOf(date);
  return { slots: tt ? sortSlots(tt.slots.filter((s) => s.weekday === wd)) : [], isException: false, note: '' };
}

export function sortSlots(slots: TimetableSlot[]): TimetableSlot[] {
  return [...slots].sort((a, b) => a.start.localeCompare(b.start) || a.period - b.period);
}

/** 시간 겹침·역순 검사 — 저장 전 검증 */
export function validateSlots(slots: TimetableSlot[]): string | null {
  for (const s of slots) {
    if (!s.label.trim()) return `${s.period}교시 과목명을 입력하세요.`;
    if (s.end <= s.start) return `${s.period}교시 종료 시각이 시작보다 빠릅니다.`;
  }
  const byDay = new Map<number, TimetableSlot[]>();
  for (const s of slots) byDay.set(s.weekday, [...(byDay.get(s.weekday) ?? []), s]);
  for (const list of byDay.values()) {
    const sorted = sortSlots(list);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) return `${sorted[i - 1].period}교시와 ${sorted[i].period}교시 시간이 겹칩니다.`;
    }
  }
  return null;
}
