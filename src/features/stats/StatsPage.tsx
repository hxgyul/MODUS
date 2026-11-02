import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useData } from '@/data/DataProvider';
import { useSubjectMap, useTasksInRange, useToday } from '@/data/selectors';
import { addDays, diffDays, studyDateOf, formatDateKo, formatDuration, monthRange, parseISODate, WEEKDAY_KO, weekDates } from '@/domain/dates';
import { planRates, secByDate, secBySubject, sessionsIn, totalSec } from '@/domain/stats';
import { elapsedSec } from '@/domain/timer';
import { Section, Segmented, useNow, useSubjectColor } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icons';

type Period = 'day' | 'week' | 'month';

export function StatsPage() {
  const { sessions, settings, activeTimer } = useData();
  const now = useNow(30_000);
  const today = useToday(now);
  const subjects = useSubjectMap();
  const color = useSubjectColor();
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);

  const { from, to, label } = useMemo(() => {
    if (period === 'day') {
      const d = addDays(today, offset);
      return { from: d, to: d, label: formatDateKo(d) };
    }
    if (period === 'week') {
      const days = weekDates(addDays(today, offset * 7), settings.weekStartsOn);
      return { from: days[0], to: days[6], label: `${formatDateKo(days[0], false)} – ${formatDateKo(days[6], false)}` };
    }
    const t = parseISODate(today);
    const r = monthRange(t.getFullYear(), t.getMonth() + offset);
    const m = parseISODate(r.from);
    return { ...r, label: `${m.getFullYear()}년 ${m.getMonth() + 1}월` };
  }, [period, offset, today, settings.weekStartsOn]);

  // 실행 중 타이머도 지금까지 공부한 만큼 반영 (저장 전이므로 별도 표기)
  const live = activeTimer && activeTimer.startAt ? elapsedSec(activeTimer, now) : 0;
  const liveDate = activeTimer ? studyDateOf(activeTimer.startAt, settings.dayStartHour) : today;
  const inRange = sessionsIn(sessions, from, to);
  const liveIn = live > 0 && liveDate >= from && liveDate <= to ? live : 0;
  const total = totalSec(inRange) + liveIn;
  const days = diffDays(to, from) + 1;
  const elapsedDays = Math.max(1, Math.min(days, diffDays(today, from) + 1));
  const perDay = secByDate(inRange);
  if (liveIn) perDay.set(liveDate, (perDay.get(liveDate) ?? 0) + liveIn);
  const bySubject = secBySubject(inRange);
  if (liveIn && activeTimer) bySubject.set(activeTimer.subjectId, (bySubject.get(activeTimer.subjectId) ?? 0) + liveIn);
  const subjectRows = [...bySubject.entries()].sort((a, b) => b[1] - a[1]);
  const maxSubject = subjectRows[0]?.[1] ?? 0;

  const planned = useTasksInRange(from, to);
  const rates = planRates(planned, sessions);

  const chartDays = Array.from({ length: days }, (_, i) => addDays(from, i));
  const maxDay = Math.max(0, ...chartDays.map((d) => perDay.get(d) ?? 0));

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[28px] font-bold">통계</h1>
        <Link to="/stats/records" className="btn btn-line">기록 조회</Link>
      </header>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="기간" value={period} onChange={(p) => { setPeriod(p); setOffset(0); }} options={[{ value: 'day', label: '일' }, { value: 'week', label: '주' }, { value: 'month', label: '월' }]} />
        <div className="flex items-center">
          <button className="btn btn-quiet px-2.5" aria-label="이전 기간" onClick={() => setOffset((o) => o - 1)}><Icon name="chevronLeft" /></button>
          <span className="num min-w-36 text-center text-[15px] font-semibold">{label}</span>
          <button className="btn btn-quiet px-2.5" aria-label="다음 기간" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}><Icon name="chevronRight" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="총 공부 시간" value={formatDuration(total)} note={liveIn ? '진행 중인 타이머 포함' : undefined} />
        <Tile label={period === 'day' ? '세션 수' : '하루 평균'} value={period === 'day' ? `${inRange.length}회` : formatDuration(total / elapsedDays)} note={period === 'day' ? undefined : `${elapsedDays}일 기준`} />
        <Tile
          label="과제 완료율"
          value={rates.completion.rate === null ? '—' : `${rates.completion.rate}%`}
          note={rates.completion.planned ? `계획 ${rates.completion.planned}개 중 ${rates.completion.done}개 완료` : '계획한 과제 없음'}
        />
        <Tile
          label="시간 실행률"
          value={rates.time.rate === null ? '—' : `${rates.time.rate}%`}
          note={rates.time.counted ? `예상 ${formatDuration(rates.time.plannedMin * 60)} · 실제 ${formatDuration(rates.time.actualSec)} (과제 ${rates.time.counted}개)` : '예상 시간을 입력한 과제 없음'}
        />
      </div>
      {rates.time.rate !== null && rates.time.rate > 110 && (
        <p className="mt-2 text-sm text-graphite">실제 시간이 예상보다 깁니다. 과제가 예상보다 오래 걸린다는 뜻일 수 있으니, 다음 계획에서는 예상 시간을 넉넉히 잡아 보세요.</p>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        {period !== 'day' && (
          <Section title="날짜별 공부 시간">
            {total === 0 ? <p className="text-sm text-graphite">이 기간에 기록된 공부가 없습니다.</p> : (
              <DayBars days={chartDays} values={perDay} max={maxDay} today={today} compact={period === 'month'} />
            )}
          </Section>
        )}
        <Section title="과목별 공부 시간">
          {subjectRows.length === 0 ? <p className="text-sm text-graphite">이 기간에 기록된 공부가 없습니다.</p> : (
            <table className="w-full text-sm">
              <caption className="sr-only">과목별 공부 시간과 비율</caption>
              <tbody>
                {subjectRows.map(([id, sec]) => {
                  const s = subjects.get(id);
                  return (
                    <tr key={id}>
                      <th scope="row" className="w-24 py-1.5 pr-3 text-left font-semibold">{s?.name ?? '삭제된 과목'}</th>
                      <td className="py-1.5">
                        <div className="h-3 rounded-r-[4px]" style={{ width: `${Math.max(2, (sec / maxSubject) * 100)}%`, background: color(s?.color) }} aria-hidden />
                      </td>
                      <td className="num w-28 py-1.5 pl-3 text-right">{formatDuration(sec)} <span className="text-graphite">{Math.round((sec / total) * 100)}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-surface p-4">
      <p className="text-[13px] text-graphite">{label}</p>
      <p className="num mt-1 text-[24px] leading-tight font-bold">{value}</p>
      {note && <p className="num mt-1 text-xs leading-snug text-graphite">{note}</p>}
    </div>
  );
}

function DayBars({ days, values, max, today, compact }: { days: string[]; values: Map<string, number>; max: number; today: string; compact: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const H = 160;
  return (
    <div>
      <div className="relative flex items-end gap-[2px] border-b border-rule" style={{ height: H }} role="list" aria-label="날짜별 공부 시간">
        {days.map((d) => {
          const v = values.get(d) ?? 0;
          const h = max ? (v / max) * (H - 24) : 0;
          const future = d > today;
          return (
            <button
              key={d}
              role="listitem"
              aria-label={`${formatDateKo(d)} ${formatDuration(v)}`}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d)}
              onBlur={() => setHover(null)}
            >
              <span className={`w-full max-w-9 rounded-t-[4px] ${future ? 'bg-rule' : d === today ? 'bg-ink' : 'bg-graphite/70'}`} style={{ height: v ? Math.max(2, h) : 0 }} />
              {hover === d && (
                <span className="num pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper">
                  {formatDateKo(d)} · {formatDuration(v)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] text-center text-[11px] text-graphite">
        {days.map((d, i) => {
          const dt = parseISODate(d);
          const show = !compact || i === 0 || dt.getDate() % 5 === 0;
          return <span key={d} className="num flex-1">{show ? (compact ? dt.getDate() : WEEKDAY_KO[dt.getDay()]) : ''}</span>;
        })}
      </div>
    </div>
  );
}
