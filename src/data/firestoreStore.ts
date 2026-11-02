import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import type { CollectionName, SingleDoc, SnapshotMeta, Store, Unsubscribe, WriteOp } from './store';

export class FirestoreStore implements Store {
  readonly kind = 'firestore' as const;

  constructor(
    private db: Firestore,
    readonly uid: string,
  ) {}

  private col(name: CollectionName) {
    return collection(this.db, 'users', this.uid, name);
  }

  private single(name: SingleDoc): DocumentReference {
    return name === 'settings' ? doc(this.db, 'users', this.uid) : doc(this.db, 'users', this.uid, 'state', 'activeTimer');
  }

  watchCollection<T>(name: CollectionName, cb: (docs: T[], meta: SnapshotMeta) => void, onError: (e: Error) => void): Unsubscribe {
    return onSnapshot(
      this.col(name),
      { includeMetadataChanges: true },
      (snap) =>
        cb(
          snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T),
          { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  watchDoc<T>(name: SingleDoc, cb: (data: T | null, meta: SnapshotMeta) => void, onError: (e: Error) => void): Unsubscribe {
    return onSnapshot(
      this.single(name),
      { includeMetadataChanges: true },
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        // users/{uid} 문서에는 settings 필드로 저장한다 (향후 프로필 필드와 분리)
        const value = name === 'settings' ? ((data?.settings as T | undefined) ?? null) : ((data as T | null) ?? null);
        cb(value, { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites });
      },
      onError,
    );
  }

  async commit(ops: WriteOp[]): Promise<void> {
    const batch = writeBatch(this.db);
    for (const op of ops) {
      switch (op.kind) {
        case 'set':
          batch.set(doc(this.col(op.col), op.id), { ...op.data, id: op.id, userId: this.uid }, { merge: Boolean(op.merge) });
          break;
        case 'delete':
          batch.delete(doc(this.col(op.col), op.id));
          break;
        case 'setDoc':
          if (op.doc === 'settings') {
            batch.set(this.single('settings'), { userId: this.uid, settings: op.data }, { merge: true });
          } else {
            batch.set(this.single(op.doc), { ...op.data, userId: this.uid }, { merge: Boolean(op.merge) });
          }
          break;
        case 'deleteDoc':
          batch.delete(this.single(op.doc));
          break;
      }
    }
    await batch.commit();
  }
}
