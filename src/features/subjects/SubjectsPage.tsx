import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { useToday } from '@/data/selectors';
import { formatDuration } from '@/domain/dates';
import { expandTasks } from '@/domain/recurrence';
import { isDone } from '@/domain/tasks';
import { elapsedSec } from '@/domain/timer';
import type { Subject } from '@/domain/types';
import { COLOR_KEYS, nextColor, SUBJECT_COLORS } from '@/components/ui/colors';
import { Icon } from '@/components/ui/icons';
import { Confirm, Sheet, useNow, useSubjectColor } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { OVERDUE_LOOKBACK_DAYS } from '@/data/selectors';
import { addDays } from '@/domain/dates';

export function SubjectsPage() {
  const { subjects, sessions, tasks, recurrences, activeTimer } = useData();
  const now = useNow(1000);
  const today = useToday(now);
  const color = useSubjectColor();
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);
  const [manage, setManage] = useState(false);
  const act = useActions();

  const active = subjects.filter((s) => !s.archived);
  const archived = subjects.filter((s) => s.archived);

  const stats = useMemo(() => {
    const todaySec = new Map<string, number>();
    for (const s of sessions) if (s.studyDate === today) todaySec.set(s.subjectId, (todaySec.get(s.subjectId) ?? 0) + s.durationSec);
    // 미완료 과제 수: 오늘까지 계획된(또는 날짜 미정) 미완료 과제
    const window = expandTasks(tasks, recurrences, addDays(today, -OVERDUE_LOOKBACK_DAYS), today);
    const undated = tasks.filter((t) => t.planDate === null && t.status === 'active');
    const older = tasks.filter((t) => !t.recurrenceId && t.status === 'active' && t.planDate !== null && t.planDate < addDays(today, -OVERDUE_LOOKBACK_DAYS));
    const open = new Map<string, number>();
    for (const t of [...window, ...undated, ...older]) if (!isDone(t)) open.set(t.subjectId, (open.get(t.subjectId) ?? 0) + 1);
    return { todaySec, open };
  }, [sessions, tasks, recurrences, today]);

  const move = (i: number, dir: -1 | 1) => {
    const list = [...active];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    act.reorderSubjects(list);
  };

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-6 flex items-end justify-between">
        <h1 className="text-[28px] font-bold">과목</h1>
        {active.length > 0 && (
          <button className="btn btn-quiet -mr-3" onClick={() => setManage((v) => !v)} aria-pressed={manage}>
            {manage ? '완료' : '편집'}
          </button>
        )}
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {active.map((s, i) => {
          const live = activeTimer?.subjectId === s.id ? elapsedSec(activeTimer, now) : 0;
          const sec = (stats.todaySec.get(s.id) ?? 0) + live;
          const open = stats.open.get(s.id) ?? 0;
          const body = (
            <>
              <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: color(s.color) }} />
              <span className="flex items-start justify-between gap-2">
                <span className="text-[17px] leading-snug font-bold">{s.name}</span>
                {live > 0 && <span className="live-dot mt-2" aria-label="공부 중" />}
              </span>
              <span className="mt-auto">
                <span className="num block text-[22px] font-bold">{formatDuration(sec)}</span>
                <span className="text-[13px] text-graphite">오늘 · 미완료 {open}개</span>
              </span>
            </>
          );
          return (
            <li key={s.id} className="relative">
              {manage ? (
                <div className="relative flex aspect-[1/1.05] flex-col overflow-hidden rounded-2xl border border-rule bg-surface p-4 pt-5">
                  {body}
                  <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-surface/90 p-2 backdrop-blur-[2px]">
                    <p className="mb-auto p-2 text-[15px] font-bold">{s.name}</p>
                    <div className="flex gap-1">
                      <button className="btn btn-line flex-1 px-0" aria-label={`${s.name} 앞으로`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronLeft" size={18} /></button>
                      <button className="btn btn-line flex-1 px-0" aria-label={`${s.name} 뒤로`} disabled={i === active.length - 1} onClick={() => move(i, 1)}><Icon name="chevronRight" size={18} /></button>
                    </div>
                    <button className="btn btn-primary" onClick={() => setEditing(s)}>이름·색상·보관</button>
                  </div>
                </div>
              ) : (
                <Link to={`/subjects/${s.id}`} className="relative flex aspect-[1/1.05] flex-col overflow-hidden rounded-2xl border border-rule bg-surface p-4 pt-5 active:bg-sunk">
                  {body}
                </Link>
              )}
            </li>
          );
        })}
        <li>
          <button onClick={() => setEditing('new')} className="flex aspect-[1/1.05] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-rule text-graphite">
            <Icon name="plus" size={24} />
            <span className="text-sm font-semibold">과목 추가</span>
          </button>
        </li>
      </ul>

      {archived.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm font-semibold text-graphite">보관한 과목 {archived.length}</summary>
          <ul className="mt-3 divide-y divide-rule rounded-2xl border border-rule bg-surface px-4">
            {archived.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2 text-sm"><span className="size-2.5 rounded-full" style={{ background: color(s.color) }} />{s.name}</span>
                <button className="btn btn-quiet text-sm" onClick={() => act.updateSubject(s, { archived: false })}>다시 사용</button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">보관한 과목의 공부 기록과 과제는 통계와 기록 조회에 그대로 남습니다.</p>
        </details>
      )}

      {editing && <SubjectEditor subject={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SubjectEditor({ subject, onClose }: { subject: Subject | null; onClose: () => void }) {
  const { subjects } = useData();
  const act = useActions();
  const toast = useToast();
  const color = useSubjectColor();
  const [name, setName] = useState(subject?.name ?? '');
  const [c, setC] = useState(subject?.color ?? nextColor(subjects.map((s) => s.color)));
  const [confirm, setConfirm] = useState(false);
  const dup = subjects.some((s) => s.id !== subject?.id && !s.archived && s.name.trim() === name.trim());
  const inUse = subject ? act.subjectInUse(subject.id) : false;

  const save = () => {
    if (!name.trim() || dup) return;
    if (subject) act.updateSubject(subject, { name: name.trim(), color: c });
    else act.addSubject(name, c);
    onClose();
  };

  return (
    <>
      <Sheet
        open={!confirm}
        onClose={onClose}
        title={subject ? '과목 수정' : '과목 추가'}
        footer={
          <>
            {subject && <button className="btn btn-quiet btn-danger" onClick={() => setConfirm(true)}>{inUse ? '보관' : '삭제'}</button>}
            <button className="btn btn-primary ml-auto min-w-28" disabled={!name.trim() || dup} onClick={save}>{subject ? '저장' : '추가'}</button>
          </>
        }
      >
        <label className="label" htmlFor="subject-name">과목 이름</label>
        <input id="subject-name" className="field text-[17px] font-semibold" placeholder="예: 공통수학" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()} />
        {dup && <p className="mt-1.5 text-sm text-omr">같은 이름의 과목이 이미 있습니다.</p>}
        <span className="label mt-5">색상</span>
        <div className="grid grid-cols-4 gap-2.5" role="radiogroup" aria-label="과목 색상">
          {COLOR_KEYS.map((k) => (
            <button key={k} role="radio" aria-checked={c === k} aria-label={SUBJECT_COLORS[k].name} onClick={() => setC(k)} className={`grid aspect-square place-items-center rounded-xl ${c === k ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`} style={{ background: color(k) }}>
              {c === k && <Icon name="check" size={18} className="text-white" strokeWidth={2.4} />}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">이 색은 과제, 시간표, 통계에서 같은 과목을 나타냅니다.</p>
      </Sheet>
      {subject && (
        <Confirm
          open={confirm}
          onClose={() => setConfirm(false)}
          title={inUse ? '과목 보관' : '과목 삭제'}
          danger
          confirmLabel={inUse ? '보관' : '삭제'}
          body={inUse ? `"${subject.name}"에 과제나 공부 기록이 있어 삭제하지 않고 보관합니다. 기록은 통계에 남고, 과목 목록에서만 숨겨집니다.` : `"${subject.name}" 과목을 삭제합니다.`}
          onConfirm={() => {
            const r = act.removeSubject(subject);
            toast({ tone: 'info', text: r === 'archived' ? '과목을 보관했습니다' : '과목을 삭제했습니다' });
            onClose();
          }}
        />
      )}
    </>
  );
}
