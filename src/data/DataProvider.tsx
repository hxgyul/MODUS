import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase';
import { FirestoreStore } from './firestoreStore';
import { LocalStore } from './localStore';
import { COLLECTIONS, type CollectionName, type Store } from './store';
import {
  DEFAULT_SETTINGS,
  type ActiveTimer,
  type RecurrenceRule,
  type SchoolEvent,
  type StudySession,
  type Subject,
  type Task,
  type Timetable,
  type TimetableException,
  type TimerDoc,
  type UserSettings,
} from '@/domain/types';

export interface AccountInfo {
  uid: string;
  mode: 'firestore' | 'local';
  isAnonymous: boolean;
  email: string | null;
  providers: string[];
}

export interface DataState {
  store: Store;
  account: AccountInfo;
  /** 모든 컬렉션의 첫 스냅샷을 받았는지 */
  ready: boolean;
  subjects: Subject[];
  tasks: Task[];
  recurrences: RecurrenceRule[];
  sessions: StudySession[];
  timetables: Timetable[];
  exceptions: Map<string, TimetableException>;
  events: SchoolEvent[];
  settings: UserSettings;
  activeTimer: ActiveTimer | null;
  /** 활성 타이머 문서 원본 (종료 표시 포함, 문서가 없으면 null) */
  timerDoc: TimerDoc | null;
  /** 서버에 아직 올라가지 않은 변경이 있음 */
  pending: boolean;
  online: boolean;
  error: string | null;
}

const Ctx = createContext<DataState | null>(null);

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('DataProvider 밖에서 useData 사용');
  return v;
}

type Raw = {
  [K in CollectionName]: unknown[];
};

const EMPTY: Raw = {
  subjects: [],
  tasks: [],
  recurrences: [],
  sessions: [],
  timetables: [],
  timetableExceptions: [],
  events: [],
};

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** 인증 → 저장소 결정 */
function useStore(): { store: Store; account: AccountInfo } | { error: string } | null {
  const [state, setState] = useState<{ store: Store; account: AccountInfo } | { error: string } | null>(() =>
    isFirebaseConfigured
      ? null
      : {
          store: new LocalStore('local'),
          account: { uid: 'local', mode: 'local', isAnonymous: true, email: null, providers: [] },
        },
  );

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const { auth, db } = getFirebase();
    let current: string | null = null;
    return onAuthStateChanged(auth, (user: User | null) => {
      if (!user) {
        // 처음 실행: 익명 계정으로 시작 (설정에서 Google/이메일 계정과 연결 가능)
        signInAnonymously(auth).catch((e: Error) =>
          setState({ error: `로그인에 실패했습니다. 인터넷 연결을 확인한 뒤 새로고침하세요. (${e.message})` }),
        );
        return;
      }
      const account: AccountInfo = {
        uid: user.uid,
        mode: 'firestore',
        isAnonymous: user.isAnonymous,
        email: user.email,
        providers: user.providerData.map((p) => p.providerId),
      };
      if (current === user.uid) {
        // 같은 계정에 로그인 수단만 연결된 경우 — 저장소는 그대로 두고 계정 정보만 갱신
        setState((s) => (s && 'store' in s ? { store: s.store, account } : s));
        return;
      }
      current = user.uid;
      setState({ store: new FirestoreStore(db, user.uid), account });
    });
  }, []);

  return state;
}

export function DataProvider({ children, fallback }: { children: ReactNode; fallback: (msg: string | null) => ReactNode }) {
  const resolved = useStore();
  const online = useOnline();
  const [raw, setRaw] = useState<Raw>(EMPTY);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [pendingCols, setPendingCols] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [timerDoc, setTimerDoc] = useState<TimerDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  const store = resolved && 'store' in resolved ? resolved.store : null;

  useEffect(() => {
    if (!store) return;
    setRaw(EMPTY);
    setLoaded(new Set());
    const mark = (key: string, pending: boolean) => {
      setLoaded((s) => (s.has(key) ? s : new Set(s).add(key)));
      setPendingCols((s) => {
        if (pending === s.has(key)) return s;
        const n = new Set(s);
        if (pending) n.add(key);
        else n.delete(key);
        return n;
      });
    };
    const onError = (e: Error) => setError(`데이터를 불러오지 못했습니다: ${e.message}`);
    const unsubs = COLLECTIONS.map((col) =>
      store.watchCollection(col, (docs, meta) => {
        setRaw((r) => ({ ...r, [col]: docs }));
        mark(col, meta.hasPendingWrites);
      }, onError),
    );
    unsubs.push(
      store.watchDoc<UserSettings>('settings', (s, meta) => {
        setSettings({ ...DEFAULT_SETTINGS, ...(s ?? {}), notifications: { ...DEFAULT_SETTINGS.notifications, ...(s?.notifications ?? {}) } });
        mark('settings', meta.hasPendingWrites);
      }, onError),
      store.watchDoc<TimerDoc>('activeTimer', (t, meta) => {
        setTimerDoc(t);
        mark('activeTimer', meta.hasPendingWrites);
      }, onError),
    );
    return () => unsubs.forEach((u) => u());
  }, [store]);

  const value = useMemo<DataState | null>(() => {
    if (!resolved || !('store' in resolved)) return null;
    return {
      store: resolved.store,
      account: resolved.account,
      ready: loaded.size >= COLLECTIONS.length + 2,
      subjects: (raw.subjects as Subject[]).slice().sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
      tasks: raw.tasks as Task[],
      recurrences: raw.recurrences as RecurrenceRule[],
      sessions: (raw.sessions as StudySession[]).slice().sort((a, b) => b.startAt - a.startAt),
      timetables: raw.timetables as Timetable[],
      exceptions: new Map((raw.timetableExceptions as TimetableException[]).map((e) => [e.date, e])),
      events: (raw.events as SchoolEvent[]).slice().sort((a, b) => a.date.localeCompare(b.date)),
      settings,
      activeTimer: timerDoc && timerDoc.sessionId ? timerDoc : null,
      timerDoc,
      pending: pendingCols.size > 0,
      online,
      error,
    };
  }, [resolved, raw, loaded, pendingCols, settings, timerDoc, online, error]);

  if (!value) return <>{fallback(resolved && 'error' in resolved ? resolved.error : null)}</>;
  if (!value.ready) return <>{fallback(error)}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
