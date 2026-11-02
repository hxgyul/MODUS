import { useRegisterSW } from 'virtual:pwa-register/react';

/** 새 버전이 배포되면 알려 주고, 사용자가 누를 때 갱신 (공부 중 강제 새로고침 방지) */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // 앱을 오래 켜 두는 경우를 위해 1시간마다 업데이트 확인
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed top-[max(env(safe-area-inset-top),12px)] left-1/2 z-[80] flex w-[min(92vw,420px)] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-paper">
      <span>새 버전이 있습니다.</span>
      <span className="flex gap-3">
        <button className="font-semibold opacity-70" onClick={() => setNeedRefresh(false)}>나중에</button>
        <button className="font-bold underline underline-offset-4" onClick={() => updateServiceWorker(true)}>업데이트</button>
      </span>
    </div>
  );
}
