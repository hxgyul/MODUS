import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { useSubjectMap, useTasksInRange, useToday } from '@/data/selectors';
import { addDays, formatDateKo, hhmmToMin, isISODate, minToHHmm, parseISODate, WEEKDAY_KO, weekDates } from '@/domain/dates';
import type { TaskView } from '@/domain/recurrence';
import { isDone, subtaskProgress } from '@/domain/tasks';
import { scheduleFor, type DaySchedule } from '@/domain/timetable';
import type { SchoolEvent, Subject, TimetableSlot } from '@/domain/types';
import { Icon } from '@/components/ui/icons';
import { Segmented, SubjectDot, useNow, useSubjectColor } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { TaskEditor, type TaskEditorMode } from '@/features/tasks/TaskEditor';
import { ExceptionEditor } from '@/features/plan/ExceptionEditor';

const HOUR_PX = 52;
const DEFAULT_BLOCK_MIN = 30;
const SNAP_MIN = 30;

/** 공부일 기준 시각(분): 경계 이전(새벽) 시각은 24시 이후로 본다 */
function dayMinute(t: string, dayStartHour: number) {
  const m = hhmmToMin(t);
  return m < dayStartHour * 60 ? m + 1440 : m;
}

export function PlanPage() {
  const { settings, events } = useData();
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const anchor = isISODate(params.get('week')) ? params.get('week')! : today;
  const days = weekDates(anchor, settings.weekStartsOn);
  const from = days[0];
  const to = days[6];
  const tasks = useTasksInRange(from, to);
  const subjects = useSubjectMap();
  const { timetables, exceptions } = useData();
  const [editor, setEditor] = useState<TaskEditorMode | null>(null);
  const [exceptionDate, setExceptionDate] = useState<string | null>(null);
  const [mobileDay, setMobileDay] = useState<string>(days.includes(today) ? today : from);
  const selectedDay = days.includes(mobileDay) ? mobileDay : from;

  const schedules = useMemo(() => new Map(days.map((d) => [d, scheduleFor(d, timetables, exceptions)])), [days.join(), timetables, exceptions]); // eslint-disable-line
  const eventsByDay = useMemo(() => {
    const m = new Map<string, SchoolEvent[]>();
    for (const d of days) m.set(d, events.filter((e) => e.date <= d && (e.endDate ?? e.date) >= d));
    return m;
  }, [events, days.join()]); // eslint-disable-line

  const go = (n: number) => {
    const next = addDays(from, n * 7);
    setParams({ week: next });
    setMobileDay(next);
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="mr-auto text-[28px] font-bold">주간 계획</h1>
        <div className="flex items-center">
          <button className="btn btn-quiet px-2.5" aria-label="이전 주" onClick={() => go(-1)}><Icon name="chevronLeft" /></button>
          <button className="btn btn-quiet num px-2 text-[15px]" onClick={() => { setParams({}); setMobileDay(today); }}>
            {formatDateKo(from, false)} – {formatDateKo(to, false)}
          </button>
          <button className="btn btn-quiet px-2.5" aria-label="다음 주" onClick={() => go(1)}><Icon name="chevronRight" /></button>
        </div>
        <button className="btn btn-primary" onClick={() => setEditor({ kind: 'create', planDate: days.includes(today) ? today : from })}>
          <Icon name="plus" size={18} /> 과제
        </button>
      </header>

      <div className="hidden md:block">
        <WeekGrid days={days} today={today} tasks={tasks} schedules={schedules} eventsByDay={eventsByDay} subjects={subjects} onOpen={(t) => setEditor({ kind: 'edit', task: t })} onCreate={(date, time) => setEditor({ kind: 'create', planDate: date, planStart: time })} onException={setExceptionDate} />
      </div>
      <div className="md:hidden">
        <MobileWeek days={days} today={today} selected={selectedDay} onSelect={setMobileDay} tasks={tasks} schedules={schedules} eventsByDay={eventsByDay} subjects={subjects} onOpen={(t) => setEditor({ kind: 'edit', task: t })} onException={setExceptionDate} />
      </div>

      <TaskEditor mode={editor} onClose={() => setEditor(null)} />
      {exceptionDate && <ExceptionEditor date={exceptionDate} onClose={() => setExceptionDate(null)} />}
    </div>
  );
}

type GridProps = {
  days: string[];
  today: string;
  tasks: TaskView[];
  schedules: Map<string, DaySchedule>;
  eventsByDay: Map<string, SchoolEvent[]>;
  subjects: Map<string, Subject>;
  onOpen: (t: TaskView) => void;
  onException: (date: string) => void;
};

/** 겹치는 블록을 나란히 배치하기 위한 열 계산 */
function lanes<T extends { start: number; end: number }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { lane: number; lanes: number })[] = [];
  let group: (T & { lane: number; lanes: number })[] = [];
  let groupEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => (g.lanes = n));
    out.push(...group);
    group = [];
  };
  for (const it of sorted) {
    if (it.start >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => g.end > it.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ ...it, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}

function WeekGrid({ days, today, tasks, schedules, eventsByDay, subjects, onOpen, onCreate, onException }: GridProps & { onCreate: (date: string, time: string | null) => void }) {
  const { settings } = useData();
  const act = useActions();
  const toast = useToast();
  const color = useSubjectColor();
  const now = useNow(60_000);
  const dsh = settings.dayStartHour;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const timed = tasks.filter((t) => t.planStart);
  const untimed = tasks.filter((t) => !t.planStart);

  // 표시 범위: 기본 7시~자정, 일정이 더 이르거나 늦으면 넓힌다 (최대 경계 시각까지)
  const range = useMemo(() => {
    let lo = 7 * 60;
    let hi = 24 * 60;
    for (const t of timed) {
      const s = dayMinute(t.planStart!, dsh);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s + (t.estimateMin ?? DEFAULT_BLOCK_MIN));
    }
    for (const d of days) for (const s of schedules.get(d)!.slots) {
      lo = Math.min(lo, dayMinute(s.start, dsh));
      hi = Math.max(hi, dayMinute(s.end, dsh));
    }
    return { lo: Math.floor(lo / 60) * 60, hi: Math.min(Math.ceil(hi / 60) * 60, 1440 + dsh * 60) };
  }, [timed, schedules, days, dsh]);
  const hours = Array.from({ length: (range.hi - range.lo) / 60 }, (_, i) => range.lo / 60 + i);
  const cells = Array.from({ length: (range.hi - range.lo) / SNAP_MIN }, (_, i) => range.lo + i * SNAP_MIN);

  const onDragEnd = (e: DragEndEvent) => {
    const task = e.active.data.current?.task as TaskView | undefined;
    const target = e.over?.data.current as { date: string; minute: number | null } | undefined;
    if (!task || !target) return;
    const time = target.minute === null ? null : minToHHmm(target.minute);
    if (task.planDate === target.date && task.planStart === time) return;
    act.moveTasks([task], target.date, time);
    toast({ tone: 'info', text: `${formatDateKo(target.date)}${time ? ` ${time}` : ''}(으)로 옮겼습니다` });
  };

  const nowMin = (() => {
    const d = new Date(now);
    const m = d.getHours() * 60 + d.getMinutes();
    return m < dsh * 60 ? m + 1440 : m;
  })();

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
        {/* 요일 머리 + 요일 지정 과제 + 일정 */}
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-rule">
          <div />
          {days.map((d) => {
            const isToday = d === today;
            const sch = schedules.get(d)!;
            return (
              <DayBand key={d} date={d}>
                <div className="flex items-baseline justify-between gap-1 px-2 pt-2">
                  <span className={`text-sm font-bold ${isToday ? 'text-omr' : ''}`}>
                    {WEEKDAY_KO[parseISODate(d).getDay()]} <span className="num">{parseISODate(d).getDate()}</span>
                  </span>
                  <button className={`text-[11px] ${sch.isException ? 'font-semibold text-omr' : 'text-faint'} hover:underline`} onClick={() => onException(d)} title="이 날 시간표 변경">
                    {sch.isException ? '변경됨' : '시간표'}
                  </button>
                </div>
                <div className="space-y-1 px-1.5 pt-1.5 pb-2">
                  {eventsByDay.get(d)!.map((ev) => (
                    <div key={ev.id} className="truncate rounded-md bg-omr-soft px-1.5 py-0.5 text-[11px] font-semibold text-omr" title={ev.title}>{ev.title}</div>
                  ))}
                  {untimed.filter((t) => t.planDate === d).map((t) => (
                    <DraggableTask key={t.id} task={t}>
                      <TaskChip task={t} subject={subjects.get(t.subjectId)} onOpen={() => onOpen(t)} />
                    </DraggableTask>
                  ))}
                </div>
              </DayBand>
            );
          })}
        </div>

        {/* 시간 그리드 */}
        <div className="relative grid max-h-[calc(100dvh-260px)] grid-cols-[52px_repeat(7,minmax(0,1fr))] overflow-y-auto">
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span key={h} className="num absolute right-2 -translate-y-1/2 text-[11px] text-faint" style={{ top: i * HOUR_PX }}>
                {i === 0 ? '' : `${String(h % 24).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const dayTimed = lanes(
              timed
                .filter((t) => t.planDate === d)
                .map((t) => {
                  const start = dayMinute(t.planStart!, dsh);
                  return { t, start, end: start + Math.max(t.estimateMin ?? DEFAULT_BLOCK_MIN, 20) };
                }),
            );
            return (
              <div key={d} className="relative border-l border-rule" style={{ height: hours.length * HOUR_PX }}>
                {cells.map((m) => (
                  <Cell key={m} date={d} minute={m} top={((m - range.lo) / 60) * HOUR_PX} onCreate={() => onCreate(d, minToHHmm(m))} />
                ))}
                {schedules.get(d)!.slots.map((s) => (
                  <SlotBlock key={s.id} slot={s} top={((dayMinute(s.start, dsh) - range.lo) / 60) * HOUR_PX} height={((dayMinute(s.end, dsh) - dayMinute(s.start, dsh)) / 60) * HOUR_PX} subjectColor={s.subjectId ? color(subjects.get(s.subjectId)?.color) : undefined} />
                ))}
                {dayTimed.map(({ t, start, end, lane, lanes: n }) => (
                  <div
                    key={t.id}
                    className="absolute z-[2] px-0.5"
                    style={{ top: ((start - range.lo) / 60) * HOUR_PX + 1, height: ((end - start) / 60) * HOUR_PX - 2, left: `${(lane / n) * 100}%`, width: `${100 / n}%` }}
                  >
                    <DraggableTask task={t} fill>
                      <TaskBlock task={t} subject={subjects.get(t.subjectId)} onOpen={() => onOpen(t)} />
                    </DraggableTask>
                  </div>
                ))}
                {d === today && nowMin >= range.lo && nowMin <= range.hi && (
                  <div className="pointer-events-none absolute inset-x-0 z-[3] h-0.5 bg-omr" style={{ top: ((nowMin - range.lo) / 60) * HOUR_PX }} aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-faint">과제를 끌어 다른 요일·시간으로 옮길 수 있습니다(터치는 길게 누른 뒤). 맨 위 칸에 놓으면 시간 없이 요일만 지정됩니다. 빈 칸을 누르면 그 시간에 과제를 추가합니다.</p>
    </DndContext>
  );
}

function DayBand({ date, children }: { date: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `band-${date}`, data: { date, minute: null } });
  return (
    <div ref={setNodeRef} className={`min-h-[88px] border-l border-rule ${isOver ? 'bg-sunk' : ''}`}>
      {children}
    </div>
  );
}

function Cell({ date, minute, top, onCreate }: { date: string; minute: number; top: number; onCreate: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${date}-${minute}`, data: { date, minute } });
  return (
    <button
      ref={setNodeRef}
      onClick={onCreate}
      aria-label={`${formatDateKo(date)} ${minToHHmm(minute)}에 과제 추가`}
      tabIndex={-1}
      className={`absolute inset-x-0 border-t ${minute % 60 === 0 ? 'border-rule' : 'border-rule/40 border-dashed'} ${isOver ? 'bg-sunk' : 'hover:bg-sunk/60'}`}
      style={{ top, height: (SNAP_MIN / 60) * HOUR_PX }}
    />
  );
}

function SlotBlock({ slot, top, height, subjectColor }: { slot: TimetableSlot; top: number; height: number; subjectColor?: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0.5 z-[1] overflow-hidden rounded-md bg-sunk px-1.5 py-1" style={{ top: top + 1, height: height - 2, borderLeft: subjectColor ? `3px solid ${subjectColor}` : undefined }}>
      <p className="truncate text-[11px] leading-tight font-semibold text-graphite">{slot.period}교시 {slot.label}</p>
      {slot.memo && height > 30 && <p className="truncate text-[10px] leading-tight text-faint">{slot.memo}</p>}
    </div>
  );
}

function DraggableTask({ task, children, fill }: { task: TaskView; children: React.ReactNode; fill?: boolean }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: `task-${task.id}`, data: { task } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`touch-manipulation ${fill ? 'h-full' : ''} ${isDragging ? 'relative z-50 opacity-80 shadow-lg' : ''}`}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
    >
      {children}
    </div>
  );
}

function TaskBlock({ task, subject, onOpen }: { task: TaskView; subject: Subject | undefined; onOpen: () => void }) {
  const color = useSubjectColor();
  const done = isDone(task);
  const prog = subtaskProgress(task);
  return (
    <button onClick={onOpen} className="flex h-full w-full flex-col overflow-hidden rounded-md border border-rule bg-surface px-1.5 py-1 text-left" style={{ borderLeft: `3px solid ${color(subject?.color)}` }}>
      <span className={`line-clamp-2 text-[12px] leading-tight font-semibold ${done ? 'text-faint line-through' : ''}`}>{task.title}</span>
      <span className="num truncate text-[10px] text-graphite">
        {task.planStart}
        {prog.total > 0 && ` · ${prog.done}/${prog.total}`}
      </span>
    </button>
  );
}

function TaskChip({ task, subject, onOpen }: { task: TaskView; subject: Subject | undefined; onOpen: () => void }) {
  const done = isDone(task);
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-1.5 rounded-md border border-rule bg-surface px-1.5 py-1 text-left">
      <SubjectDot color={subject?.color} size={7} />
      <span className={`truncate text-[12px] font-semibold ${done ? 'text-faint line-through' : ''}`}>{task.title}</span>
    </button>
  );
}

/** 휴대폰: 요일 하나씩, 길게 눌러 다른 요일로 옮기기 */
function MobileWeek({ days, today, selected, onSelect, tasks, schedules, eventsByDay, subjects, onOpen, onException }: GridProps & { selected: string; onSelect: (d: string) => void }) {
  const act = useActions();
  const toast = useToast();
  const { settings } = useData();
  const [moving, setMoving] = useState<TaskView | null>(null);
  const [view, setView] = useState<'all' | 'tasks'>('all');
  const dayTasks = tasks.filter((t) => t.planDate === selected);
  const sch = schedules.get(selected)!;
  const dsh = settings.dayStartHour;

  type Item = { kind: 'slot'; slot: TimetableSlot; at: number } | { kind: 'task'; task: TaskView; at: number };
  const timeline: Item[] = [
    ...(view === 'all' ? sch.slots.map((s) => ({ kind: 'slot' as const, slot: s, at: dayMinute(s.start, dsh) })) : []),
    ...dayTasks.filter((t) => t.planStart).map((t) => ({ kind: 'task' as const, task: t, at: dayMinute(t.planStart!, dsh) })),
  ].sort((a, b) => a.at - b.at);
  const untimed = dayTasks.filter((t) => !t.planStart);

  const drop = (d: string) => {
    if (!moving) return onSelect(d);
    if (d !== moving.planDate) {
      act.moveTasks([moving], d, moving.planStart);
      toast({ tone: 'info', text: `${formatDateKo(d)}(으)로 옮겼습니다` });
    }
    setMoving(null);
  };

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 mb-4 bg-paper/95 px-4 pb-2 backdrop-blur">
        {moving && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-ink px-3 py-2 text-sm text-paper">
            <span className="truncate">"{moving.title}" — 옮길 요일을 누르세요</span>
            <button className="ml-2 font-bold" onClick={() => setMoving(null)}>취소</button>
          </div>
        )}
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const dt = parseISODate(d);
            const count = tasks.filter((t) => t.planDate === d && !isDone(t)).length;
            const on = d === selected && !moving;
            return (
              <button key={d} onClick={() => drop(d)} aria-pressed={on} className={`flex min-h-14 flex-col items-center justify-center rounded-xl text-sm ${on ? 'bg-ink text-paper' : moving ? 'border border-dashed border-ink' : 'bg-surface'} ${d === today && !on ? 'text-omr' : ''}`}>
                <span className="text-[11px]">{WEEKDAY_KO[dt.getDay()]}</span>
                <span className="num font-bold">{dt.getDate()}</span>
                <span className={`mt-0.5 size-1 rounded-full ${count ? (on ? 'bg-paper' : 'bg-graphite') : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-bold">{formatDateKo(selected)}</h2>
        <Segmented label="보기" value={view} onChange={setView} options={[{ value: 'all', label: '시간표 포함' }, { value: 'tasks', label: '과제만' }]} />
      </div>

      {eventsByDay.get(selected)!.map((e) => (
        <p key={e.id} className="mb-2 rounded-xl bg-omr-soft px-3 py-2 text-sm font-semibold text-omr">{e.title}</p>
      ))}

      {untimed.length > 0 && (
        <ul className="mb-4 rounded-2xl border border-rule bg-surface px-3">
          <li className="pt-2.5 text-xs text-graphite">시간 미정</li>
          {untimed.map((t) => (
            <MobileTask key={t.id} task={t} subject={subjects.get(t.subjectId)} onOpen={() => onOpen(t)} onLongPress={() => setMoving(t)} />
          ))}
        </ul>
      )}

      {timeline.length === 0 && untimed.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule p-6 text-center text-sm text-graphite">이 날은 계획이 없습니다.</p>
      ) : (
        <ol className="rounded-2xl border border-rule bg-surface px-3">
          {timeline.map((it) =>
            it.kind === 'slot' ? (
              <li key={`s-${it.slot.id}`} className="flex gap-3 border-b border-rule py-2.5 last:border-0">
                <span className="num w-11 pt-px text-xs text-faint">{it.slot.start}</span>
                <span className="min-w-0 flex-1 text-sm text-graphite">
                  {it.slot.period}교시 {it.slot.label}
                  {it.slot.memo && <span className="block text-xs text-faint">{it.slot.memo}</span>}
                </span>
              </li>
            ) : (
              <MobileTask key={it.task.id} task={it.task} subject={subjects.get(it.task.subjectId)} onOpen={() => onOpen(it.task)} onLongPress={() => setMoving(it.task)} timed />
            ),
          )}
        </ol>
      )}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-faint">과제를 길게 누르면 다른 요일로 옮길 수 있습니다.</p>
        <button className={`text-sm font-semibold ${sch.isException ? 'text-omr' : 'text-graphite'} underline underline-offset-4`} onClick={() => onException(selected)}>
          {sch.isException ? '변경된 시간표' : '이 날 시간표 변경'}
        </button>
      </div>
    </div>
  );
}

function MobileTask({ task, subject, onOpen, onLongPress, timed }: { task: TaskView; subject: Subject | undefined; onOpen: () => void; onLongPress: () => void; timed?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const done = isDone(task);
  const start = () => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      navigator.vibrate?.(15);
      onLongPress();
    }, 450);
  };
  const cancel = () => timer.current && clearTimeout(timer.current);
  return (
    <li className="flex gap-3 border-b border-rule py-2.5 last:border-0">
      {timed && <span className="num w-11 pt-0.5 text-xs font-semibold">{task.planStart}</span>}
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left select-none [-webkit-touch-callout:none]"
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => !fired.current && onOpen()}
      >
        <SubjectDot color={subject?.color} size={8} />
        <span className={`truncate text-[15px] font-semibold ${done ? 'text-faint line-through' : ''}`}>{task.title}</span>
        {task.estimateMin && <span className="num ml-auto flex-none text-xs text-graphite">{task.estimateMin}분</span>}
      </button>
    </li>
  );
}
