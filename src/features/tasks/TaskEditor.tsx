import { useEffect, useState } from 'react';
import { useData } from '@/data/DataProvider';
import { useActions, type TaskInput } from '@/data/actions';
import { addDays, formatDateKo, isHHmm, WEEKDAY_KO, weekdayOf } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { describeRule, type TaskView } from '@/domain/recurrence';
import type { RecurrenceFreq, RecurrenceRule } from '@/domain/types';
import { Icon } from '@/components/ui/icons';
import { Confirm, Segmented, Sheet, SubjectDot } from '@/components/ui/primitives';
import { nextColor } from '@/components/ui/colors';

type Mode =
  | { kind: 'create'; subjectId?: string; planDate?: string | null; planStart?: string | null }
  | { kind: 'edit'; task: TaskView }
  | { kind: 'rule'; rule: RecurrenceRule };

const ESTIMATES = [15, 30, 45, 60, 90, 120];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface Draft {
  title: string;
  subjectId: string;
  planDate: string | null;
  planStart: string;
  estimate: string;
  dueDate: string;
  subtasks: { id: string; title: string; doneAt?: number | null }[];
  repeat: 'none' | RecurrenceFreq;
  weekdays: number[];
  repeatEnd: string;
}

function initial(mode: Mode, today: string, firstSubject: string): Draft {
  if (mode.kind === 'edit') {
    const t = mode.task;
    return {
      title: t.title, subjectId: t.subjectId, planDate: t.planDate, planStart: t.planStart ?? '',
      estimate: t.estimateMin ? String(t.estimateMin) : '', dueDate: t.dueDate ?? '',
      subtasks: t.subtasks.map((s) => ({ ...s })), repeat: 'none', weekdays: [], repeatEnd: '',
    };
  }
  if (mode.kind === 'rule') {
    const r = mode.rule;
    return {
      title: r.template.title, subjectId: r.template.subjectId, planDate: r.startDate, planStart: r.template.planStart ?? '',
      estimate: r.template.estimateMin ? String(r.template.estimateMin) : '', dueDate: '',
      subtasks: r.template.subtasks.map((s) => ({ ...s })), repeat: r.freq, weekdays: r.weekdays, repeatEnd: r.endDate ?? '',
    };
  }
  return {
    title: '', subjectId: mode.subjectId ?? firstSubject, planDate: mode.planDate === undefined ? today : mode.planDate,
    planStart: mode.planStart ?? '', estimate: '', dueDate: '', subtasks: [], repeat: 'none',
    weekdays: [weekdayOf(today)], repeatEnd: '',
  };
}

export function TaskEditor({ mode, onClose }: { mode: Mode | null; onClose: () => void }) {
  return mode ? <EditorBody key={mode.kind === 'edit' ? mode.task.id : mode.kind === 'rule' ? mode.rule.id : 'new'} mode={mode} onClose={onClose} /> : null;
}

function EditorBody({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const { subjects } = useData();
  const act = useActions();
  const today = act.today();
  const active = subjects.filter((s) => !s.archived);
  const [d, setD] = useState<Draft>(() => initial(mode, today, active[0]?.id ?? ''));
  const [newSubject, setNewSubject] = useState<string | null>(active.length === 0 ? '' : null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ruleEdit, setRuleEdit] = useState<RecurrenceRule | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const recurringOccurrence = mode.kind === 'edit' && mode.task.recurrenceId ? act.currentRule(mode.task.recurrenceId) : null;

  useEffect(() => {
    setError(null);
  }, [d]);

  const createSubject = () => {
    const name = (newSubject ?? '').trim();
    if (!name) return;
    const s = act.addSubject(name, nextColor(subjects.map((x) => x.color)));
    set('subjectId', s.id);
    setNewSubject(null);
  };

  const save = () => {
    if (!d.title.trim()) return setError('과제명을 입력하세요.');
    if (!d.subjectId) return setError('과목을 선택하세요. 과목이 없다면 새 과목을 만드세요.');
    if (d.planStart && !isHHmm(d.planStart)) return setError('계획 시간을 확인하세요.');
    if (d.planStart && !d.planDate) return setError('시간을 정하려면 날짜도 정하세요.');
    const est = d.estimate ? Number(d.estimate) : null;
    if (est !== null && (!Number.isFinite(est) || est <= 0 || est > 24 * 60)) return setError('예상 소요 시간은 1~1440분 사이로 입력하세요.');
    if (d.repeat === 'weekdays' && d.weekdays.length === 0) return setError('반복할 요일을 하나 이상 고르세요.');
    if (d.repeat !== 'none' && d.repeatEnd && d.planDate && d.repeatEnd < d.planDate) return setError('반복 종료일이 시작일보다 빠릅니다.');
    const subtasks = d.subtasks.filter((s) => s.title.trim()).map((s) => ({ id: s.id, title: s.title.trim() }));

    if (mode.kind === 'create') {
      const input: TaskInput = {
        subjectId: d.subjectId,
        title: d.title,
        planDate: d.repeat !== 'none' ? (d.planDate ?? today) : d.planDate,
        planStart: d.planStart || null,
        dueDate: d.repeat === 'none' ? d.dueDate || null : null,
        estimateMin: est,
        subtasks,
        repeat: d.repeat === 'none' ? null : { freq: d.repeat, weekdays: d.repeat === 'weekdays' ? d.weekdays : [], endDate: d.repeatEnd || null },
      };
      act.createTask(input);
    } else if (mode.kind === 'edit') {
      const prev = new Map(mode.task.subtasks.map((s) => [s.id, s]));
      act.updateTask(mode.task, {
        title: d.title.trim(),
        subjectId: d.subjectId,
        planDate: d.planDate,
        planStart: d.planDate ? d.planStart || null : null,
        dueDate: d.dueDate || null,
        estimateMin: est,
        subtasks: subtasks.map((s) => ({ ...s, doneAt: prev.get(s.id)?.doneAt ?? null })),
      });
    } else {
      act.editRule(mode.rule, {
        template: { subjectId: d.subjectId, title: d.title.trim(), planStart: d.planStart || null, estimateMin: est, subtasks },
        freq: d.repeat === 'none' ? mode.rule.freq : d.repeat,
        weekdays: d.repeat === 'weekdays' ? d.weekdays : [],
        endDate: d.repeatEnd || null,
      });
    }
    onClose();
  };

  const title = mode.kind === 'create' ? '새 과제' : mode.kind === 'rule' ? '반복 설정 바꾸기' : '과제 수정';
  const showRepeat = mode.kind !== 'edit';

  return (
    <>
      <Sheet
        open={ruleEdit === null}
        onClose={onClose}
        title={title}
        footer={
          <>
            {mode.kind === 'edit' && (
              <button className="btn btn-quiet btn-danger" onClick={() => setConfirmDelete(true)}>
                {mode.task.recurrenceId ? '이 날 건너뛰기' : '삭제'}
              </button>
            )}
            {mode.kind === 'rule' && (
              <button className="btn btn-quiet btn-danger" onClick={() => setConfirmDelete(true)}>
                반복 그만하기
              </button>
            )}
            <button className="btn btn-primary ml-auto min-w-28" onClick={save}>
              {mode.kind === 'create' ? '추가' : '저장'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {mode.kind === 'rule' && (
            <p className="rounded-xl bg-sunk px-3.5 py-3 text-sm leading-relaxed text-graphite">
              바꾼 내용은 오늘부터 만들어지는 과제에 적용됩니다. 이미 완료했거나 지난 날짜의 과제·기록은 바뀌지 않습니다.
            </p>
          )}
          {recurringOccurrence && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-sunk px-3.5 py-3 text-sm">
              <span className="text-graphite">
                <Icon name="repeat" size={15} className="mr-1 inline -translate-y-px" />
                {describeRule(recurringOccurrence)} · 여기서 바꾸면 이 날짜에만 적용
              </span>
              <button className="font-semibold underline underline-offset-4" onClick={() => setRuleEdit(recurringOccurrence)}>
                반복 설정
              </button>
            </div>
          )}

          <div>
            <label className="label" htmlFor="task-title">과제명</label>
            <input
              id="task-title"
              className="field text-[17px] font-semibold"
              placeholder="예: 수학 기출 2회차"
              value={d.title}
              autoFocus={mode.kind === 'create'}
              onChange={(e) => set('title', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()}
            />
          </div>

          <div>
            <span className="label">과목</span>
            <div className="flex flex-wrap gap-2">
              {active.map((s) => (
                <button
                  key={s.id}
                  onClick={() => set('subjectId', s.id)}
                  aria-pressed={d.subjectId === s.id}
                  className={`flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold ${d.subjectId === s.id ? 'border-ink bg-ink text-paper' : 'border-rule bg-surface'}`}
                >
                  <SubjectDot color={s.color} />
                  {s.name}
                </button>
              ))}
              {newSubject === null ? (
                <button className="flex min-h-10 items-center gap-1 rounded-full border border-dashed border-rule px-3.5 text-sm text-graphite" onClick={() => setNewSubject('')}>
                  <Icon name="plus" size={16} /> 새 과목
                </button>
              ) : (
                <div className="flex w-full gap-2">
                  <input
                    className="field"
                    placeholder="과목 이름 (예: 공통수학)"
                    value={newSubject}
                    autoFocus
                    onChange={(e) => setNewSubject(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && createSubject()}
                  />
                  <button className="btn btn-line" onClick={createSubject} disabled={!newSubject.trim()}>
                    만들기
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <span className="label">{showRepeat && d.repeat !== 'none' ? '시작 날짜' : '계획 날짜'}</span>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: '오늘', v: today },
                { label: '내일', v: addDays(today, 1) },
              ].map((o) => (
                <button key={o.label} onClick={() => set('planDate', o.v)} aria-pressed={d.planDate === o.v} className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold ${d.planDate === o.v ? 'border-ink bg-ink text-paper' : 'border-rule bg-surface'}`}>
                  {o.label}
                </button>
              ))}
              {(d.repeat === 'none' || !showRepeat) && (
                <button onClick={() => set('planDate', null)} aria-pressed={d.planDate === null} className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold ${d.planDate === null ? 'border-ink bg-ink text-paper' : 'border-rule bg-surface'}`}>
                  날짜 미정
                </button>
              )}
              <input type="date" aria-label="날짜 직접 선택" className="field w-auto min-w-40" value={d.planDate ?? ''} onChange={(e) => set('planDate', e.target.value || null)} />
            </div>
            {d.planDate && <p className="mt-1.5 text-xs text-faint">{formatDateKo(d.planDate)}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="task-time">계획 시간 (선택)</label>
              <input id="task-time" type="time" className="field" value={d.planStart} disabled={!d.planDate} onChange={(e) => set('planStart', e.target.value)} />
            </div>
            {(mode.kind !== 'rule' && d.repeat === 'none') && (
              <div>
                <label className="label" htmlFor="task-due">마감일 (선택)</label>
                <input id="task-due" type="date" className="field" value={d.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <span className="label">예상 소요 시간 (선택)</span>
            <div className="flex flex-wrap items-center gap-2">
              {ESTIMATES.map((m) => (
                <button key={m} onClick={() => set('estimate', d.estimate === String(m) ? '' : String(m))} aria-pressed={d.estimate === String(m)} className={`num min-h-10 rounded-full border px-3 text-sm font-semibold ${d.estimate === String(m) ? 'border-ink bg-ink text-paper' : 'border-rule bg-surface'}`}>
                  {m < 60 ? `${m}분` : m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`}
                </button>
              ))}
              <label className="flex items-center gap-1.5 text-sm text-graphite">
                <input inputMode="numeric" className="field num w-20" placeholder="직접" value={ESTIMATES.includes(Number(d.estimate)) ? '' : d.estimate} onChange={(e) => set('estimate', e.target.value.replace(/\D/g, ''))} aria-label="예상 시간 직접 입력(분)" />
                분
              </label>
            </div>
          </div>

          {showRepeat && (
            <div>
              <span className="label">반복</span>
              <Segmented
                label="반복"
                value={d.repeat}
                onChange={(v) => set('repeat', v)}
                options={[
                  ...(mode.kind === 'create' ? [{ value: 'none' as const, label: '안 함' }] : []),
                  { value: 'daily', label: '매일' },
                  { value: 'weekly', label: '매주' },
                  { value: 'weekdays', label: '요일 선택' },
                ]}
              />
              {d.repeat === 'weekly' && d.planDate && <p className="mt-2 text-sm text-graphite">매주 {WEEKDAY_KO[weekdayOf(d.planDate)]}요일</p>}
              {d.repeat === 'weekdays' && (
                <div className="mt-3 flex gap-1.5">
                  {WEEK_ORDER.map((w) => {
                    const on = d.weekdays.includes(w);
                    return (
                      <button key={w} aria-pressed={on} onClick={() => set('weekdays', on ? d.weekdays.filter((x) => x !== w) : [...d.weekdays, w])} className={`grid size-10 place-items-center rounded-full text-sm font-semibold ${on ? 'bg-ink text-paper' : 'bg-sunk text-graphite'}`}>
                        {WEEKDAY_KO[w]}
                      </button>
                    );
                  })}
                </div>
              )}
              {d.repeat !== 'none' && (
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-sm text-graphite" htmlFor="repeat-end">종료일 (선택)</label>
                  <input id="repeat-end" type="date" className="field w-auto" value={d.repeatEnd} onChange={(e) => set('repeatEnd', e.target.value)} />
                </div>
              )}
            </div>
          )}

          <div>
            <span className="label">세부 과제 (선택)</span>
            <ul className="space-y-2">
              {d.subtasks.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="num w-5 text-right text-sm text-faint">{i + 1}</span>
                  <input
                    className="field"
                    value={s.title}
                    aria-label={`세부 과제 ${i + 1}`}
                    onChange={(e) => set('subtasks', d.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && s.title.trim()) set('subtasks', [...d.subtasks, { id: newId(), title: '' }]);
                    }}
                    autoFocus={!s.title}
                  />
                  <button className="btn btn-quiet px-2.5 text-graphite" aria-label="세부 과제 삭제" onClick={() => set('subtasks', d.subtasks.filter((x) => x.id !== s.id))}>
                    <Icon name="close" size={18} />
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn btn-quiet -ml-3 mt-1 text-graphite" onClick={() => set('subtasks', [...d.subtasks, { id: newId(), title: '' }])}>
              <Icon name="plus" size={18} /> 세부 과제 추가
            </button>
            {d.subtasks.length > 0 && <p className="text-xs text-faint">세부 과제가 있으면 모두 끝냈을 때 과제가 완료됩니다.</p>}
          </div>

          {error && <p role="alert" className="text-sm font-semibold text-omr">{error}</p>}
        </div>
      </Sheet>

      {ruleEdit && <EditorBody mode={{ kind: 'rule', rule: ruleEdit }} onClose={onClose} />}

      {mode.kind === 'rule' && (
        <Confirm
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="반복 그만하기"
          danger
          confirmLabel="그만하기"
          body="오늘부터 이 반복 과제가 더 생기지 않습니다. 어제까지의 과제와 공부 기록은 남습니다."
          onConfirm={() => {
            act.stopSeries(mode.rule.seriesId);
            onClose();
          }}
        />
      )}
      {mode.kind === 'edit' && (
        <Confirm
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={mode.task.recurrenceId ? '이 날 건너뛰기' : '과제 삭제'}
          danger
          confirmLabel={mode.task.recurrenceId ? '건너뛰기' : '삭제'}
          body={
            mode.task.recurrenceId
              ? '이 날짜의 반복 과제만 목록에서 빠집니다. 다른 날짜와 반복 설정은 그대로입니다.'
              : '공부 기록이 연결된 과제는 기록을 지키기 위해 보관 처리되고, 기록이 없으면 삭제됩니다.'
          }
          onConfirm={() => {
            act.removeTask(mode.task);
            onClose();
          }}
        />
      )}
    </>
  );
}

export type TaskEditorMode = Mode;
