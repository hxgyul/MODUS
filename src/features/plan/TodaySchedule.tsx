import { Link } from 'react-router';
import { useData } from '@/data/DataProvider';
import { msToHHmm } from '@/domain/dates';
import { scheduleFor } from '@/domain/timetable';
import { Section, SubjectDot, useNow } from '@/components/ui/primitives';
import { useSubjectMap } from '@/data/selectors';

/** 홈 화면의 오늘 학교 시간표 */
export function TodaySchedule({ date }: { date: string }) {
  const { timetables, exceptions } = useData();
  const subjects = useSubjectMap();
  const now = useNow(30_000);
  const day = scheduleFor(date, timetables, exceptions);
  const clock = msToHHmm(now);

  if (timetables.length === 0 && !day.isException) {
    return (
      <Section title="오늘 시간표">
        <p className="text-sm text-graphite">
          학교 시간표를 등록하면 여기와 주간 계획에 함께 보입니다. <Link to="/settings/timetable" className="font-semibold text-ink underline underline-offset-4">시간표 등록</Link>
        </p>
      </Section>
    );
  }
  return (
    <Section title="오늘 시간표" aside={day.isException ? <span className="text-xs font-semibold text-omr">변경된 날</span> : undefined}>
      {day.note && <p className="mb-2 text-sm text-graphite">{day.note}</p>}
      {day.slots.length === 0 ? (
        <p className="text-sm text-graphite">오늘은 수업이 없습니다.</p>
      ) : (
        <ol className="space-y-px overflow-hidden rounded-2xl border border-rule bg-rule">
          {day.slots.map((s) => {
            const nowIn = clock >= s.start && clock < s.end;
            return (
              <li key={s.id} className={`flex gap-3 bg-surface px-3.5 py-2.5 ${nowIn ? 'bg-omr-soft' : ''}`} aria-current={nowIn ? 'time' : undefined}>
                <span className="num w-5 pt-px text-sm text-faint">{s.period}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {s.subjectId && <SubjectDot color={subjects.get(s.subjectId)?.color} size={8} />}
                    {s.label}
                  </span>
                  {s.memo && <span className="mt-0.5 block text-xs text-graphite">{s.memo}</span>}
                </span>
                <span className="num text-xs text-graphite">{s.start}–{s.end}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
