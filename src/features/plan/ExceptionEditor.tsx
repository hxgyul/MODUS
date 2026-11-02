import { useState } from 'react';
import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { formatDateKo, weekdayOf } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { scheduleFor, validateSlots } from '@/domain/timetable';
import type { TimetableSlot } from '@/domain/types';
import { Sheet } from '@/components/ui/primitives';
import { SlotListEditor } from '@/features/timetable/SlotEditor';

/** 특정 날짜만 수업 추가·수정·삭제 — 기본 시간표는 바뀌지 않는다 */
export function ExceptionEditor({ date, onClose }: { date: string; onClose: () => void }) {
  const { timetables, exceptions } = useData();
  const act = useActions();
  const current = scheduleFor(date, timetables, exceptions);
  const existing = exceptions.get(date);
  // 기본 시간표를 복사해서 시작 (ID는 새로 — 기본 시간표와 완전히 분리)
  const [slots, setSlots] = useState<TimetableSlot[]>(() => current.slots.map((s) => (existing ? s : { ...s, id: newId() })));
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const err = validateSlots(slots);
    if (err) return setError(err);
    act.saveException(date, slots.map((s) => ({ ...s, weekday: weekdayOf(date) })), note.trim(), existing?.createdAt);
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${formatDateKo(date)} 시간표`}
      footer={
        <>
          {existing && (
            <button className="btn btn-quiet" onClick={() => { act.deleteException(date); onClose(); }}>
              기본으로 되돌리기
            </button>
          )}
          <button className="btn btn-primary ml-auto min-w-28" onClick={save}>이 날만 저장</button>
        </>
      }
    >
      <p className="mb-4 text-sm text-graphite">시험·행사처럼 이 날만 다른 수업을 입력합니다. 매주 반복되는 기본 시간표는 바뀌지 않습니다.</p>
      <label className="label" htmlFor="ex-note">이 날 메모 (선택)</label>
      <input id="ex-note" className="field mb-4" placeholder="예: 중간고사 1일차" value={note} onChange={(e) => setNote(e.target.value)} />
      <SlotListEditor slots={slots} weekday={weekdayOf(date)} onChange={(s) => { setSlots(s); setError(null); }} />
      {slots.length === 0 && <p className="mt-2 text-sm text-graphite">교시를 모두 지우고 저장하면 이 날은 수업이 없는 날이 됩니다.</p>}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-omr">{error}</p>}
    </Sheet>
  );
}
