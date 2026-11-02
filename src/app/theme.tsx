import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ThemeMode } from '@/domain/types';

const Ctx = createContext(false);
export const useIsDark = () => useContext(Ctx);

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ mode, children }: { mode: ThemeMode; children: ReactNode }) {
  const [sys, setSys] = useState(systemDark);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = mode === 'dark' || (mode === 'system' && sys);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101317' : '#f4f5f2');
    try {
      localStorage.setItem('sa:theme', mode);
    } catch {
      /* 무시 */
    }
  }, [dark, mode]);
  return <Ctx.Provider value={dark}>{children}</Ctx.Provider>;
}
