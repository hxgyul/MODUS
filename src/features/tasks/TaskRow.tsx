import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { dueLabel, formatDateKo, formatDuration } from '@/domain/dates';
import type { TaskView } from '@/domain/recurrence';
import { isComposite, isDone, subtaskProgress } from '@/domain/tasks';
import type { Subject } from '@/domain/types';
import { Icon } from '@/components/ui/icons';
import { Check, SubjectDot } from '@/components/ui/primitives';

export function TaskRow({
  task,
  subject,
  today,
  studiedSec,
  onOpen,
  showDate,
  selectable,
  selected,
  onSelect,
}: {
  task: TaskView;
  subject: Subject | undefined;
  today: string;
  studiedSec: number;
  onOpen: () => void;
  showDate?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { activeTimer } = useData();
  const act = useActions();
  const done = isDone(task);
  const composite = isComposite(task);
  const prog = subtaskProgress(task);
  const running = activeTimer?.taskId === task.id;
  const doneToday = done && task.completedOn === today;
  const overdueDue = task.dueDate && !done && task.dueDate < today;

  const meta: string[] = [];
  if (showDate && task.planDate) meta.push(formatDateKo(task.planDate));
  if (task.planStart) meta.push(task.planStart);
  if (task.estimateMin) meta.push(`예상 ${formatDuration(task.estimateMin * 60)}`);
  if (studiedSec > 0) meta.push(`공부 ${formatDuration(studiedSec)}`);

  return (
    <li className="border-b border-rule last:border-b-0">
      <div className="flex items-start gap-3 py-3">
        <div className="pt-0.5">
          {selectable ? (
            <Check on={Boolean(selected)} onChange={onSelect} label={`${task.title} 선택`} />
          ) : composite ? (
            <ProgressBox done={prog.done} total={prog.total} />
          ) : (
            <Check on={done} onChange={() => act.setDone(task, !done)} label={`${task.title} ${done ? '완료 취소' : '완료'}`} />
          )}
        </div>

        <button className="min-w-0 flex-1 text-left" onClick={selectable ? onSelect : onOpen}>
          <span className={`block text-[15px] leading-snug font-semibold ${done ? 'text-faint line-through decoration-1' : ''}`}>
            {task.title}
            {task.recurrenceId && <Icon name="repeat" size={13} className="ml-1.5 inline -translate-y-px text-faint" />}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-graphite">
            <span className="flex items-center gap-1.5">
              <SubjectDot color={subject?.color} size={8} />
              {subject?.name ?? '과목 없음'}
            </span>
            {meta.map((m) => (
              <span key={m} className="num">{m}</span>
            ))}
            {task.dueDate && !done && (
              <span className={`num font-semibold ${overdueDue ? 'text-omr' : ''}`}>{dueLabel(task.dueDate, today)}</span>
            )}
            {doneToday && <span className="font-semibold text-ink">완료</span>}
          </span>
        </button>

        {!selectable && !done && (
          <button
            className={`grid size-11 flex-none place-items-center rounded-full ${running ? 'bg-omr-soft text-omr' : 'bg-sunk text-ink'}`}
            aria-label={running ? `${task.title} 공부 중` : `${task.title} 공부 시작`}
            onClick={() => (running ? undefined : act.startStudy(task.subjectId, task))}
            aria-disabled={running}
          >
            {running ? <span className="live-dot" /> : <Icon name="play" size={18} />}
          </button>
        )}
      </div>

      {composite && !selectable && (
        <ul className="-mt-1 mb-3 ml-[34px] space-y-0.5">
          {task.subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-1">
              <Check on={s.doneAt !== null} onChange={() => act.toggleSub(task, s.id)} label={`${s.title} ${s.doneAt ? '완료 취소' : '완료'}`} />
              <span className={`text-sm ${s.doneAt ? 'text-faint line-through' : ''}`}>{s.title}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** 복합 과제의 진행 상태 — 직접 누르지 않고 하위 과제로 완료 */
function ProgressBox({ done, total }: { done: number; total: number }) {
  const all = done === total;
  return (
    <span className="check num text-[10px] font-bold" data-on={all} aria-label={`세부 과제 ${total}개 중 ${done}개 완료`} role="img">
      {all ? <Icon name="check" size={14} /> : `${done}/${total}`}
    </span>
  );
}
