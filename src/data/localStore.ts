import type { CollectionName, SingleDoc, SnapshotMeta, Store, Unsubscribe, WriteOp } from './store';

type Bucket = Record<string, Record<string, unknown>>;

const META: SnapshotMeta = { fromCache: false, hasPendingWrites: false };

/**
 * 로컬 모드 저장소 — localStorage에 사용자별로 저장.
 * 같은 브라우저의 다른 탭과는 storage 이벤트로 동기화된다.
 * 기기 간 동기화는 하지 않는다 (Firebase 연결 후 가능).
 */
export class LocalStore implements Store {
  readonly kind = 'local' as const;
  private listeners = new Map<string, Set<() => void>>();
  private storage: Storage;

  constructor(readonly uid: string, storage: Storage = globalThis.localStorage) {
    this.storage = storage;
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key?.startsWith(this.prefix)) this.emit(e.key.slice(this.prefix.length));
      });
    }
  }

  private get prefix() {
    return `sa:${this.uid}:`;
  }

  private read(key: string): Bucket {
    try {
      const raw = this.storage.getItem(this.prefix + key);
      return raw ? (JSON.parse(raw) as Bucket) : {};
    } catch {
      return {};
    }
  }

  private write(key: string, v: Bucket) {
    this.storage.setItem(this.prefix + key, JSON.stringify(v));
  }

  private emit(key: string) {
    this.listeners.get(key)?.forEach((fn) => fn());
  }

  private on(key: string, fn: () => void): Unsubscribe {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn);
    fn();
    return () => this.listeners.get(key)?.delete(fn);
  }

  watchCollection<T>(col: CollectionName, cb: (docs: T[], meta: SnapshotMeta) => void): Unsubscribe {
    return this.on(col, () => cb(Object.values(this.read(col)) as T[], META));
  }

  watchDoc<T>(doc: SingleDoc, cb: (data: T | null, meta: SnapshotMeta) => void): Unsubscribe {
    return this.on(`doc:${doc}`, () => cb((this.read(`doc:${doc}`).value as T | undefined) ?? null, META));
  }

  async commit(ops: WriteOp[]): Promise<void> {
    // 모든 연산을 먼저 계산한 뒤 한꺼번에 기록 → 중간 실패 시 일부만 반영되는 일이 없음
    const touched = new Map<string, Bucket>();
    const get = (key: string) => {
      if (!touched.has(key)) touched.set(key, structuredClone(this.read(key)));
      return touched.get(key)!;
    };
    for (const op of ops) {
      switch (op.kind) {
        case 'set': {
          const b = get(op.col);
          const prev = op.merge ? (b[op.id] ?? {}) : {};
          b[op.id] = { ...prev, ...clean(op.data), id: op.id };
          break;
        }
        case 'delete':
          delete get(op.col)[op.id];
          break;
        case 'setDoc': {
          const b = get(`doc:${op.doc}`);
          const prev = op.merge ? ((b.value as object | undefined) ?? {}) : {};
          b.value = { ...prev, ...clean(op.data) };
          break;
        }
        case 'deleteDoc':
          delete get(`doc:${op.doc}`).value;
          break;
      }
    }
    for (const [key, v] of touched) this.write(key, v);
    for (const key of touched.keys()) this.emit(key);
  }
}

/** Firestore와 같은 의미가 되도록 undefined 필드는 버린다 */
function clean(data: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}
