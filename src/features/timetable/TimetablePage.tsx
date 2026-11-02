import { useState } from 'react';
import { Link } from 'react-router';
import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { formatDateKo, WEEKDAY_KO } from '@/domain/dates';
import { newId } from '@/domain/ids';
import { timetableFor, validateSlots } from '@/domain/timetable';
import type { Timetable, TimetableSlot } from '@/domain/types';
import { Icon } from '@/components/ui/icons';
import { Confirm, Empty } from '@/components/ui/primitives';
import { SlotListEditor } from './SlotEditor';

const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function TimetablePage() {
  const { timetables, exceptions } = useData();
  const act = useActions();
  const today = act.today();
  const [editing, setEditing] = useState<Timetable | 'new' | null>(null);
  const current = timetableFor(today, timetables);
  const sorted = [...timetables].sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const upcomingEx = [...exceptions.values()].filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  if (editing) return <TimetableForm table={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />;

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/settings" className="btn btn-quiet -ml-3 mb-2 text-graphite"><Icon name="chevronLeft" size={18} /> 설정</Link>
      <header className="mb-6 flex items-end justify-between">
        <h1 className="text-[28px] font-bold">학교 시간표</h1>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> 학기 시간표</button>
      </header>
      {sorted.length === 0 ? (
        <Empty title="등록한 시간표가 없습니다" body="학기별로 기본 시간표를 등록하면 매주 반복되어 홈과 주간 계획에 표시됩니다." action={<button className="btn btn-primary" onClick={() => setEditing('new')}>시간표 등록</button>} />
      ) : (
        <ul className="divide-y divide-rule rounded-2xl border border-rule bg-surface px-4">
          {sorted.map((t) => (
            <li key={t.id}>
              <button className="flex w-full items-center justify-between gap-3 py-3.5 text-left" onClick={() => setEditing(t)}>
                <span>
                  <span className="font-semibold">{t.name}</span>
                  {current?.id === t.id && <span className="ml-2 text-xs font-semibold text-omr">사용 중</span>}
                  <span className="num block text-sm text-graphite">{formatDateKo(t.validFrom, false)} ~ {t.validTo ? formatDateKo(t.validTo, false) : '계속'} · {t.slots.length}교시 분량</span>
                </span>
                <Icon name="chevronRight" size={18} className="text-faint" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <section className="mt-10">
        <h2 className="mb-2 text-[15px] font-bold">날짜별 변경</h2>
        <p className="mb-3 text-sm text-graphite">특정 날짜만 수업을 바꾸려면 주간 계획이나 달력에서 그 날짜의 "시간표"를 누르세요.</p>
        {upcomingEx.length > 0 && (
          <ul className="divide-y divide-rule rounded-2xl border border-rule bg-surface px-4 text-sm">
            {upcomingEx.map((e) => (
              <li key={e.date} className="flex justify-between py-2.5">
                <span>{formatDateKo(e.date)}{e.note && ` · ${e.note}`}</span>
                <span className="text-graphite">{e.slots.length}교시</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TimetableForm({ table, onClose }: { table: Timetable | null; onClose: () => void }) {
  const act = useActions();
  const today = act.today();
  const [name, setName] = useState(table?.name ?? '');
  const [from, setFrom] = useState(table?.validFrom ?? today);
  const [to, setTo] = useState(table?.validTo ?? '');
  const [slots, setSlots] = useState<TimetableSlot[]>(table?.slots ?? []);
  const [day, setDay] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const daySlots = slots.filter((s) => s.weekday === day).sort((a, b) => a.start.localeCompare(b.start));
  const setDaySlots = (list: TimetableSlot[]) => {
    setSlots([...slots.filter((s) => s.weekday !== day), ...list]);
    setError(null);
  };
  const copyTimesFrom = (src: number) => {
    const source = slots.filter((s) => s.weekday === src).sort((a, b) => a.start.localeCompare(b.start));
    setDaySlots(source.map((s) => ({ ...s, id: newId(), weekday: day, label: '', subjectId: null, memo: '' })));
  };

  const save = () => {
    if (!name.trim()) return setError('시간표 이름을 입력하세요 (예: 1학년 2학기).');
    if (!from) return setError('적용 시작일을 입력하세요.');
    if (to && to < from) return setError('적용 종료일이 시작일보다 빠릅니다.');
    const err = validateSlots(slots);
    if (err) {
      const bad = slots.find((s) => err.startsWith(`${s.period}교시`));
      if (bad) setDay(bad.weekday);
      return setError(err);
    }
    act.saveTimetable({ id: table?.id ?? newId(), name: name.trim(), validFrom: from, validTo: to || null, slots, createdAt: table?.createdAt });
    onClose();
  };

  const prevDay = WEEK[WEEK.indexOf(day) - 1];

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <button className="btn btn-quiet -ml-3 mb-2 text-graphite" onClick={onClose}><Icon name="chevronLeft" size={18} /> 시간표 목록</button>
      <h1 className="mb-6 text-[28px] font-bold">{table ? '시간표 수정' : '새 학기 시간표'}</h1>

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="tt-name">이름</label>
          <input id="tt-name" className="field" placeholder="예: 1학년 2학기" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="tt-from">적용 시작일</label>
            <input id="tt-from" type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="tt-to">적용 종료일 (선택)</label>
            <input id="tt-to" type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-4 mt-8 mb-4 bg-paper/95 px-4 py-2 backdrop-blur">
        <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="요일">
          {WEEK.map((w) => {
            const n = slots.filter((s) => s.weekday === w).length;
            return (
              <button key={w} role="tab" aria-selected={day === w} onClick={() => setDay(w)} className={`flex min-h-12 flex-col items-center justify-center rounded-xl text-sm font-semibold ${day === w ? 'bg-ink text-paper' : 'bg-surface'}`}>
                {WEEKDAY_KO[w]}
                <span className={`num text-[11px] font-normal ${day === w ? 'text-paper/70' : 'text-faint'}`}>{n || '–'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {daySlots.length === 0 && prevDay !== undefined && slots.some((s) => s.weekday === prevDay) && (
        <button className="btn btn-line mb-3 w-full" onClick={() => copyTimesFrom(prevDay)}>
          {WEEKDAY_KO[prevDay]}요일 교시 시간 그대로 가져오기
        </button>
      )}
      <SlotListEditor slots={daySlots} weekday={day} onChange={setDaySlots} />

      {error && <p role="alert" className="mt-4 text-sm font-semibold text-omr">{error}</p>}
      <div className="mt-8 flex gap-2">
        {table && <button className="btn btn-quiet btn-danger" onClick={() => setConfirm(true)}>삭제</button>}
        <button className="btn btn-line ml-auto" onClick={onClose}>취소</button>
        <button className="btn btn-primary min-w-28" onClick={save}>저장</button>
      </div>
      {table && (
        <Confirm open={confirm} onClose={() => setConfirm(false)} title="시간표 삭제" danger confirmLabel="삭제" body={`"${table.name}" 시간표를 삭제합니다. 날짜별로 따로 바꾼 시간표와 공부 기록은 남습니다.`} onConfirm={() => { act.deleteTimetable(table.id); onClose(); }} />
      )}
    </div>
  );
}
