import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { useSubjectMap, useTaskSeconds, useToday } from '@/data/selectors';
import { addDays, formatDateKo, formatDuration, monthRange, msToHHmm, parseISODate, toISODate, weekDates } from '@/domain/dates';
import { matchesSearch } from '@/domain/tasks';
import { overlapping } from '@/domain/timer';
import type { StudySession } from '@/domain/types';
import { Icon } from '@/components/ui/icons';
import { Confirm, Empty, Segmented, Sheet, SubjectDot } from '@/components/ui/primitives';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskEditor, type TaskEditorMode } from '@/features/tasks/TaskEditor';

type Range = 'day' | 'week' | 'month' | 'all';

export function RecordsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'tasks' ? 'tasks' : 'sessions';
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/stats" className="btn btn-quiet -ml-3 mb-2 text-graphite"><Icon name="chevronLeft" size={18} /> 통계</Link>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold">기록 조회</h1>
        <Segmented label="종류" value={tab} onChange={(v) => { const p = new URLSearchParams(params); p.set('tab', v); setParams(p); }} options={[{ value: 'sessions', label: '공부 기록' }, { value: 'tasks', label: '과제 찾기' }]} />
      </header>
      {tab === 'sessions' ? <SessionLog /> : <TaskSearch />}
    </div>
  );
}

function SessionLog() {
  const { sessions, subjects, tasks, settings } = useData();
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const subjectMap = useSubjectMap();
  const [range, setRange] = useState<Range>(params.get('task') ? 'all' : 'week');
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<StudySession | null>(null);
  const subjectId = params.get('subject') ?? '';
  const taskId = params.get('task') ?? '';
  const taskTitle = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  const bounds = useMemo(() => {
    if (range === 'day') return { from: date, to: date };
    if (range === 'week') { const w = weekDates(date, settings.weekStartsOn); return { from: w[0], to: w[6] }; }
    if (range === 'month') { const d = parseISODate(date); return monthRange(d.getFullYear(), d.getMonth()); }
    return { from: '0000-01-01', to: '9999-12-31' };
  }, [range, date, settings.weekStartsOn]);

  const list = sessions.filter(
    (s) => s.studyDate >= bounds.from && s.studyDate <= bounds.to && (!subjectId || s.subjectId === subjectId) && (!taskId || s.taskId === taskId),
  );
  const groups = new Map<string, StudySession[]>();
  for (const s of list) groups.set(s.studyDate, [...(groups.get(s.studyDate) ?? []), s]);
  const total = list.reduce((a, s) => a + s.durationSec, 0);
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
  const step = (n: number) => setDate((d) => (range === 'day' ? addDays(d, n) : range === 'week' ? addDays(d, n * 7) : toISODate(new Date(parseISODate(d).getFullYear(), parseISODate(d).getMonth() + n, 1))));

  return (
    <div>
      <div className="mb-4 space-y-3 rounded-2xl border border-rule bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="기간" value={range} onChange={setRange} options={[{ value: 'day', label: '일' }, { value: 'week', label: '주' }, { value: 'month', label: '월' }, { value: 'all', label: '전체' }]} />
          {range !== 'all' && (
            <div className="flex items-center">
              <button className="btn btn-quiet px-2" aria-label="이전" onClick={() => step(-1)}><Icon name="chevronLeft" size={18} /></button>
              <input type="date" aria-label="기준 날짜" className="field num w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <button className="btn btn-quiet px-2" aria-label="다음" onClick={() => step(1)}><Icon name="chevronRight" size={18} /></button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="과목" className="field w-auto" value={subjectId} onChange={(e) => setParam('subject', e.target.value)}>
            <option value="">모든 과목</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}{s.archived ? ' (보관)' : ''}</option>)}
          </select>
          {taskId && (
            <button className="btn btn-line text-sm" onClick={() => setParam('task', '')}>
              과제: {taskTitle.get(taskId) ?? '삭제된 과제'} <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>

      <p className="num mb-3 text-sm text-graphite">{range === 'all' ? '전체 기간' : `${formatDateKo(bounds.from, false)} – ${formatDateKo(bounds.to, false)}`} · {list.length}회 · <b className="text-ink">{formatDuration(total)}</b></p>

      {list.length === 0 ? (
        <Empty title="조건에 맞는 공부 기록이 없습니다" body="기간이나 과목을 바꿔 보세요." />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([d, items]) => (
            <section key={d}>
              <h2 className="num mb-1.5 flex justify-between text-sm font-bold"><span>{formatDateKo(d)}</span><span>{formatDuration(items.reduce((a, s) => a + s.durationSec, 0))}</span></h2>
              <ul className="divide-y divide-rule rounded-2xl border border-rule bg-surface px-4">
                {items.map((s) => (
                  <li key={s.id}>
                    <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => setEditing(s)}>
                      <SubjectDot color={subjectMap.get(s.subjectId)?.color} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{subjectMap.get(s.subjectId)?.name ?? '삭제된 과목'} · {s.taskId ? (taskTitle.get(s.taskId) ?? '삭제된 과제') : '자유 공부'}</span>
                        <span className="num text-xs text-graphite">{msToHHmm(s.startAt)}–{msToHHmm(s.endAt)}{s.pauses.length > 0 && ` · 쉼 ${s.pauses.length}회 제외`}</span>
                      </span>
                      <span className="num text-sm font-semibold">{formatDuration(s.durationSec)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing && <SessionEditor session={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${toISODate(d)}T${msToHHmm(ms)}`;
};
const fromLocalInput = (v: string) => new Date(v).getTime();

/** 타이머 끄는 것을 잊은 경우 등 — 시작·종료 시각 수정, 삭제 */
function SessionEditor({ session, onClose }: { session: StudySession; onClose: () => void }) {
  const { sessions } = useData();
  const act = useActions();
  const [start, setStart] = useState(toLocalInput(session.startAt));
  const [end, setEnd] = useState(toLocalInput(session.endAt));
  const [confirm, setConfirm] = useState(false);
  const s = fromLocalInput(start);
  const e = fromLocalInput(end);
  const valid = Number.isFinite(s) && Number.isFinite(e) && e > s;
  const clash = valid ? overlapping({ id: session.id, startAt: s, endAt: e }, sessions) : [];
  const tooLong = valid && e - s > 12 * 3600_000;

  return (
    <>
      <Sheet
        open={!confirm}
        onClose={onClose}
        title="공부 기록 수정"
        footer={
          <>
            <button className="btn btn-quiet btn-danger" onClick={() => setConfirm(true)}>삭제</button>
            <button className="btn btn-primary ml-auto min-w-28" disabled={!valid} onClick={() => { act.updateSession(session, s, e); onClose(); }}>저장</button>
          </>
        }
      >
        <p className="mb-4 text-sm text-graphite">타이머 끄는 것을 잊었을 때처럼 실제와 다른 기록을 바로잡습니다. 일시정지한 시간은 계속 제외됩니다.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="ss-start">시작</label><input id="ss-start" type="datetime-local" className="field num" value={start} onChange={(x) => setStart(x.target.value)} /></div>
          <div><label className="label" htmlFor="ss-end">종료</label><input id="ss-end" type="datetime-local" className="field num" value={end} onChange={(x) => setEnd(x.target.value)} /></div>
        </div>
        {!valid && <p role="alert" className="mt-3 text-sm font-semibold text-omr">종료 시각은 시작 시각보다 뒤여야 합니다.</p>}
        {clash.length > 0 && <p role="alert" className="mt-3 text-sm font-semibold text-omr">다른 공부 기록 {clash.length}개와 시간이 겹칩니다. 저장하면 겹친 시간이 두 번 계산됩니다.</p>}
        {tooLong && <p className="mt-3 text-sm text-graphite">12시간이 넘는 기록입니다. 시각을 다시 확인하세요.</p>}
      </Sheet>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="기록 삭제" danger confirmLabel="삭제" body="이 공부 기록을 삭제하면 과목·과제 시간과 통계에서 빠집니다." onConfirm={() => { act.deleteSession(session); onClose(); }} />
    </>
  );
}

function TaskSearch() {
  const { tasks, subjects } = useData();
  const today = useToday();
  const subjectMap = useSubjectMap();
  const taskSec = useTaskSeconds();
  const [text, setText] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [done, setDone] = useState<'all' | 'open' | 'done'>('all');
  const [date, setDate] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [editor, setEditor] = useState<TaskEditorMode | null>(null);

  const results = tasks
    .filter((t) => matchesSearch(t, { text, subjectId: subjectId || null, done, date: date || null, dueFrom: dueFrom || null, dueTo: dueTo || null }))
    .sort((a, b) => (b.planDate ?? '').localeCompare(a.planDate ?? '') || b.createdAt - a.createdAt)
    .slice(0, 200);

  return (
    <div>
      <div className="mb-4 space-y-3 rounded-2xl border border-rule bg-surface p-3">
        <div className="relative">
          <Icon name="search" size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input className="field pl-10" placeholder="과제명 검색" value={text} onChange={(e) => setText(e.target.value)} aria-label="과제명 검색" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="과목" className="field w-auto" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">모든 과목</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Segmented label="완료 여부" value={done} onChange={setDone} options={[{ value: 'all', label: '전체' }, { value: 'open', label: '미완료' }, { value: 'done', label: '완료' }]} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-xs text-graphite">계획 날짜<input type="date" className="field mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="text-xs text-graphite">마감일 부터<input type="date" className="field mt-1" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} /></label>
          <label className="text-xs text-graphite">마감일 까지<input type="date" className="field mt-1" value={dueTo} onChange={(e) => setDueTo(e.target.value)} /></label>
        </div>
      </div>
      <p className="mb-2 text-sm text-graphite">{results.length}개{results.length === 200 ? ' (최근 200개까지 표시)' : ''} · 반복 과제는 손댄(완료·이동·수정한) 날짜만 검색됩니다.</p>
      {results.length === 0 ? <Empty title="찾는 과제가 없습니다" /> : (
        <ul className="rounded-2xl border border-rule bg-surface px-4">
          {results.map((t) => (
            <TaskRow key={t.id} task={t} subject={subjectMap.get(t.subjectId)} today={today} studiedSec={taskSec.get(t.id) ?? 0} onOpen={() => setEditor({ kind: 'edit', task: t })} showDate />
          ))}
        </ul>
      )}
      <TaskEditor mode={editor} onClose={() => setEditor(null)} />
    </div>
  );
}
