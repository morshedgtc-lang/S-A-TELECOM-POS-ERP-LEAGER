import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { t } from '../i18n';
import Modal from './Modal';

/** Short beep + vibration so the user knows a code was read. */
function feedback() {
  try {
    navigator.vibrate?.(60);
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1800;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => ctx.close();
  } catch {
    // Sound and vibration are optional.
  }
}

/**
 * Camera barcode / QR scanner (back camera). USB and Bluetooth scanners type into the
 * text box instead. With `continuous`, the camera stays open for the next item.
 */
export default function Scanner({ title, onResult, onClose, continuous = false }: {
  title?: string;
  onResult: (code: string) => void;
  onClose: () => void;
  continuous?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  // Callbacks are read through refs so a parent re-render never restarts the camera.
  const resultRef = useRef(onResult);
  resultRef.current = onResult;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [last, setLast] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError(t('এই ব্রাউজারে ক্যামেরা চালু করা যাচ্ছে না (https দরকার)'));
      return;
    }
    // The decoder is large, so it is only downloaded when a scanner opens.
    import('@zxing/browser')
      .then(({ BrowserMultiFormatReader }) => new BrowserMultiFormatReader().decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoRef.current!, (result) => {
        if (!result) return;
        const code = result.getText().trim();
        const now = Date.now();
        // The same code is read many times a second; accept it again only after a pause.
        if (code === lastRef.current.code && now - lastRef.current.at < 2000) return;
        lastRef.current = { code, at: now };
        feedback();
        setLast(code);
        resultRef.current(code);
        if (!continuous) {
          controlsRef.current?.stop();
          closeRef.current();
        }
      }))
      .then((controls) => {
        if (cancelled) controls.stop();
        else {
          controlsRef.current = controls;
          setStatus('scanning');
        }
      })
      .catch((e: Error) => {
        setStatus('error');
        setError(e?.name === 'NotAllowedError'
          ? t('ক্যামেরার অনুমতি দেওয়া হয়নি — ফোনের সেটিংস থেকে অনুমতি দিন')
          : t('ক্যামেরা চালু হয়নি: {msg}', { msg: e?.message ?? '' }));
      });
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [continuous]);

  function submitManual(e: FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    setManual('');
    setLast(code);
    onResult(code);
    if (!continuous) onClose();
  }

  return (
    <Modal title={title ?? t('বারকোড স্ক্যান')} onClose={onClose}>
      <div className="scanner">
        <video ref={videoRef} muted playsInline className={status === 'scanning' ? 'on' : ''} />
        {status === 'scanning' && <div className="scan-frame" aria-hidden="true"><span /></div>}
        {status === 'starting' && <div className="scan-msg"><i className="fa-solid fa-spinner fa-spin" /> {t('ক্যামেরা চালু হচ্ছে…')}</div>}
        {status === 'error' && <div className="scan-msg error-text"><i className="fa-solid fa-video-slash" /> {error}</div>}
      </div>
      {continuous && last && <div className="ok">{t('শেষ স্ক্যান')}: <b>{last}</b></div>}
      <form className="inline scanner-manual" onSubmit={submitManual}>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t('অথবা কোড লিখুন / স্ক্যানার দিয়ে স্ক্যান করুন')} autoFocus={status === 'error'} />
        <button><i className="fa-solid fa-check" /></button>
      </form>
      <p className="muted small-note">{t('বারকোড বা QR ফ্রেমের মাঝে ধরুন। আলো কম হলে কাছে আনুন।')}</p>
    </Modal>
  );
}
