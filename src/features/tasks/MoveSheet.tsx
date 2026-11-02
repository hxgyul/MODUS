import { useState } from 'react';
import { useActions } from '@/data/actions';
import { addDays, formatDateKo } from '@/domain/dates';
import type { TaskView } from '@/domain/recurrence';
import { Sheet } from '@/components/ui/primitives';

/** 하나 또는 여러 과제의 계획 날짜·시간 변경 (드래그 없이 이동하는 방법) */
export function MoveSheet({ tasks, onClose, onDone }: { tasks: TaskView[] | null; onClose: () => void; onDone?: () => void }) {
  const act = useActions();
  const today = act.today();
  const single = tasks?.length === 1 ? tasks[0] : null;
  const [date, setDate] = useState<string>(today);
  const [time, setTime] = useState<string>(single?.planStart ?? '');

  if (!tasks) return null;
  const quick = [
    { label: '오늘', v: today },
    { label: '내일', v: addDays(today, 1) },
    { label: '모레', v: addDays(today, 2) },
  ];
  const apply = (d: string | null) => {
    act.moveTasks(tasks, d, d && time ? time : null);
    onDone?.();
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={single ? '날짜·시간 변경' : `과제 ${tasks.length}개 옮기기`}
      footer={
        <>
          <button className="btn btn-quiet" onClick={() => apply(null)}>날짜 미정으로</button>
          <button className="btn btn-primary ml-auto min-w-28" onClick={() => apply(date)} disabled={!date}>
            옮기기
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-graphite">계획 날짜만 바뀝니다. 마감일, 세부 과제, 공부 기록은 그대로입니다.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button key={q.label} aria-pressed={date === q.v} onClick={() => setDate(q.v)} className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${date === q.v ? 'border-ink bg-ink text-paper' : 'border-rule bg-surface'}`}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="move-date">날짜</label>
          <input id="move-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="move-time">시간 (선택)</label>
          <input id="move-time" type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      {date && <p className="mt-2 text-xs text-faint">{formatDateKo(date)}{time ? ` ${time}` : ''}</p>}
    </Sheet>
  );
}
