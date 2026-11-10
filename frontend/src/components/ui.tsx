import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import {
  AlertTriangle, ArrowLeft, BarChart3, Bell, Building2, Calendar, Camera, Check, ChevronDown, ChevronRight, ClipboardList, Clock, Copy, Droplet, Eye,
  Filter, Heart, ImageIcon, Inbox, Info, Loader2, LogOut, Lock, Mail, MapPin, Menu, MoreHorizontal, Pencil, Play, Plus, RotateCcw, Route, Search, Send,
  Shield, Sparkles, Ticket as TicketIcon, Trash2, Upload, User, Users, Wifi, Wind, Wrench, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { HistoryEntry, Status } from '../lib/api';
import { STATUS, STEPS, describe, fmtShort, stepIndex } from '../lib/format';

const ICONS: Record<string, LucideIcon> = {
  alert: AlertTriangle, back: ArrowLeft, chart: BarChart3, bell: Bell, building: Building2, calendar: Calendar, camera: Camera, check: Check, down: ChevronDown,
  right: ChevronRight, list: ClipboardList, clock: Clock, copy: Copy, droplet: Droplet, eye: Eye, filter: Filter, heart: Heart, image: ImageIcon, inbox: Inbox,
  info: Info, loader: Loader2, logout: LogOut, lock: Lock, mail: Mail, pin: MapPin, menu: Menu, more: MoreHorizontal, pencil: Pencil, play: Play, plus: Plus, undo: RotateCcw,
  route: Route, search: Search, send: Send, shield: Shield, sparkles: Sparkles, ticket: TicketIcon, trash: Trash2, upload: Upload, user: User, users: Users,
  wifi: Wifi, wind: Wind, wrench: Wrench, x: X, zap: Zap,
};
export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? Info;
  return <C size={size} strokeWidth={1.8} className={className} aria-hidden />;
}
export function Bubble({ icon, tone = 'pink', size = 40, iconSize }: { icon: string; tone?: string; size?: number; iconSize?: number }) {
  return <span className={`bubble tone-${tone}`} style={{ width: size, height: size }}><Icon name={icon} size={iconSize ?? Math.round(size / 2)} /></span>;
}

type BtnKind = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export function Button({ kind = 'primary', icon, sm, block, busy, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; icon?: string; sm?: boolean; block?: boolean; busy?: boolean }) {
  return (
    <button className={`btn ${kind}${sm ? ' sm' : ''}${block ? ' block' : ''} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy ? <Icon name="loader" className="spin" /> : icon ? <Icon name={icon} size={sm ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export const Badge = ({ status }: { status: Status }) => <span className={`badge tone-${STATUS[status]?.tone ?? 'gray'}`}>{STATUS[status]?.label ?? status}</span>;

interface FieldProps { label?: string; required?: boolean; help?: string; error?: string; icon?: string; id: string }
function Shell({ label, required, help, error, id, children }: FieldProps & { children: ReactNode }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>}
      {children}
      {(error || help) && <span className={`help${error ? ' error' : ''}`}>{error || help}</span>}
    </div>
  );
}
export function Input({ label, required, help, error, icon, id, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return <Shell {...{ label, required, help, error, id }}><div className={`control${error ? ' error' : ''}`}>{icon && <Icon name={icon} />}<input id={id} required={required} aria-invalid={!!error} {...rest} /></div></Shell>;
}
export function Select({ label, required, help, error, icon, id, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return <Shell {...{ label, required, help, error, id }}><div className={`control${error ? ' error' : ''}`}>{icon && <Icon name={icon} />}<select id={id} required={required} {...rest}>{children}</select><Icon name="down" /></div></Shell>;
}
export function Textarea({ label, required, help, error, id, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Shell {...{ label, required, help, error, id }}><div className={`control ta${error ? ' error' : ''}`}><textarea id={id} required={required} {...rest} /></div></Shell>;
}

export const Note = ({ tone = 'honey', icon = 'info', children }: { tone?: string; icon?: string; children: ReactNode }) => <div className={`note tone-${tone}`}><Icon name={icon} />{children}</div>;
export const ErrorBox = ({ error }: { error?: string | null }) => (error ? <div className="alert" role="alert"><Icon name="alert" />{error}</div> : null);

export function Photo({ src, tone = 0, className = '', alt = '', w }: { src?: string; tone?: number; className?: string; alt?: string; w?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`photo tone-${tone % 3} ${className}`} style={w ? { width: w, flex: 'none' } : undefined}>
      {src && !broken ? <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} /> : <span className="bubble" style={{ width: 44, height: 44, background: 'rgba(255,255,255,.75)' }}><Icon name="image" size={22} /></span>}
    </div>
  );
}
export function Gallery({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0);
  const list = urls.length ? urls : [''];
  return (
    <div className="card gallery" style={{ padding: 16 }}>
      <a href={list[i] || undefined} target="_blank" rel="noreferrer"><Photo src={list[i]} className="main" alt="รูปประกอบเรื่อง" /></a>
      {list.length > 1 && <div className="thumbs">{list.map((u, k) => <button key={u + k} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`รูปที่ ${k + 1}`}><Photo src={u} tone={k} /></button>)}</div>}
    </div>
  );
}

/** Pick 1–5 images (JPG/PNG/WebP, 5 MB each) with previews; validation mirrors the gateway's. */
export function PhotoPicker({ files, onChange, max = 5, compact }: { files: File[]; onChange: (f: File[]) => void; max?: number; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => { const u = files.map((f) => URL.createObjectURL(f)); setUrls(u); return () => u.forEach(URL.revokeObjectURL); }, [files]);
  const add = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErr(`${f.name}: รองรับเฉพาะ JPG, PNG หรือ WebP`); continue; }
      if (f.size > 5 * 1024 * 1024) { setErr(`${f.name}: ใหญ่เกิน 5 MB`); continue; }
      ok.push(f);
    }
    const next = [...files, ...ok];
    if (next.length > max) setErr(`แนบได้สูงสุด ${max} รูป`);
    else if (ok.length) setErr('');
    onChange(next.slice(0, max));
  };
  return (
    <div className="stack" style={{ ['--gap' as string]: '12px' }}>
      {files.length < max && (
        <div className={`dropzone${drag ? ' drag' : ''}`} style={compact ? { padding: 18 } : undefined} role="button" tabIndex={0}
          onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
          <span className="bubble" style={{ width: 48, height: 48, background: '#fff', color: 'var(--pink-700)' }}><Icon name="upload" size={22} /></span>
          <span className="strong" style={{ color: 'var(--pink-800)' }}>ลากรูปมาวางที่นี่ หรือ คลิกเพื่อเลือกไฟล์</span>
          <span className="xs muted">JPG / PNG / WebP · ไม่เกิน 5 MB ต่อรูป · สูงสุด {max} รูป</span>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      {files.length > 0 && (
        <div className="thumbs-row">
          {urls.map((u, i) => (
            <div key={u} className="photo" style={compact ? { width: 104 } : undefined}>
              <img src={u} alt={`รูปที่ ${i + 1}`} />
              <button type="button" className="x" aria-label="ลบรูป" onClick={() => onChange(files.filter((_, k) => k !== i))}><Icon name="x" size={14} /></button>
            </div>
          ))}
          <div className="stack" style={{ ['--gap' as string]: '2px' }}><span className="strong small">{files.length} / {max} รูป</span>{files.length < max && <span className="xs muted">เพิ่มได้อีก {max - files.length} รูป</span>}</div>
        </div>
      )}
      {err && <span className="help error">{err}</span>}
    </div>
  );
}

export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  return <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal aria-label={label}>{children}</div></div>;
}
export function Drawer({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  return <div className="scrim drawer-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="drawer" role="dialog" aria-modal aria-label={label}>{children}</aside></div>;
}

type ToastT = { id: number; text: string; tone: 'sage' | 'red' };
const ToastCtx = createContext<(text: string, tone?: 'sage' | 'red') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastT[]>([]);
  const push = useCallback((text: string, tone: 'sage' | 'red' = 'sage') => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">{list.map((t) => <div key={t.id} className="toast"><Bubble icon={t.tone === 'sage' ? 'check' : 'alert'} tone={t.tone} size={30} iconSize={16} />{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Timeline({ history, reporterLabel = 'ผู้แจ้ง' }: { history: HistoryEntry[]; reporterLabel?: string }) {
  const rows = [...history].reverse();
  if (!rows.length) return <p className="muted small">ยังไม่มีความเคลื่อนไหว</p>;
  return (
    <div className="timeline">
      {rows.map((h, i) => {
        const d = describe(h);
        const who = /^(Automatically assigned to |Automatic routing needs review: |Automatically closed after )/.test(h.note)
          ? 'ระบบอัตโนมัติ' : /^(Category changed to |Automatic routing requested by admin)/.test(h.note)
            ? 'ผู้ดูแลระบบ' : ['SUBMITTED', 'CANCELLED', 'CLOSED'].includes(h.toStatus) || d.quote && h.toStatus === 'IN_PROGRESS'
              ? reporterLabel : h.toStatus === 'ASSIGNED' || h.toStatus === 'REJECTED' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่';
        return (
          <div className="tl-item" key={`${h.changedAt}-${i}`}>
            <div className="tl-rail"><Bubble icon={d.icon} tone={d.tone} size={34} iconSize={16} /></div>
            <div className="tl-body">
              <div className="strong small">{d.title}</div>
              <div className="xs muted">{who} · {fmtShort(h.changedAt)}{d.detail && !d.quote ? ` · ${d.detail}` : ''}</div>
              {d.quote && d.detail && <div className="quote">“{d.detail}”</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function VSteps({ status }: { status: Status }) {
  const cur = stepIndex(status);
  if (cur < 0) return <Note tone={STATUS[status].tone} icon={status === 'REJECTED' ? 'x' : 'info'}>{STATUS[status].desc}</Note>;
  return <div className="vsteps">{STEPS.map((s, i) => <div key={s} className={`vstep${i < cur ? ' done' : i === cur ? ' now' : ''}`}><div className="dotcol"><span className="dot">{i < cur && <Icon name="check" size={14} />}</span><span className="rail" /></div><span className="lbl">{s}</span></div>)}</div>;
}
export function HSteps({ status }: { status: Status }) {
  const cur = stepIndex(status);
  if (cur < 0) return <Note tone={STATUS[status].tone}>{STATUS[status].desc}</Note>;
  return (
    <div className="hsteps">
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: 'contents' }}>
          <div className={`hstep${i < cur ? ' done' : i === cur ? ' now' : ''}`}><span className="dot">{i < cur ? <Icon name="check" /> : i + 1}</span>{s}</div>
          {i < STEPS.length - 1 && <span className={`hconn${i < cur ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  );
}

export const Empty = ({ icon = 'inbox', title, children }: { icon?: string; title: string; children?: ReactNode }) => (
  <div className="empty"><Bubble icon={icon} size={56} iconSize={26} /><div className="strong" style={{ color: 'var(--ink-900)' }}>{title}</div>{children}</div>
);
export const Skeleton = ({ h = 120 }: { h?: number }) => <div className="skeleton" style={{ height: h }} />;
export const Meta = ({ icon, children }: { icon: string; children: ReactNode }) => <span className="meta"><Icon name={icon} size={15} />{children}</span>;
export const Logo = ({ to = '/' }: { to?: string }) => <Link className="logo" to={to}><span className="mark"><Icon name="wrench" size={20} /></span><span><b>Fondue</b><small>ระบบแจ้งซ่อม จุฬาฯ</small></span></Link>;

/** Loads data once (and again when `deps` change); returns [data, error, reload]. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], poll?: (data: T) => boolean) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const pollRef = useRef(poll);
  const lastData = useRef<T>();
  pollRef.current = poll;
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState((s) => ({ ...s, loading: true }));
    fn().then((data) => {
      if (!live) return;
      lastData.current = data;
      setState({ data, loading: false });
      // Schedule only after the previous request finishes. Unmount and terminal states stop polling.
      if (pollRef.current?.(data)) timer = setTimeout(reload, 3000);
    }, (e: Error) => {
      if (!live) return;
      setState((s) => ({ ...s, error: e.message, loading: false }));
      // A brief outage must not leave an already-pending ticket permanently stuck in the browser.
      if (lastData.current !== undefined && pollRef.current?.(lastData.current)) timer = setTimeout(reload, 3000);
    });
    return () => { live = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload };
}
