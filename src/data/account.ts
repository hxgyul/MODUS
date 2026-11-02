import {
  EmailAuthProvider,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type AuthError,
} from 'firebase/auth';
import { getFirebase } from '@/lib/firebase';

/** 홈 화면에 설치된 iOS 앱에서는 팝업이 막히는 경우가 있어 리디렉션 방식으로 */
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function authMessage(e: unknown): string {
  const code = (e as AuthError)?.code ?? '';
  const map: Record<string, string> = {
    'auth/credential-already-in-use': '이 Google 계정은 이미 다른 데이터와 연결되어 있습니다. 아래 "이미 계정이 있어요"로 로그인하세요.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다. 아래 "이미 계정이 있어요"로 로그인하세요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
    'auth/invalid-email': '이메일 형식을 확인하세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않습니다.',
    'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
    'auth/popup-blocked': '로그인 창이 차단되었습니다. 다시 시도하세요.',
    'auth/network-request-failed': '인터넷 연결을 확인하세요.',
    'auth/operation-not-allowed': 'Firebase 콘솔에서 이 로그인 방식이 아직 켜져 있지 않습니다 (docs/SETUP.md 참고).',
    'auth/unauthorized-domain': '이 주소가 Firebase 승인된 도메인에 없습니다 (docs/SETUP.md 참고).',
    'auth/redirect-cancelled-by-user': '로그인을 취소했습니다.',
  };
  return map[code] ?? `계정 작업에 실패했습니다 (${code || (e as Error)?.message})`;
}

/** 지금 쓰는 익명 계정에 Google 계정을 연결 — uid가 그대로라 데이터 이전이 필요 없다 */
export async function linkGoogle() {
  const { auth } = getFirebase();
  if (!auth.currentUser) throw new Error('로그인 상태가 아닙니다.');
  const provider = new GoogleAuthProvider();
  if (isStandalone()) return linkWithRedirect(auth.currentUser, provider);
  await linkWithPopup(auth.currentUser, provider);
}

export async function linkEmail(email: string, password: string) {
  const { auth } = getFirebase();
  if (!auth.currentUser) throw new Error('로그인 상태가 아닙니다.');
  await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email.trim(), password));
}

/**
 * 다른 기기에서 이미 연결해 둔 계정으로 로그인.
 * 이 기기의 익명 데이터는 그 계정으로 옮겨지지 않는다 (화면에서 미리 안내).
 */
export async function signInGoogle() {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  if (isStandalone()) return signInWithRedirect(auth, provider);
  await signInWithPopup(auth, provider);
}

export async function signInEmail(email: string, password: string) {
  const { auth } = getFirebase();
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function logOut() {
  const { auth } = getFirebase();
  await signOut(auth);
}

/**
 * 리디렉션 로그인(홈 화면 앱)에서 돌아왔을 때 결과를 처리한다.
 * - 성공: 'done'
 * - 이미 다른 데이터에 연결된 Google 계정을 이 임시 계정에 연결하려 한 경우: 그 계정으로 로그인할 수 있는 함수를 돌려준다.
 * - 리디렉션으로 돌아온 게 아니면: null
 */
export async function completeRedirect(): Promise<null | 'done' | { signInExisting: () => Promise<unknown> }> {
  const { auth } = getFirebase();
  try {
    const r = await getRedirectResult(auth);
    return r ? 'done' : null;
  } catch (e) {
    if ((e as AuthError).code === 'auth/credential-already-in-use') {
      const cred = GoogleAuthProvider.credentialFromError(e as AuthError);
      if (cred) return { signInExisting: () => signInWithCredential(auth, cred) };
    }
    throw e;
  }
}
