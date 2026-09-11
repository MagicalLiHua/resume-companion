import { useEffect, useRef, type ReactNode } from 'react';

export function Brand({ small = false }: { small?: boolean }) {
  return <div className={`brand ${small ? 'small' : ''}`}><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M8 5h12l5 5v17H8z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M19 5v6h6M12 17h9m-9 5h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></span><span>简历随行<small>RESUME COMPANION</small></span></div>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? 'alert' : 'status'} className={`notice ${error ? 'error' : ''}`}>{children}</div>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const focusable = () => [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type=hidden]),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
    (focusable()[0] ?? dialog.current)?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); close.current();}
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (!first) {event.preventDefault(); dialog.current?.focus();}
        else if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {event.preventDefault(); last?.focus();}
        else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {event.preventDefault(); first.focus();}
      }
    };
    document.addEventListener('keydown', trap);
    return () => {document.removeEventListener('keydown', trap); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus();};
  }, []);
  return <div className="modal-backdrop"><section ref={dialog} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={onClose} aria-label="关闭">×</button></header>{children}</section></div>;
}
