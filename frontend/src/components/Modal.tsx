import { useEffect, type ReactNode } from 'react';

export default function Modal({ title, onClose, children, wide = false }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-close" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
