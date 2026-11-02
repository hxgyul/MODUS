import { BrowserRouter, NavLink, Outlet, Route, Routes, useLocation } from 'react-router';
import { useEffect } from 'react';
import { isFirebaseConfigured } from '@/lib/firebase';
import { authMessage, completeRedirect } from '@/data/account';
import { useToast } from '@/components/ui/toast';
import { DataProvider, useData } from '@/data/DataProvider';
import { ToastProvider } from '@/components/ui/toast';
import { Icon, type IconName } from '@/components/ui/icons';
import { ThemeProvider } from './theme';
import { TimerBar, TimerProvider } from '@/features/timer/Timer';
import { HomePage } from '@/features/home/HomePage';
import { SubjectsPage } from '@/features/subjects/SubjectsPage';
import { SubjectDetailPage } from '@/features/subjects/SubjectDetailPage';
import { PlanPage } from '@/features/plan/PlanPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { StatsPage } from '@/features/stats/StatsPage';
import { RecordsPage } from '@/features/stats/RecordsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TimetablePage } from '@/features/timetable/TimetablePage';
import { UpdatePrompt } from './UpdatePrompt';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: '홈', icon: 'home', end: true },
  { to: '/subjects', label: '과목', icon: 'grid' },
  { to: '/plan', label: '계획', icon: 'week' },
  { to: '/calendar', label: '달력', icon: 'calendar' },
  { to: '/stats', label: '통계', icon: 'chart' },
];

function Status() {
  const { online, pending, account, error } = useData();
  if (error) return <div role="alert" className="mb-4 rounded-xl bg-omr-soft px-4 py-2.5 text-sm font-semibold text-omr">{error}</div>;
  if (!online && account.mode === 'firestore')
    return (
      <div role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-sunk px-4 py-2.5 text-sm text-graphite">
        <Icon name="offline" size={16} /> 오프라인 — 변경 사항은 이 기기에 저장되고, 연결되면 자동으로 올라갑니다.
      </div>
    );
  if (pending && account.mode === 'firestore') return <p role="status" className="mb-2 text-right text-xs text-faint">저장 중…</p>;
  return null;
}

function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[208px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">본문으로 건너뛰기</a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule px-3 py-6 md:flex">
        <p className="mb-6 px-3 text-[15px] font-bold tracking-[0.14em]">MODUS</p>
        <nav aria-label="주 메뉴" className="space-y-0.5">
          {[...NAV, { to: '/settings', label: '설정', icon: 'settings' as IconName }].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold ${isActive ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-graphite hover:bg-sunk'}`}>
              <Icon name={n.icon} size={19} /> {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <div className="flex items-center justify-end px-4 pt-[max(env(safe-area-inset-top),12px)] md:hidden">
          <NavLink to="/settings" className="btn btn-quiet -mr-3 px-3 text-graphite" aria-label="설정"><Icon name="settings" /></NavLink>
        </div>
        <main id="main" className="px-4 pb-[calc(env(safe-area-inset-bottom)+160px)] md:px-8 md:pt-8 md:pb-28">
          <Status />
          <Outlet />
        </main>
      </div>

      {/* 실행 중 타이머 — 모든 화면 */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 px-3 md:bottom-5 md:left-[208px] md:mx-auto md:max-w-xl">
        <TimerBar />
      </div>

      <nav aria-label="주 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.end} className={({ isActive }) => `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-ink' : 'text-faint'}`}>
                <Icon name={n.icon} size={22} />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** 홈 화면 앱에서 Google 로그인 후 돌아왔을 때 결과·오류를 알려 준다 */
function RedirectResult() {
  const toast = useToast();
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    completeRedirect()
      .then((r) => {
        if (r === 'done') toast({ tone: 'info', text: '로그인했습니다' });
        else if (r)
          toast({
            tone: 'error',
            text: '이 Google 계정은 이미 데이터가 있는 계정입니다. 그 계정으로 로그인하면 이 기기에서 계정 없이 입력한 내용은 옮겨지지 않습니다.',
            action: { label: '그 계정으로 로그인', run: () => void r.signInExisting().catch((e) => toast({ tone: 'error', text: authMessage(e) })) },
          });
      })
      .catch((e) => toast({ tone: 'error', text: authMessage(e) }));
  }, [toast]);
  return null;
}

function Themed({ children }: { children: React.ReactNode }) {
  const { settings } = useData();
  return <ThemeProvider mode={settings.theme}>{children}</ThemeProvider>;
}

function Loading({ message }: { message: string | null }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      {message ? <p className="max-w-sm text-sm leading-relaxed text-omr">{message}</p> : <p className="text-sm text-graphite">불러오는 중…</p>}
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <DataProvider fallback={(m) => <Loading message={m} />}>
        <Themed>
          <BrowserRouter>
            <TimerProvider>
              <RedirectResult />
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="subjects" element={<SubjectsPage />} />
                  <Route path="subjects/:id" element={<SubjectDetailPage />} />
                  <Route path="plan" element={<PlanPage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="stats" element={<StatsPage />} />
                  <Route path="stats/records" element={<RecordsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="settings/timetable" element={<TimetablePage />} />
                  <Route path="*" element={<HomePage />} />
                </Route>
              </Routes>
              <UpdatePrompt />
            </TimerProvider>
          </BrowserRouter>
        </Themed>
      </DataProvider>
    </ToastProvider>
  );
}
