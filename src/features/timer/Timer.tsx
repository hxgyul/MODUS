import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useData } from '@/data/DataProvider';
import { deviceId, recallTimer, rememberTimer, useActions } from '@/data/actions';
import { useSubjectMap, useTasksInRange, useToday } from '@/data/selectors';
import { formatClock, formatDuration, msToHHmm } from '@/domain/dates';
import { elapsedSec, resolveRemoteTakeover } from '@/domain/timer';
import { isDone } from '@/domain/tasks';
import { Icon } from '@/components/ui/icons';
import { Sheet, SubjectDot, useNow } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

const OpenCtx = createContext<(open: boolean) => void>(() => {});
export const useOpenTimer = () => useContext(OpenCtx);

/**
 * 다른 기기와의 타이머 충돌 처리.
 * 이 기기가 시작한 타이머(기기 내 사본)와 서버 문서를 비교해, 다른 기기가 새 타이머를 시작했으면
 * 이 기기 세션을 그 시각에 끊어 저장한다. 같은 세션이면 최신 상태(일시정지 등)를 받아들인다.
 */
function TakeoverWatcher() {
  const { timerDoc } = useData();
  const act = useActions();
  const toast = useToast();
  useEffect(() => {
    const local = recallTimer();
    if (!local || local.deviceId !== deviceId()) return;
    const r = resolveRemoteTakeover(local, timerDoc, Date.now());
    if (r.action === 'sync') rememberTimer(r.timer);
    else if (r.action === 'clear') rememberTimer(null);
    else if (r.action === 'close') {
      act.saveTakenOver(local, r.endAt);
      toast({ tone: 'info', text: `다른 기기에서 타이머를 시작해 이 기기 공부를 ${msToHHmm(r.endAt)}까지로 저장했습니다` });
    }
  }, [timerDoc, act, toast]);
  return null;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <OpenCtx.Provider value={setOpen}>
      <TakeoverWatcher />
      {children}
      <TimerSheet open={open} onClose={() => setOpen(false)} />
    </OpenCtx.Provider>
  );
}

/** 모든 화면 하단(휴대폰) / 상단(넓은 화면)에 고정되는 실행 중 타이머 */
export function TimerBar() {
  const { activeTimer } = useData();
  const subjects = useSubjectMap();
  const { tasks } = useData();
  const act = useActions();
  const setOpen = useOpenTimer();
  const now = useNow(1000);
  if (!activeTimer) return null;
  const subject = subjects.get(activeTimer.subjectId);
  const task = activeTimer.taskId ? tasks.find((t) => t.id === activeTimer.taskId) : null;
  const paused = activeTimer.pausedAt !== null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rule bg-surface py-2 pr-2 pl-4 shadow-[0_6px_24px_-12px_rgb(0_0_0/0.35)]">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(true)} aria-label="타이머 열기">
        {paused ? <span className="size-2 rounded-full bg-faint" /> : <span className="live-dot" />}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 truncate text-[13px] text-graphite">
            <SubjectDot color={subject?.color} size={8} />
            <span className="truncate">{subject?.name ?? '과목'}{task ? ` · ${task.title}` : ' · 자유 공부'}</span>
          </span>
          <span className={`clock block text-[22px] ${paused ? 'text-graphite' : ''}`}>{formatClock(elapsedSec(activeTimer, now))}</span>
        </span>
      </button>
      <button className="grid size-11 place-items-center rounded-full bg-sunk" onClick={paused ? act.resumeStudy : act.pauseStudy} aria-label={paused ? '재개' : '일시정지'}>
        <Icon name={paused ? 'play' : 'pause'} size={18} />
      </button>
      <button className="grid size-11 place-items-center rounded-full bg-ink text-paper" onClick={() => act.stopStudy()} aria-label="종료하고 저장">
        <Icon name="stop" size={16} />
      </button>
    </div>
  );
}

function TimerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeTimer, subjects, sessions } = useData();
  const subjectMap = useSubjectMap();
  const act = useActions();
  const now = useNow(1000);
  const today = useToday(now);
  const [switching, setSwitching] = useState(false);
  const wasRunning = useRef(Boolean(activeTimer));

  useEffect(() => {
    // 다른 곳에서 종료되면 시트를 닫는다
    if (wasRunning.current && !activeTimer) onClose();
    wasRunning.current = Boolean(activeTimer);
  }, [activeTimer, onClose]);

  const todayList = useTasksInRange(today, today);
  const openTasks = useMemo(() => todayList.filter((t) => !isDone(t)), [todayList]);

  if (!open || !activeTimer) return null;
  const subject = subjectMap.get(activeTimer.subjectId);
  const task = activeTimer.taskId ? todayList.find((t) => t.id === activeTimer.taskId) : null;
  const paused = activeTimer.pausedAt !== null;
  const pauseSec = activeTimer.pauses.reduce((a, p) => a + (p.end - p.start), 0) / 1000 + (activeTimer.pausedAt ? (now - activeTimer.pausedAt) / 1000 : 0);
  const subjectToday = sessions.filter((s) => s.studyDate === today && s.subjectId === activeTimer.subjectId).reduce((a, s) => a + s.durationSec, 0);

  return (
    <Sheet open onClose={onClose} title={switching ? '다른 공부로 전환' : '공부 중'}>
      {!switching ? (
        <div className="pb-2">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <SubjectDot color={subject?.color} />
            {subject?.name}
          </div>
          <p className="mt-1 text-graphite">{task ? task.title : '자유 공부 (과목 시간에만 기록)'}</p>
          <div className={`clock num mt-8 mb-2 text-center text-[72px] sm:text-[96px] ${paused ? 'text-graphite' : ''}`} aria-live="off">
            {formatClock(elapsedSec(activeTimer, now))}
          </div>
          <p className="num text-center text-sm text-graphite">
            {msToHHmm(activeTimer.startAt)} 시작
            {pauseSec >= 60 && ` · 쉰 시간 ${formatDuration(pauseSec)} 제외`}
            {subjectToday > 0 && ` · 오늘 이 과목 ${formatDuration(subjectToday)} 저장됨`}
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <button className="btn btn-line h-14 text-base" onClick={paused ? act.resumeStudy : act.pauseStudy}>
              <Icon name={paused ? 'play' : 'pause'} size={18} /> {paused ? '재개' : '일시정지'}
            </button>
            <button className="btn btn-primary h-14 text-base" onClick={() => { act.stopStudy(); onClose(); }}>
              <Icon name="stop" size={16} /> 종료하고 저장
            </button>
          </div>
          <button className="btn btn-quiet mt-3 w-full text-graphite" onClick={() => setSwitching(true)}>
            다른 과목·과제로 전환
          </button>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-graphite">지금까지의 공부는 저장되고, 고른 공부로 새 타이머가 시작됩니다.</p>
          <ul className="divide-y divide-rule">
            {subjects.filter((s) => !s.archived).map((s) => {
              const list = openTasks.filter((t) => t.subjectId === s.id);
              return (
                <li key={s.id} className="py-2">
                  <div className="flex items-center gap-2 py-1 text-sm font-bold">
                    <SubjectDot color={s.color} /> {s.name}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {list.map((t) => (
                      <button key={t.id} disabled={t.id === activeTimer.taskId} className="min-h-10 rounded-full border border-rule bg-surface px-3.5 text-sm disabled:opacity-40" onClick={() => { act.startStudy(s.id, t); setSwitching(false); }}>
                        {t.title}
                      </button>
                    ))}
                    <button disabled={s.id === activeTimer.subjectId && !activeTimer.taskId} className="min-h-10 rounded-full border border-dashed border-rule px-3.5 text-sm text-graphite disabled:opacity-40" onClick={() => { act.startStudy(s.id, null); setSwitching(false); }}>
                      자유 공부
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button className="btn btn-line mt-4 w-full" onClick={() => setSwitching(false)}>돌아가기</button>
        </div>
      )}
    </Sheet>
  );
}
