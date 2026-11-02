import { useMemo } from 'react';
import { useData } from './DataProvider';
import { useToast } from '@/components/ui/toast';
import type { WriteOp } from './store';
import { addDays, studyDateOf } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { planRuleEdit, type TaskView } from '@/domain/recurrence';
import { moveTask, setSimpleDone, toggleSubtask, withDerivedCompletion } from '@/domain/tasks';
import { editSession, finishTimer, pauseTimer, resumeTimer, startTimer } from '@/domain/timer';
import type {
  ActiveTimer,
  HHmm,
  ISODate,
  RecurrenceFreq,
  RecurrenceRule,
  SchoolEvent,
  StudySession,
  Subject,
  Subtask,
  Task,
  Timetable,
  TimetableException,
  TimetableSlot,
  UserSettings,
} from '@/domain/types';

const DEVICE_KEY = 'sa:deviceId';
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown-device';
  }
}

export interface TaskInput {
  subjectId: string;
  title: string;
  planDate: ISODate | null;
  planStart: HHmm | null;
  dueDate: ISODate | null;
  estimateMin: number | null;
  subtasks: { id: string; title: string }[];
  repeat: null | { freq: RecurrenceFreq; weekdays: number[]; endDate: ISODate | null };
}

const strip = <T extends object>(t: T): Omit<T, 'virtual'> => {
  const { virtual: _v, ...rest } = t as T & { virtual?: true };
  void _v;
  return rest;
};

export function useActions() {
  const { store, account, settings, tasks, sessions, activeTimer, recurrences } = useData();
  const toast = useToast();

  return useMemo(() => {
    const uid = account.uid;
    const now = () => Date.now();
    const today = () => studyDateOf(Date.now(), settings.dayStartHour);

    /** 쓰기 실행. 오프라인이면 로컬에 즉시 반영되고 서버 확인은 나중에 온다 → 기다리지 않는다. */
    const run = (ops: WriteOp[], failMsg = '저장하지 못했습니다') => {
      if (ops.length === 0) return;
      store.commit(ops).catch((e: Error) => {
        toast({ tone: 'error', text: `${failMsg}: ${e.message}` });
      });
    };

    const putTask = (t: Task | TaskView): WriteOp => ({
      kind: 'set',
      col: 'tasks',
      id: t.id,
      data: strip(t),
      // 가상 발생분을 처음 저장할 때도 merge — 다른 기기가 먼저 저장했어도 덮어쓰지 않고 합쳐진다
      merge: true,
    });

    // ───────── 과목 ─────────
    const addSubject = (name: string, color: string) => {
      const t = now();
      const s: Subject = { id: newId(), userId: uid, name: name.trim(), color, order: t, archived: false, createdAt: t, updatedAt: t };
      run([{ kind: 'set', col: 'subjects', id: s.id, data: s }]);
      return s;
    };
    const updateSubject = (s: Subject, patch: Partial<Pick<Subject, 'name' | 'color' | 'archived'>>) =>
      run([{ kind: 'set', col: 'subjects', id: s.id, data: { ...patch, updatedAt: now() }, merge: true }]);
    const reorderSubjects = (ordered: Subject[]) =>
      run(ordered.map((s, i) => ({ kind: 'set', col: 'subjects', id: s.id, data: { order: i, updatedAt: now() }, merge: true })));
    const subjectInUse = (id: string) =>
      tasks.some((t) => t.subjectId === id) || sessions.some((s) => s.subjectId === id) || recurrences.some((r) => r.template.subjectId === id);
    /** 기록이 있는 과목은 보관만, 없으면 삭제 */
    const removeSubject = (s: Subject): 'archived' | 'deleted' => {
      if (subjectInUse(s.id)) {
        updateSubject(s, { archived: true });
        return 'archived';
      }
      run([{ kind: 'delete', col: 'subjects', id: s.id }]);
      return 'deleted';
    };

    // ───────── 과제 ─────────
    const createTask = (input: TaskInput) => {
      const t = now();
      const subtasks = input.subtasks.filter((s) => s.title.trim());
      if (input.repeat) {
        const rule: RecurrenceRule = {
          id: newId(),
          seriesId: newId(),
          userId: uid,
          template: { subjectId: input.subjectId, title: input.title.trim(), planStart: input.planStart, estimateMin: input.estimateMin, subtasks },
          freq: input.repeat.freq,
          weekdays: input.repeat.weekdays,
          startDate: input.planDate ?? today(),
          endDate: input.repeat.endDate,
          createdAt: t,
          updatedAt: t,
        };
        run([{ kind: 'set', col: 'recurrences', id: rule.id, data: rule }]);
        return;
      }
      const task: Task = {
        id: newId(),
        userId: uid,
        subjectId: input.subjectId,
        title: input.title.trim(),
        planDate: input.planDate,
        planStart: input.planDate ? input.planStart : null,
        estimateMin: input.estimateMin,
        dueDate: input.dueDate,
        subtasks: subtasks.map((s) => ({ ...s, doneAt: null })),
        completedAt: null,
        completedOn: null,
        status: 'active',
        firstPlanDate: input.planDate,
        recurrenceId: null,
        occurrenceDate: null,
        createdAt: t,
        updatedAt: t,
      };
      run([putTask(task)]);
    };

    /** 과제 내용 수정 (가상 발생분이면 이때 저장된다 = 그날만 따로 수정) */
    const updateTask = (task: TaskView, patch: Partial<Pick<Task, 'title' | 'subjectId' | 'planDate' | 'planStart' | 'dueDate' | 'estimateMin'>> & { subtasks?: Subtask[] }) => {
      const t = now();
      let next: Task = { ...strip(task), ...patch, updatedAt: t };
      if (patch.planDate !== undefined) next = moveTask({ ...strip(task), ...patch }, patch.planDate, patch.planStart ?? null, t);
      next = withDerivedCompletion(next, t, today());
      run([putTask(next)]);
    };

    const setDone = (task: TaskView, done: boolean) => {
      const next = setSimpleDone(strip(task), done, now(), today());
      run([putTask(next)]);
      if (done) toast({ tone: 'info', text: '완료했습니다', action: { label: '되돌리기', run: () => run([putTask(strip(task))]) } });
    };

    const toggleSub = (task: TaskView, subId: string) => run([putTask(toggleSubtask(strip(task), subId, now(), today()))]);

    /** 여러 과제를 한꺼번에 다른 날짜로 이동 (복제하지 않음) */
    const moveTasks = (list: TaskView[], planDate: ISODate | null, planStart: HHmm | null = null) =>
      run(list.map((x) => putTask(moveTask(strip(x), planDate, planDate ? (planStart ?? x.planStart) : null, now()))));

    const skipTasks = (list: TaskView[]) =>
      run(list.map((x) => putTask({ ...strip(x), status: 'skipped', updatedAt: now() })));

    /** 기록이 연결된 과제는 보관(기록 보존), 없으면 삭제. 반복 발생분은 건너뛰기로 남겨 다시 생성되지 않게 함. */
    const removeTask = (task: TaskView) => {
      if (task.recurrenceId) return skipTasks([task]);
      if (sessions.some((s) => s.taskId === task.id)) {
        run([putTask({ ...strip(task), status: 'archived', updatedAt: now() })]);
      } else {
        run([{ kind: 'delete', col: 'tasks', id: task.id }]);
      }
    };

    // ───────── 반복 규칙 ─────────
    const currentRule = (seriesId: string): RecurrenceRule | null => {
      const list = recurrences.filter((r) => r.seriesId === seriesId).sort((a, b) => b.startDate.localeCompare(a.startDate));
      return list[0] ?? null;
    };
    const editRule = (rule: RecurrenceRule, changes: Partial<Pick<RecurrenceRule, 'template' | 'freq' | 'weekdays' | 'endDate'>>) => {
      const plan = planRuleEdit(rule, changes, today(), now());
      const ops: WriteOp[] = [{ kind: 'set', col: 'recurrences', id: plan.update.id, data: plan.update }];
      if (plan.create) ops.push({ kind: 'set', col: 'recurrences', id: plan.create.id, data: plan.create });
      run(ops);
    };
    /** 반복 그만하기: 오늘부터 더 생기지 않음. 오늘 이전 발생분과 기록은 그대로 */
    const stopSeries = (seriesId: string) => {
      const y = addDays(today(), -1);
      const ops: WriteOp[] = [];
      for (const r of recurrences.filter((x) => x.seriesId === seriesId)) {
        if (r.startDate > y) ops.push({ kind: 'delete', col: 'recurrences', id: r.id });
        else if (!r.endDate || r.endDate > y) ops.push({ kind: 'set', col: 'recurrences', id: r.id, data: { endDate: y, updatedAt: now() }, merge: true });
      }
      run(ops);
    };

    // ───────── 타이머 ─────────
    const ctx = () => ({ userId: uid, dayStartHour: settings.dayStartHour, now: now() });
    const closeOps = (t: ActiveTimer, endAt: number): WriteOp[] => {
      const s = finishTimer(t, endAt, ctx());
      return s ? [{ kind: 'set', col: 'sessions', id: s.id, data: s }] : [];
    };

    /** 시작. 이미 실행 중이면 이전 세션을 저장하고 전환한다(같은 배치). */
    const startStudy = (subjectId: string, task: TaskView | null) => {
      const t = now();
      const ops: WriteOp[] = [];
      if (activeTimer) ops.push(...closeOps(activeTimer, t));
      if (task?.virtual) ops.push(putTask(task)); // 세션이 가리킬 과제 문서를 먼저 확정
      const next = startTimer({ sessionId: newId(), subjectId, taskId: task?.id ?? null, deviceId: deviceId() }, t);
      ops.push({ kind: 'setDoc', doc: 'activeTimer', data: next });
      run(ops, '타이머를 시작하지 못했습니다');
      rememberTimer(next);
    };
    const pauseStudy = () => {
      if (!activeTimer) return;
      const next = pauseTimer(activeTimer, now());
      run([{ kind: 'setDoc', doc: 'activeTimer', data: next }]);
      rememberTimer(next);
    };
    const resumeStudy = () => {
      if (!activeTimer) return;
      const next = resumeTimer(activeTimer, now());
      run([{ kind: 'setDoc', doc: 'activeTimer', data: next }]);
      rememberTimer(next);
    };
    /** 종료: 세션 저장 + 활성 타이머 삭제 (한 배치, 세션 ID가 고정이라 재시도해도 한 건) */
    const stopStudy = (): StudySession | null => {
      if (!activeTimer) return null;
      const t = now();
      const s = finishTimer(activeTimer, t, ctx());
      const ops: WriteOp[] = s ? [{ kind: 'set', col: 'sessions', id: s.id, data: s }] : [];
      ops.push({ kind: 'setDoc', doc: 'activeTimer', data: { sessionId: null, lastEndedId: activeTimer.sessionId, lastStartAt: activeTimer.startAt, updatedAt: t } });
      run(ops, '공부 기록을 저장하지 못했습니다');
      rememberTimer(null);
      if (!s) toast({ tone: 'info', text: '1분 미만이라 기록하지 않았습니다' });
      return s;
    };
    /** 다른 기기에 밀려난 이 기기의 세션을 지정 시각에 끊어 저장 */
    const saveTakenOver = (local: ActiveTimer, endAt: number) => {
      run(closeOps(local, endAt), '다른 기기 전환 중 기록 저장 실패');
      rememberTimer(null);
    };

    // ───────── 세션 기록 ─────────
    const updateSession = (s: StudySession, startAt: number, endAt: number) => {
      const next = editSession(s, startAt, endAt, { dayStartHour: settings.dayStartHour, now: now() });
      run([{ kind: 'set', col: 'sessions', id: s.id, data: next }]);
    };
    const deleteSession = (s: StudySession) => {
      run([{ kind: 'delete', col: 'sessions', id: s.id }]);
      toast({ tone: 'info', text: '기록을 삭제했습니다', action: { label: '되돌리기', run: () => run([{ kind: 'set', col: 'sessions', id: s.id, data: s }]) } });
    };

    // ───────── 시간표·일정 ─────────
    const saveTimetable = (tt: Omit<Timetable, 'userId' | 'createdAt' | 'updatedAt'> & Partial<Pick<Timetable, 'createdAt'>>) => {
      const t = now();
      run([{ kind: 'set', col: 'timetables', id: tt.id, data: { ...tt, userId: uid, createdAt: tt.createdAt ?? t, updatedAt: t } }]);
    };
    const deleteTimetable = (id: string) => run([{ kind: 'delete', col: 'timetables', id }]);
    const saveException = (date: ISODate, slots: TimetableSlot[], note: string, createdAt?: number) => {
      const t = now();
      const ex: TimetableException = { id: date, userId: uid, date, slots, note, createdAt: createdAt ?? t, updatedAt: t };
      run([{ kind: 'set', col: 'timetableExceptions', id: date, data: ex }]);
    };
    const deleteException = (date: ISODate) => run([{ kind: 'delete', col: 'timetableExceptions', id: date }]);
    const saveEvent = (e: Omit<SchoolEvent, 'userId' | 'createdAt' | 'updatedAt'> & Partial<Pick<SchoolEvent, 'createdAt'>>) => {
      const t = now();
      run([{ kind: 'set', col: 'events', id: e.id, data: { ...e, userId: uid, createdAt: e.createdAt ?? t, updatedAt: t } }]);
    };
    const deleteEvent = (id: string) => run([{ kind: 'delete', col: 'events', id }]);

    // ───────── 설정 ─────────
    const updateSettings = (patch: Partial<UserSettings>) =>
      run([{ kind: 'setDoc', doc: 'settings', data: { ...settings, ...patch, updatedAt: now() } }]);

    return {
      today,
      addSubject, updateSubject, reorderSubjects, removeSubject, subjectInUse,
      createTask, updateTask, setDone, toggleSub, moveTasks, skipTasks, removeTask,
      currentRule, editRule, stopSeries,
      startStudy, pauseStudy, resumeStudy, stopStudy, saveTakenOver,
      updateSession, deleteSession,
      saveTimetable, deleteTimetable, saveException, deleteException, saveEvent, deleteEvent,
      updateSettings,
    };
  }, [store, account.uid, settings, tasks, sessions, activeTimer, recurrences, toast]);
}

// 새로고침 직후 화면 복원을 서버 응답보다 빨리 하기 위한 기기 내 사본
const TIMER_KEY = 'sa:activeTimer';
export function rememberTimer(t: ActiveTimer | null) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(TIMER_KEY);
  } catch {
    /* 저장 공간 없음 — 서버 사본으로 충분 */
  }
}
export function recallTimer(): ActiveTimer | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? (JSON.parse(raw) as ActiveTimer) : null;
  } catch {
    return null;
  }
}
