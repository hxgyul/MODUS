import { useData } from '@/data/DataProvider';
import { hhmmToMin, minToHHmm } from '@/domain/dates';
import { newId } from '@/domain/ids';
import type { TimetableSlot } from '@/domain/types';
import { Icon } from '@/components/ui/icons';

/** 한 요일(또는 한 날짜)의 교시 목록 편집 */
export function SlotListEditor({ slots, weekday, onChange, periodMin = 50, breakMin = 10 }: { slots: TimetableSlot[]; weekday: number; onChange: (s: TimetableSlot[]) => void; periodMin?: number; breakMin?: number }) {
  const { subjects } = useData();
  const active = subjects.filter((s) => !s.archived);
  const update = (id: string, patch: Partial<TimetableSlot>) => onChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const add = () => {
    const last = [...slots].sort((a, b) => a.start.localeCompare(b.start)).at(-1);
    const start = last ? minToHHmm(hhmmToMin(last.end) + breakMin) : '08:30';
    onChange([
      ...slots,
      { id: newId(), weekday, period: (last?.period ?? 0) + 1, label: '', subjectId: null, start, end: minToHHmm(hhmmToMin(start) + periodMin), memo: '' },
    ]);
  };

  return (
    <div>
      <ul className="space-y-3">
        {slots.map((s) => (
          <li key={s.id} className="rounded-xl border border-rule p-3">
            <div className="flex items-center gap-2">
              <input aria-label="교시" inputMode="numeric" className="field num w-14 text-center" value={s.period} onChange={(e) => update(s.id, { period: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              <span className="text-sm text-graphite">교시</span>
              <input aria-label="시작" type="time" className="field num w-auto flex-1" value={s.start} onChange={(e) => update(s.id, { start: e.target.value })} />
              <span className="text-faint">–</span>
              <input aria-label="종료" type="time" className="field num w-auto flex-1" value={s.end} onChange={(e) => update(s.id, { end: e.target.value })} />
              <button className="btn btn-quiet px-2 text-graphite" aria-label={`${s.period}교시 삭제`} onClick={() => onChange(slots.filter((x) => x.id !== s.id))}>
                <Icon name="trash" size={18} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input aria-label="과목명" className="field" placeholder="과목명 (예: 통합과학)" value={s.label} onChange={(e) => update(s.id, { label: e.target.value })} />
              <select
                aria-label="연결할 과목 (색상)"
                className="field"
                value={s.subjectId ?? ''}
                onChange={(e) => {
                  const sub = active.find((x) => x.id === e.target.value);
                  update(s.id, { subjectId: e.target.value || null, label: s.label || sub?.name || '' });
                }}
              >
                <option value="">과목 연결 안 함</option>
                {active.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
            <input aria-label="메모" className="field mt-2" placeholder="메모 (선택, 예: 수행평가)" value={s.memo} onChange={(e) => update(s.id, { memo: e.target.value })} />
          </li>
        ))}
      </ul>
      <button className="btn btn-line mt-3 w-full" onClick={add}>
        <Icon name="plus" size={18} /> 교시 추가
      </button>
    </div>
  );
}
