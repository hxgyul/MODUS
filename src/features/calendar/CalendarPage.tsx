import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { useSubjectMap, useTaskSeconds, useTasksInRange, useToday } from '@/data/selectors';
import { formatDateKo, monthGrid, parseISODate, WEEKDAY_KO } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { isDone } from '@/domain/tasks';
import { scheduleFor } from '@/domain/timetable';
import { EVENT_KIND_LABEL, type EventKind, type SchoolEvent } from '@/domain/types';
import { Icon } from '@/components/ui/icons';
import { Confirm, Section, Segmented, Sheet, SubjectDot, useSubjectColor } from '@/components/ui/primitives';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskEditor, type TaskEditorMode } from '@/features/tasks/TaskEditor';
import { ExceptionEditor } from '@/features/plan/ExceptionEditor';

const EXAM: EventKind[] = ['midterm', 'final', 'mock'];

export function CalendarPage() {
  const { settings, events, tasks, timetables, exceptions } = useData();
  const navigate = useNavigate();
  const today = useToday();
  const subjects = useSubjectMap();
  const color = useSubjectColor();
  const taskSec = useTaskSeconds();
  const [ym, setYm] = useState(() => {
    const d = parseISODate(today);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [editor, setEditor] = useState<TaskEditorMode | null>(null);
  const [eventEdit, setEventEdit] = useState<SchoolEvent | 'new' | null>(null);
  const [exceptionDate, setExceptionDate] = useState<string | null>(null);

  const grid = monthGrid(ym.y, ym.m, settings.weekStartsOn);
  const planned = useTasksInRange(grid[0], grid[41]);

  const byDay = useMemo(() => {
    const m = new Map<string, { tasks: number; open: number; due: number; events: SchoolEvent[]; colors: string[] }>();
    for (const d of grid) m.set(d, { tasks: 0, open: 0, due: 0, events: [], colors: [] });
    for (const t of planned) {
      const x = m.get(t.planDate!);
      if (!x) continue;
      x.tasks++;
      if (!isDone(t)) x.open++;
      const c = subjects.get(t.subjectId)?.color;
      if (c && !x.colors.includes(c)) x.colors.push(c);
    }
    for (const t of tasks) if (t.dueDate && t.status === 'active' && !isDone(t) && m.has(t.dueDate)) m.get(t.dueDate)!.due++;
    for (const e of events) for (const d of grid) if (e.date <= d && (e.endDate ?? e.date) >= d) m.get(d)!.events.push(e);
    return m;
  }, [grid.join(), planned, tasks, events, subjects]); // eslint-disable-line

  const dayTasks = planned.filter((t) => t.planDate === selected);
  const dueTasks = tasks.filter((t) => t.dueDate === selected && t.status === 'active');
  const dayEvents = byDay.get(selected)?.events ?? events.filter((e) => e.date <= selected && (e.endDate ?? e.date) >= selected);
  const sch = scheduleFor(selected, timetables, exceptions);
  const header = settings.weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  const shift = (n: number) => setYm(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[28px] font-bold">달력</h1>
        <Segmented label="보기" value="month" onChange={(v) => v === 'week' && navigate(`/plan?week=${selected}`)} options={[{ value: 'month', label: '월간' }, { value: 'week', label: '주간' }]} />
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <button className="btn btn-quiet px-2.5" aria-label="이전 달" onClick={() => shift(-1)}><Icon name="chevronLeft" /></button>
            <button className="num text-lg font-bold" onClick={() => { const d = parseISODate(today); setYm({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today); }}>
              {ym.y}년 {ym.m + 1}월
            </button>
            <button className="btn btn-quiet px-2.5" aria-label="다음 달" onClick={() => shift(1)}><Icon name="chevronRight" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-graphite">
            {header.map((w) => <div key={w} className="py-1.5">{WEEKDAY_KO[w]}</div>)}
          </div>
          <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-rule bg-rule" style={{ gap: 1 }}>
            {grid.map((d) => {
              const info = byDay.get(d)!;
              const inMonth = parseISODate(d).getMonth() === ym.m;
              const isSel = d === selected;
              const exam = info.events.some((e) => EXAM.includes(e.kind));
              return (
                <button key={d} onClick={() => setSelected(d)} aria-pressed={isSel} aria-label={`${formatDateKo(d)}, 과제 ${info.tasks}개, 일정 ${info.events.length}개`} className={`flex min-h-16 flex-col items-stretch p-1 text-left sm:min-h-24 sm:p-1.5 ${isSel ? 'bg-sunk' : 'bg-surface'} ${inMonth ? '' : 'opacity-40'}`}>
                  <span className={`num grid size-6 place-items-center rounded-full text-[13px] font-semibold ${d === today ? 'bg-ink text-paper' : exam ? 'text-omr' : ''}`}>{parseISODate(d).getDate()}</span>
                  <span className="mt-auto hidden space-y-0.5 sm:block">
                    {info.events.slice(0, 2).map((e) => (
                      <span key={e.id} className={`block truncate rounded px-1 text-[10px] font-semibold ${EXAM.includes(e.kind) ? 'bg-omr-soft text-omr' : 'bg-sunk text-graphite'}`}>{e.title}</span>
                    ))}
                  </span>
                  <span className="mt-auto flex items-center gap-0.5 pt-1 sm:mt-1">
                    {info.colors.slice(0, 4).map((c) => <span key={c} className="size-1.5 rounded-full" style={{ background: color(c) }} />)}
                    {info.events.length > 0 && <span className="size-1.5 rounded-full bg-omr sm:hidden" />}
                    {info.due > 0 && <span className="num ml-auto text-[10px] font-bold text-omr">마감{info.due > 1 ? info.due : ''}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 space-y-7 lg:mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{formatDateKo(selected)}</h2>
            <div className="flex gap-1">
              <button className="btn btn-quiet px-3 text-sm" onClick={() => setEventEdit('new')}><Icon name="plus" size={16} /> 일정</button>
              <button className="btn btn-quiet -mr-3 px-3 text-sm" onClick={() => setEditor({ kind: 'create', planDate: selected })}><Icon name="plus" size={16} /> 과제</button>
            </div>
          </div>

          <Section title="학교 일정">
            {dayEvents.length === 0 ? <p className="text-sm text-graphite">일정이 없습니다.</p> : (
              <ul className="space-y-2">
                {dayEvents.map((e) => (
                  <li key={e.id}>
                    <button className="w-full rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-left" onClick={() => setEventEdit(e)}>
                      <span className={`text-xs font-semibold ${EXAM.includes(e.kind) ? 'text-omr' : 'text-graphite'}`}>{EVENT_KIND_LABEL[e.kind]}</span>
                      <span className="block font-semibold">{e.title}</span>
                      {(e.startTime || e.endDate || e.memo) && (
                        <span className="num block text-sm text-graphite">
                          {e.startTime && `${e.startTime}${e.endTime ? `–${e.endTime}` : ''} `}
                          {e.endDate && `~${formatDateKo(e.endDate, false)} `}
                          {e.memo}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`과제 ${dayTasks.length}`}>
            {dayTasks.length === 0 ? <p className="text-sm text-graphite">계획한 과제가 없습니다.</p> : (
              <ul className="rounded-2xl border border-rule bg-surface px-4">
                {dayTasks.map((t) => <TaskRow key={t.id} task={t} subject={subjects.get(t.subjectId)} today={today} studiedSec={taskSec.get(t.id) ?? 0} onOpen={() => setEditor({ kind: 'edit', task: t })} />)}
              </ul>
            )}
          </Section>

          {dueTasks.length > 0 && (
            <Section title="이 날 마감">
              <ul className="space-y-1.5 text-sm">
                {dueTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <SubjectDot color={subjects.get(t.subjectId)?.color} size={8} />
                    <span className={isDone(t) ? 'text-faint line-through' : 'font-semibold'}>{t.title}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="시간표" aside={<button className={`text-sm font-semibold underline underline-offset-4 ${sch.isException ? 'text-omr' : 'text-graphite'}`} onClick={() => setExceptionDate(selected)}>{sch.isException ? '변경된 시간표 수정' : '이 날만 변경'}</button>}>
            {sch.note && <p className="mb-1 text-sm font-semibold">{sch.note}</p>}
            {sch.slots.length === 0 ? <p className="text-sm text-graphite">수업이 없습니다.</p> : (
              <ul className="space-y-1 text-sm">
                {sch.slots.map((s) => (
                  <li key={s.id} className="flex gap-3">
                    <span className="num w-24 flex-none text-graphite">{s.start}–{s.end}</span>
                    <span>
                      {s.period}교시 {s.label}
                      {s.memo && <span className="block text-xs text-graphite">{s.memo}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <TaskEditor mode={editor} onClose={() => setEditor(null)} />
      {eventEdit && <EventEditor event={eventEdit === 'new' ? null : eventEdit} date={selected} onClose={() => setEventEdit(null)} />}
      {exceptionDate && <ExceptionEditor date={exceptionDate} onClose={() => setExceptionDate(null)} />}
    </div>
  );
}

function EventEditor({ event, date, onClose }: { event: SchoolEvent | null; date: string; onClose: () => void }) {
  const act = useActions();
  const [title, setTitle] = useState(event?.title ?? '');
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'performance');
  const [d, setD] = useState(event?.date ?? date);
  const [end, setEnd] = useState(event?.endDate ?? '');
  const [st, setSt] = useState(event?.startTime ?? '');
  const [et, setEt] = useState(event?.endTime ?? '');
  const [memo, setMemo] = useState(event?.memo ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const save = () => {
    if (!title.trim()) return setError('일정 제목을 입력하세요.');
    if (end && end < d) return setError('종료일이 시작일보다 빠릅니다.');
    if (st && et && et <= st) return setError('종료 시간이 시작 시간보다 빠릅니다.');
    act.saveEvent({ id: event?.id ?? newId(), title: title.trim(), kind, date: d, endDate: end && end !== d ? end : null, startTime: st || null, endTime: st && et ? et : null, memo: memo.trim(), createdAt: event?.createdAt });
    onClose();
  };

  return (
    <>
      <Sheet
        open={!confirm}
        onClose={onClose}
        title={event ? '일정 수정' : '학교 일정 추가'}
        footer={
          <>
            {event && <button className="btn btn-quiet btn-danger" onClick={() => setConfirm(true)}>삭제</button>}
            <button className="btn btn-primary ml-auto min-w-28" onClick={save}>{event ? '저장' : '추가'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="ev-title">제목</label>
            <input id="ev-title" className="field text-[17px] font-semibold" placeholder="예: 통합과학 수행평가" value={title} autoFocus={!event} onChange={(e) => { setTitle(e.target.value); setError(null); }} />
          </div>
          <div>
            <span className="label">종류</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EVENT_KIND_LABEL) as EventKind[]).map((k) => (
                <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)} className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold ${kind === k ? 'border-ink bg-ink text-paper' : 'border-rule bg-surface'}`}>{EVENT_KIND_LABEL[k]}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="ev-date">날짜</label><input id="ev-date" type="date" className="field" value={d} onChange={(e) => setD(e.target.value)} /></div>
            <div><label className="label" htmlFor="ev-end">끝나는 날 (여러 날일 때)</label><input id="ev-end" type="date" className="field" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div><label className="label" htmlFor="ev-st">시작 시간 (선택)</label><input id="ev-st" type="time" className="field" value={st} onChange={(e) => setSt(e.target.value)} /></div>
            <div><label className="label" htmlFor="ev-et">종료 시간 (선택)</label><input id="ev-et" type="time" className="field" value={et} disabled={!st} onChange={(e) => setEt(e.target.value)} /></div>
          </div>
          <div><label className="label" htmlFor="ev-memo">메모</label><input id="ev-memo" className="field" placeholder="예: 시험 범위 1~3단원" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
          {error && <p role="alert" className="text-sm font-semibold text-omr">{error}</p>}
        </div>
      </Sheet>
      {event && <Confirm open={confirm} onClose={() => setConfirm(false)} title="일정 삭제" danger confirmLabel="삭제" body={`"${event.title}" 일정을 삭제합니다.`} onConfirm={() => { act.deleteEvent(event.id); onClose(); }} />}
    </>
  );
}
