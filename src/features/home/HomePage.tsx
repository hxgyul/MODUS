import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { useOverdue, useSubjectMap, useSubjectOrder, useTaskSeconds, useTasksInRange, useToday } from '@/data/selectors';
import { addDays, dueLabel, formatDateKo, formatDuration, WEEKDAY_KO, parseISODate } from '@/domain/dates';
import type { TaskView } from '@/domain/recurrence';
import { isDone, sortForDay, tasksForDay } from '@/domain/tasks';
import { elapsedSec } from '@/domain/timer';
import { EVENT_KIND_LABEL } from '@/domain/types';
import { Icon } from '@/components/ui/icons';
import { Empty, Section, SubjectDot, useNow } from '@/components/ui/primitives';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskEditor, type TaskEditorMode } from '@/features/tasks/TaskEditor';
import { MoveSheet } from '@/features/tasks/MoveSheet';
import { TodaySchedule } from '@/features/plan/TodaySchedule';

export function HomePage() {
  const { subjects, sessions, activeTimer, events, tasks } = useData();
  const act = useActions();
  const now = useNow(1000);
  const today = useToday(now);
  const subjectMap = useSubjectMap();
  const order = useSubjectOrder();
  const taskSec = useTaskSeconds();
  const [editor, setEditor] = useState<TaskEditorMode | null>(null);
  const [moving, setMoving] = useState<TaskView[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const dayTasks = useTasksInRange(today, today);
  const list = useMemo(() => sortForDay(tasksForDay(dayTasks, today), order), [dayTasks, today, order]);
  const overdue = useOverdue(today);
  const openCount = list.filter((t) => !isDone(t)).length;

  // 오늘 공부 시간 = 저장된 세션 + 실행 중 타이머(오늘 시작분)
  const savedToday = sessions.filter((s) => s.studyDate === today).reduce((a, s) => a + s.durationSec, 0);
  const live = activeTimer ? elapsedSec(activeTimer, now) : 0;
  const totalToday = savedToday + live;

  const upcomingDue = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'active' && !isDone(t) && t.dueDate && t.dueDate <= addDays(today, 7))
        .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
        .slice(0, 5),
    [tasks, today],
  );
  const upcomingEvents = events.filter((e) => (e.endDate ?? e.date) >= today && e.date <= addDays(today, 14)).slice(0, 5);

  const d = parseISODate(today);
  const hasSubjects = subjects.some((s) => !s.archived);

  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="mx-auto max-w-[1100px] lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
      <div>
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-graphite">{d.getFullYear()}년</p>
            <h1 className="text-[28px] leading-tight font-bold">
              {d.getMonth() + 1}월 {d.getDate()}일 <span className="text-graphite">{WEEKDAY_KO[d.getDay()]}요일</span>
            </h1>
          </div>
          <div className="text-right">
            <p className="text-sm text-graphite">오늘 공부</p>
            <p className="num text-[22px] font-bold">{formatDuration(totalToday)}</p>
          </div>
        </header>

        <Section
          title={list.length ? `오늘 할 일 · ${openCount === 0 ? '모두 완료' : `${openCount}개 남음`}` : '오늘 할 일'}
          aside={
            hasSubjects && (
              <button className="btn btn-quiet -mr-3 text-[15px]" onClick={() => setEditor({ kind: 'create', planDate: today })}>
                <Icon name="plus" size={18} /> 과제
              </button>
            )
          }
        >
          {!hasSubjects ? (
            <Empty
              title="과목부터 등록하세요"
              body="공부할 과목을 만들면 과목별로 과제를 추가하고 바로 타이머를 시작할 수 있습니다."
              action={<Link to="/subjects" className="btn btn-primary">과목 등록하기</Link>}
            />
          ) : list.length === 0 ? (
            <Empty
              title="오늘 계획한 과제가 없습니다"
              body="과제를 추가하거나, 과목 화면에서 과제 없이 자유 공부를 시작할 수 있습니다."
              action={<button className="btn btn-primary" onClick={() => setEditor({ kind: 'create', planDate: today })}>과제 추가</button>}
            />
          ) : (
            <ul className="rounded-2xl border border-rule bg-surface px-4">
              {list.map((t) => (
                <TaskRow key={t.id} task={t} subject={subjectMap.get(t.subjectId)} today={today} studiedSec={taskSec.get(t.id) ?? 0} onOpen={() => setEditor({ kind: 'edit', task: t })} />
              ))}
            </ul>
          )}
        </Section>

        {overdue.length > 0 && (
          <Section
            className="mt-8"
            title={`지난 미완료 ${overdue.length}`}
            aside={
              <button className="btn btn-quiet -mr-3 text-sm" onClick={() => { setSelecting((v) => !v); setPicked(new Set()); }}>
                {selecting ? '선택 취소' : '골라서 옮기기'}
              </button>
            }
          >
            <ul className="rounded-2xl border border-rule bg-surface px-4">
              {overdue.slice(0, selecting ? undefined : 5).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  subject={subjectMap.get(t.subjectId)}
                  today={today}
                  studiedSec={taskSec.get(t.id) ?? 0}
                  onOpen={() => setMoving([t])}
                  showDate
                  selectable={selecting}
                  selected={picked.has(t.id)}
                  onSelect={() => togglePick(t.id)}
                />
              ))}
            </ul>
            {!selecting && overdue.length > 5 && <p className="mt-2 text-sm text-graphite">외 {overdue.length - 5}개 — "골라서 옮기기"에서 모두 볼 수 있습니다.</p>}
            {selecting && (
              <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+150px)] z-10 mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-ink p-2 pl-4 text-paper md:bottom-4">
                <span className="mr-auto text-sm font-semibold">{picked.size}개 선택</span>
                <button className="min-h-10 rounded-[10px] px-3 text-sm font-semibold" onClick={() => setPicked(picked.size === overdue.length ? new Set() : new Set(overdue.map((t) => t.id)))}>
                  {picked.size === overdue.length ? '모두 해제' : '모두 선택'}
                </button>
                <button
                  className="min-h-10 rounded-[10px] px-3 text-sm font-semibold disabled:opacity-40"
                  disabled={picked.size === 0}
                  onClick={() => { act.skipTasks(overdue.filter((t) => picked.has(t.id))); setPicked(new Set()); setSelecting(false); }}
                >
                  건너뛰기
                </button>
                <button className="min-h-10 rounded-[10px] bg-paper px-4 text-sm font-bold text-ink disabled:opacity-40" disabled={picked.size === 0} onClick={() => setMoving(overdue.filter((t) => picked.has(t.id)))}>
                  옮기기
                </button>
              </div>
            )}
          </Section>
        )}

        <div className="mt-8 lg:hidden">
          <Link to="/plan" className="btn btn-line w-full">주간 계획 보기</Link>
        </div>
      </div>

      <aside className="mt-10 space-y-8 lg:mt-[76px]">
        <TodaySchedule date={today} />

        <Section title="다가오는 마감·일정">
          {upcomingDue.length + upcomingEvents.length === 0 ? (
            <p className="text-sm text-graphite">7일 안에 마감되는 과제나 2주 안의 학교 일정이 없습니다.</p>
          ) : (
            <ul className="space-y-2.5">
              {upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 text-sm">
                  <span className={`num w-14 flex-none font-semibold ${e.kind === 'midterm' || e.kind === 'final' ? 'text-omr' : ''}`}>{e.date === today ? '오늘' : `D-${Math.round((parseISODate(e.date).getTime() - d.getTime()) / 86400000)}`}</span>
                  <span className="min-w-0">
                    <span className="font-semibold">{e.title}</span>
                    <span className="block text-graphite">{EVENT_KIND_LABEL[e.kind]} · {formatDateKo(e.date)}{e.startTime ? ` ${e.startTime}` : ''}</span>
                  </span>
                </li>
              ))}
              {upcomingDue.map((t) => (
                <li key={t.id} className="flex items-baseline gap-3 text-sm">
                  <span className={`num w-14 flex-none font-semibold ${t.dueDate! < today ? 'text-omr' : ''}`}>{dueLabel(t.dueDate!, today).replace(' 마감', '')}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <SubjectDot color={subjectMap.get(t.subjectId)?.color} size={8} />
                    <span className="truncate">{t.title}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Link to="/plan" className="btn btn-line hidden w-full lg:flex">주간 계획 보기</Link>
      </aside>

      <TaskEditor mode={editor} onClose={() => setEditor(null)} />
      <MoveSheet key={moving?.map((t) => t.id).join() ?? 'none'} tasks={moving} onClose={() => setMoving(null)} onDone={() => { setPicked(new Set()); setSelecting(false); }} />
    </div>
  );
}
