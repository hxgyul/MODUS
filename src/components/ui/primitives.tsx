import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsDark } from '@/app/theme';
import { subjectColor } from './colors';
import { Icon } from './icons';

/** 1초(또는 지정 간격)마다 갱신되는 현재 시각 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const vis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [intervalMs]);
  return now;
}

export function SubjectDot({ color, size = 10 }: { color: string | undefined; size?: number }) {
  const dark = useIsDark();
  return <span aria-hidden className="inline-block flex-none rounded-full" style={{ width: size, height: size, background: subjectColor(color, dark) }} />;
}

export function useSubjectColor() {
  const dark = useIsDark();
  return (key: string | undefined) => subjectColor(key, dark);
}

export function Check({ on, onChange, label, disabled }: { on: boolean; onChange?: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="-m-2.5 grid place-items-center p-2.5 disabled:cursor-default"
    >
      <span className="check" data-on={on}>
        {on && <Icon name="check" size={14} />}
      </span>
    </button>
  );
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // onClose는 렌더링마다 새 함수일 수 있다 → 효과를 다시 실행하지 않도록 ref로 보관
  // (다시 실행되면 입력 중인 칸의 포커스를 빼앗아 휴대폰 키보드가 닫힌다)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    // 안쪽 입력 칸이 이미 포커스(autoFocus)를 가졌으면 건드리지 않는다
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus();
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="sheet outline-none">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-rule md:hidden" />
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button className="btn btn-quiet -mr-3 px-3" onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-line flex-1" onClick={onClose}>
            취소
          </button>
          <button
            className={`btn flex-1 ${danger ? 'bg-omr text-white' : 'btn-primary'}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[15px] leading-relaxed text-graphite">{body}</div>
    </Sheet>
  );
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-rule px-5 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1.5 text-sm leading-relaxed text-graphite">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Section({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] bg-sunk p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-[8px] px-3 text-sm font-semibold ${value === o.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-graphite'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
