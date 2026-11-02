import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useData } from '@/data/DataProvider';
import { useActions } from '@/data/actions';
import { authMessage, linkEmail, linkGoogle, logOut, signInEmail, signInGoogle } from '@/data/account';
import type { ThemeMode } from '@/domain/types';
import { Icon } from '@/components/ui/icons';
import { Confirm, Segmented, Sheet } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

export function SettingsPage() {
  const { settings, timetables, subjects } = useData();
  const act = useActions();
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <h1 className="text-[28px] font-bold">설정</h1>

      <Group title="학습">
        <Row label="과목 관리" hint={`${subjects.filter((s) => !s.archived).length}개`}>
          <Link to="/subjects" className="btn btn-quiet -mr-3 text-graphite">열기 <Icon name="chevronRight" size={16} /></Link>
        </Row>
        <Row label="학교 시간표" hint={timetables.length ? `${timetables.length}개 학기` : '등록 안 함'}>
          <Link to="/settings/timetable" className="btn btn-quiet -mr-3 text-graphite">열기 <Icon name="chevronRight" size={16} /></Link>
        </Row>
        <Row label="하루가 바뀌는 시각" hint={`${settings.dayStartHour}시 이전에 한 공부는 전날 기록으로 셉니다.`}>
          <select aria-label="하루가 바뀌는 시각" className="field num w-auto" value={settings.dayStartHour} onChange={(e) => act.updateSettings({ dayStartHour: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{h === 0 ? '자정 (0시)' : `새벽 ${h}시`}</option>)}
          </select>
        </Row>
        <Row label="주의 시작">
          <Segmented label="주의 시작" value={String(settings.weekStartsOn)} onChange={(v) => act.updateSettings({ weekStartsOn: Number(v) as 0 | 1 })} options={[{ value: '1', label: '월요일' }, { value: '0', label: '일요일' }]} />
        </Row>
      </Group>

      <Group title="화면">
        <Row label="테마">
          <Segmented<ThemeMode> label="테마" value={settings.theme} onChange={(theme) => act.updateSettings({ theme })} options={[{ value: 'system', label: '시스템' }, { value: 'light', label: '라이트' }, { value: 'dark', label: '다크' }]} />
        </Row>
      </Group>

      <Account />
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[15px] font-bold">{title}</h2>
      <div className="divide-y divide-rule rounded-2xl border border-rule bg-surface px-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        {hint && <p className="text-sm text-graphite">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Account() {
  const { account, online } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [emailMode, setEmailMode] = useState<'link' | 'signin' | null>(null);
  const [signInWarn, setSignInWarn] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ tone: 'info', text: ok });
      return true;
    } catch (e) {
      toast({ tone: 'error', text: authMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (account.mode === 'local') {
    return (
      <Group title="계정과 동기화">
        <div className="py-4 text-sm leading-relaxed text-graphite">
          <p className="font-semibold text-ink">로컬 모드 — 이 브라우저에만 저장 중</p>
          <p className="mt-1">Firebase가 아직 연결되지 않은 상태입니다. 연결하면 휴대폰·태블릿 간 동기화와 계정 로그인이 켜집니다. 연결 방법은 docs/SETUP.md에 있습니다.</p>
        </div>
      </Group>
    );
  }

  const linked = !account.isAnonymous;
  return (
    <Group title="계정과 동기화">
      <Row label={linked ? (account.email ?? '로그인됨') : '임시 계정 (이 기기 전용)'} hint={linked ? '이 계정으로 로그인한 모든 기기에서 같은 데이터를 씁니다.' : '계정을 연결해야 다른 기기에서도 같은 데이터를 쓸 수 있고, 앱을 지워도 데이터가 남습니다.'}>
        {linked && <button className="btn btn-quiet -mr-3 text-graphite" onClick={() => setConfirmOut(true)}>로그아웃</button>}
      </Row>
      {!linked && (
        <div className="space-y-2 py-4">
          <button className="btn btn-primary w-full" disabled={busy || !online} onClick={() => run(linkGoogle, 'Google 계정을 연결했습니다')}>Google 계정 연결</button>
          <button className="btn btn-line w-full" disabled={busy || !online} onClick={() => setEmailMode('link')}>이메일로 계정 만들기</button>
          <button className="btn btn-quiet w-full text-graphite" disabled={busy || !online} onClick={() => setSignInWarn(true)}>이미 계정이 있어요 (다른 기기에서 연결함)</button>
          {!online && <p className="text-center text-xs text-omr">계정 연결은 인터넷이 연결되어 있을 때만 할 수 있습니다.</p>}
        </div>
      )}
      <Confirm
        open={signInWarn}
        onClose={() => setSignInWarn(false)}
        title="기존 계정으로 로그인"
        confirmLabel="계속"
        body="기존 계정의 데이터로 바뀝니다. 이 기기에서 계정 연결 없이 입력한 내용은 기존 계정으로 옮겨지지 않습니다."
        onConfirm={() => setEmailMode('signin')}
      />
      <Confirm open={confirmOut} onClose={() => setConfirmOut(false)} title="로그아웃" confirmLabel="로그아웃" body="로그아웃하면 새 임시 계정으로 시작합니다. 데이터는 계정에 남아 있어 다시 로그인하면 돌아옵니다." onConfirm={() => run(logOut, '로그아웃했습니다')} />
      {emailMode && (
        <EmailSheet
          mode={emailMode}
          busy={busy}
          onClose={() => setEmailMode(null)}
          onGoogle={() => run(signInGoogle, '로그인했습니다').then((ok) => ok && setEmailMode(null))}
          onSubmit={(email, pw) =>
            run(() => (emailMode === 'link' ? linkEmail(email, pw) : signInEmail(email, pw)), emailMode === 'link' ? '이메일 계정을 연결했습니다' : '로그인했습니다').then((ok) => ok && setEmailMode(null))
          }
        />
      )}
    </Group>
  );
}

function EmailSheet({ mode, busy, onClose, onSubmit, onGoogle }: { mode: 'link' | 'signin'; busy: boolean; onClose: () => void; onSubmit: (e: string, p: string) => void; onGoogle: () => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  return (
    <Sheet open onClose={onClose} title={mode === 'link' ? '이메일로 계정 만들기' : '기존 계정으로 로그인'}>
      {mode === 'signin' && (
        <>
          <button className="btn btn-primary w-full" disabled={busy} onClick={onGoogle}>Google로 로그인</button>
          <p className="my-4 text-center text-xs text-faint">또는 이메일</p>
        </>
      )}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(email, pw); }}>
        <div><label className="label" htmlFor="em">이메일</label><input id="em" type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><label className="label" htmlFor="pw">비밀번호 (6자 이상)</label><input id="pw" type="password" autoComplete={mode === 'link' ? 'new-password' : 'current-password'} minLength={6} className="field" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        <button className={`btn w-full ${mode === 'link' ? 'btn-primary' : 'btn-line'}`} disabled={busy}>{mode === 'link' ? '계정 만들고 연결' : '이메일로 로그인'}</button>
      </form>
    </Sheet>
  );
}
