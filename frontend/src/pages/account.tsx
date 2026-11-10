import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Api } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { PageHead } from '../components/layouts';
import { Button, ErrorBox, Icon, Input, Note, PasswordInput, useToast } from '../components/ui';
import { AuthFrame } from './public';

function PasswordFields({ password, confirm, setPassword, setConfirm }: {
  password: string; confirm: string; setPassword: (value: string) => void; setConfirm: (value: string) => void;
}) {
  return <>
    <PasswordInput id="new-password" label="รหัสผ่านใหม่" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} help="8–128 ตัวอักษร" />
    <PasswordInput id="confirm-password" label="ยืนยันรหัสผ่านใหม่" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} error={confirm && password !== confirm ? 'รหัสผ่านไม่ตรงกัน' : undefined} />
  </>;
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try { await Api.forgotPassword(email.trim()); setSent(true); }
    catch (x) { setError((x as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <AuthFrame title="รีเซ็ตรหัสผ่าน" sub="เราจะส่งลิงก์ไปที่อีเมลที่คุณลงทะเบียนไว้">
    <form className="stack" style={{ width: 'min(440px, 100%)', gap: 20 }} onSubmit={submit}>
      <div className="stack" style={{ ['--gap' as string]: '4px' }}><h1>ลืมรหัสผ่าน</h1><p className="muted small">กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p></div>
      {sent ? <Note tone="sage" icon="check">หากอีเมลนี้มีบัญชีอยู่ในระบบ คุณจะได้รับลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจโฟลเดอร์สแปมด้วย ลิงก์ใช้ได้ 30 นาที</Note> : <>
        <Input id="recovery-email" label="อีเมล" icon="mail" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <ErrorBox error={error} /><Button type="submit" icon="send" block busy={busy}>ส่งลิงก์</Button>
      </>}
      <Link to="/login" className="crumb" style={{ alignSelf: 'center' }}><Icon name="back" size={16} />กลับไปหน้าเข้าสู่ระบบ</Link>
    </form>
  </AuthFrame>;
}

export function ResetPassword() {
  const { clearSession } = useAuth();
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (submitting.current || password !== confirm) return;
    submitting.current = true; setBusy(true); setError('');
    try { await Api.resetPassword(token, password); clearSession(); setDone(true); }
    catch (x) { setError((x as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <AuthFrame title="ตั้งรหัสผ่านใหม่" sub="ลิงก์ตั้งรหัสผ่านใช้ได้เพียงครั้งเดียว">
    <form className="stack" style={{ width: 'min(440px, 100%)', gap: 20 }} onSubmit={submit}>
      <h1>ตั้งรหัสผ่านใหม่</h1>
      {done ? <><Note tone="sage" icon="check">ตั้งรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่</Note><Link to="/login" className="btn primary block">เข้าสู่ระบบ</Link></> : !/^[a-f0-9]{64}$/.test(token) ? <ErrorBox error="ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง กรุณาขอลิงก์ใหม่" /> : <>
        <PasswordFields {...{ password, confirm, setPassword, setConfirm }} />
        <ErrorBox error={error} /><Button type="submit" block busy={busy} disabled={!confirm || password !== confirm}>บันทึกรหัสผ่าน</Button>
      </>}
      {!done && <Link to="/forgot-password" className="center small">ขอลิงก์ตั้งรหัสผ่านใหม่</Link>}
    </form>
  </AuthFrame>;
}

export function Account() {
  const { session, clearSession } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (submitting.current || password !== confirm) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      await Api.changePassword(current, password);
      toast('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบอีกครั้ง');
      nav('/login', { replace: true });
      clearSession();
    }
    catch (x) { setError((x as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <div className="page" style={{ maxWidth: 720 }}>
    <Link className="crumb" to={homeFor(session?.role)}><Icon name="back" size={16} />กลับ</Link>
    <PageHead title="ตั้งค่าบัญชี" sub={session?.email} />
    <form className="card lg stack" style={{ gap: 20 }} onSubmit={submit}>
      <h2>เปลี่ยนรหัสผ่าน</h2><Note>หลังเปลี่ยนรหัสผ่าน ทุกอุปกรณ์ต้องเข้าสู่ระบบใหม่</Note>
      <PasswordInput id="current-password" label="รหัสผ่านปัจจุบัน" autoComplete="current-password" required maxLength={128} value={current} onChange={e => setCurrent(e.target.value)} />
      <PasswordFields {...{ password, confirm, setPassword, setConfirm }} />
      <ErrorBox error={error} /><Button type="submit" busy={busy} disabled={!confirm || password !== confirm}>เปลี่ยนรหัสผ่าน</Button>
    </form>
  </div>;
}
