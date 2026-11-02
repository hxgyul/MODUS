import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { OVERDUE_LOOKBACK_DAYS, useTaskSeconds, useToday } from '@/data/selectors';
import { addDays, formatDateKo, formatDuration, msToHHmm } from '@/domain/dates';
import { expandTasks, type TaskView } from '@/domain/recurrence';
import { isDone } from '@/domain/tasks';
import { elapsedSec } from '@/domain/timer';
import { Icon } from '@/components/ui/icons';
import { Empty, Section, useNow, useSubjectColor } from '@/components/ui/primitives';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskEditor, type TaskEditorMode } from '@/features/tasks/TaskEditor';
import { useOpenTimer } from '@/features/timer/Timer';

export function SubjectDetailPage() {
  const { id } = useParams();
  const { subjects, tasks, recurrences, sessions, activeTimer } = useData();
  const act = useActions();
  const now = useNow(1000);
  const today = useToday(now);
  const color = useSubjectColor();
  const taskSec = useTaskSeconds();
  const openTimer = useOpenTimer();
  const [editor, setEditor] = useState<TaskEditorMode | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);

  const subject = subjects.find((s) => s.id === id);

  const { open, done, upcoming } = useMemo(() => {
    const mine = tasks.filter((t) => t.subjectId === id);
    const myRules = recurrences.filter((r) => r.template.subjectId === id);
    // 오늘까지의 미완료(반복 발생분 포함) + 날짜 미정 + 오래된 일반 과제
    const windowed = expandTasks(mine, myRules, addDays(today, -OVERDUE_LOOKBACK_DAYS), today);
    const extra = mine.filter((t) => t.status === 'active' && (t.planDate === null || (!t.recurrenceId && t.planDate < addDays(today, -OVERDUE_LOOKBACK_DAYS))));
    const all: TaskView[] = [...windowed, ...extra];
    const open = all
      .filter((t) => !isDone(t))
      .sort((a, b) => (a.planDate === today ? -1 : 0) - (b.planDate === today ? -1 : 0) || (a.planDate ?? '9').localeCompare(b.planDate ?? '9'));
    const upcoming = expandTasks(mine, myRules, addDays(today, 1), addDays(today, 7))
      .filter((t) => !isDone(t))
      .sort((a, b) => a.planDate!.localeCompare(b.planDate!));
    const done = mine
      .filter((t) => t.status === 'active' && isDone(t))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return { open, done, upcoming };
  }, [tasks, recurrences, id, today]);

  const mySessions = useMemo(() => sessions.filter((s) => s.subjectId === id), [sessions, id]);

  if (!subject) {
    return (
      <Empty title="과목을 찾을 수 없습니다" body="삭제되었거나 주소가 잘못되었습니다." action={<Link to="/subjects" className="btn btn-primary">과목 목록으로</Link>} />
    );
  }

  const live = activeTimer?.subjectId === subject.id ? elapsedSec(activeTimer, now) : 0;
  const todaySec = mySessions.filter((s) => s.studyDate === today).reduce((a, s) => a + s.durationSec, 0) + live;
  const totalSec = mySessions.reduce((a, s) => a + s.durationSec, 0) + live;
  const freeRunning = activeTimer?.subjectId === subject.id && !activeTimer.taskId;
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link to="/subjects" className="btn btn-quiet -ml-3 mb-2 text-graphite">
        <Icon name="chevronLeft" size={18} /> 과목
      </Link>
      <header className="mb-6">
        <div className="mb-3 h-1.5 w-12 rounded-full" style={{ background: color(subject.color) }} />
        <h1 className="text-[28px] leading-tight font-bold">{subject.name}</h1>
        <p className="num mt-1 text-graphite">
          오늘 <b className="text-ink">{formatDuration(todaySec)}</b> · 누적 {formatDuration(totalSec)}
        </p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:max-w-md">
        <button className="btn btn-line h-14" onClick={() => setEditor({ kind: 'create', subjectId: subject.id, planDate: today })}>
          <Icon name="plus" size={18} /> 과제 추가
        </button>
        {freeRunning ? (
          <button className="btn h-14 bg-omr-soft text-omr" onClick={() => openTimer(true)}>
            <span className="live-dot" /> 자유 공부 중
          </button>
        ) : (
          <button className="btn btn-primary h-14" onClick={() => act.startStudy(subject.id, null)}>
            <Icon name="play" size={18} /> 자유 공부 시작
          </button>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="space-y-8">
          <Section title={`미완료 ${open.length}`}>
            {open.length === 0 ? (
              <Empty title="남은 과제가 없습니다" body="과제를 추가하거나, 과제 없이 자유 공부를 시작하세요." />
            ) : (
              <ul className="rounded-2xl border border-rule bg-surface px-4">
                {open.map((t) => (
                  <TaskRow key={t.id} task={t} subject={subject} today={today} studiedSec={taskSec.get(t.id) ?? 0} onOpen={() => setEditor({ kind: 'edit', task: t })} showDate={t.planDate !== today} />
                ))}
              </ul>
            )}
          </Section>

          {upcoming.length > 0 && (
            <Section title="다음 7일 계획">
              <ul className="rounded-2xl border border-rule bg-surface px-4">
                {upcoming.map((t) => (
                  <TaskRow key={t.id} task={t} subject={subject} today={today} studiedSec={taskSec.get(t.id) ?? 0} onOpen={() => setEditor({ kind: 'edit', task: t })} showDate />
                ))}
              </ul>
            </Section>
          )}

          <Section title={`완료 ${done.length}`}>
            {done.length === 0 ? (
              <p className="text-sm text-graphite">아직 완료한 과제가 없습니다.</p>
            ) : (
              <>
                <ul className="rounded-2xl border border-rule bg-surface px-4">
                  {done.slice(0, showAllDone ? undefined : 5).map((t) => (
                    <TaskRow key={t.id} task={t} subject={subject} today={today} studiedSec={taskSec.get(t.id) ?? 0} onOpen={() => setEditor({ kind: 'edit', task: t })} showDate />
                  ))}
                </ul>
                {done.length > 5 && (
                  <button className="btn btn-quiet -ml-3 mt-1 text-sm text-graphite" onClick={() => setShowAllDone((v) => !v)}>
                    {showAllDone ? '접기' : `완료한 과제 ${done.length}개 모두 보기`}
                  </button>
                )}
              </>
            )}
          </Section>
        </div>

        <Section title="학습 기록" className="mt-8 lg:mt-0" aside={<Link to={`/stats/records?subject=${subject.id}`} className="text-sm font-semibold text-graphite underline underline-offset-4">전체 보기</Link>}>
          {mySessions.length === 0 ? (
            <p className="text-sm text-graphite">타이머로 공부하면 기록이 여기에 쌓입니다.</p>
          ) : (
            <ul className="divide-y divide-rule rounded-2xl border border-rule bg-surface px-4">
              {mySessions.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.taskId ? (taskTitle.get(s.taskId) ?? '삭제된 과제') : '자유 공부'}</span>
                    <span className="num text-graphite">{formatDateKo(s.studyDate)} {msToHHmm(s.startAt)}–{msToHHmm(s.endAt)}</span>
                  </span>
                  <span className="num flex-none font-semibold">{formatDuration(s.durationSec)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <TaskEditor mode={editor} onClose={() => setEditor(null)} />
    </div>
  );
}
