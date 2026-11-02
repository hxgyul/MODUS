/**
 * 저장소 인터페이스.
 * 화면·도메인 코드는 이 인터페이스만 사용한다. 구현은 두 가지:
 *  - FirestoreStore: 실제 서비스 (오프라인 캐시 + 자동 동기화)
 *  - LocalStore: Firebase 설정이 없을 때의 "로컬 모드"(이 기기에만 저장) 및 테스트
 *
 * 경로: users/{uid}/{collection}/{id}, 단일 문서는 users/{uid} (settings), users/{uid}/state/activeTimer
 */
export type CollectionName =
  | 'subjects'
  | 'tasks'
  | 'recurrences'
  | 'sessions'
  | 'timetables'
  | 'timetableExceptions'
  | 'events';

export const COLLECTIONS: CollectionName[] = [
  'subjects',
  'tasks',
  'recurrences',
  'sessions',
  'timetables',
  'timetableExceptions',
  'events',
];

export type SingleDoc = 'settings' | 'activeTimer';

export type WriteOp =
  | { kind: 'set'; col: CollectionName; id: string; data: object; merge?: boolean }
  | { kind: 'delete'; col: CollectionName; id: string }
  | { kind: 'setDoc'; doc: SingleDoc; data: object; merge?: boolean }
  | { kind: 'deleteDoc'; doc: SingleDoc };

export interface SnapshotMeta {
  /** 서버 확인 전(캐시) 데이터인지 */
  fromCache: boolean;
  /** 아직 서버에 올라가지 않은 쓰기가 있는지 */
  hasPendingWrites: boolean;
}

export type Unsubscribe = () => void;

export interface Store {
  readonly kind: 'firestore' | 'local';
  readonly uid: string;
  watchCollection<T>(col: CollectionName, cb: (docs: T[], meta: SnapshotMeta) => void, onError: (e: Error) => void): Unsubscribe;
  watchDoc<T>(doc: SingleDoc, cb: (data: T | null, meta: SnapshotMeta) => void, onError: (e: Error) => void): Unsubscribe;
  /**
   * 여러 쓰기를 원자적으로 반영한다(배치).
   * 오프라인이면 로컬에 즉시 반영되고, 연결되면 업로드된다. 반환 Promise는 서버 확인 시 끝난다.
   */
  commit(ops: WriteOp[]): Promise<void>;
}
