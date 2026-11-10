import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Api } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { PageHead } from '../components/layouts';
import { Button, ErrorBox, Input, Note, useToast } from '../components/ui';
import { AuthFrame } from './public';

function PasswordFields({ password, confirm, setPassword, setConfirm }: {
  password: string; confirm: string; setPassword: (value: string) => void; setConfirm: (value: string) => void;
}) {
  return <>
    <Input id="new-password" label="รหัสผ่านใหม่" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} help="8–128 ตัวอักษร" />
    <Input id="confirm-password" label="ยืนยันรหัสผ่านใหม่" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} error={confirm && password !== confirm ? 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' : undefined} />
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
  return <AuthFrame title={'กลับมาติดตาม\nเรื่องของคุณ'} sub="ตั้งรหัสผ่านใหม่ผ่านอีเมลที่ลงทะเบียนไว้">
    <form className="stack" style={{ width: 'min(440px, 100%)', gap: 20 }} onSubmit={submit}>
      <h1>ลืมรหัสผ่าน</h1>
      {sent ? <Note tone="sage" icon="check">หากอีเมลนี้มีบัญชีที่ใช้งานอยู่ ระบบจะส่งลิงก์ตั้งรหัสผ่านให้ กรุณาตรวจกล่องจดหมายและโฟลเดอร์สแปม ลิงก์หมดอายุใน 30 นาที</Note> : <>
        <Input id="recovery-email" label="อีเมลที่ลงทะเบียน" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <ErrorBox error={error} /><Button type="submit" block busy={busy}>ขอลิงก์ตั้งรหัสผ่าน</Button>
      </>}
      <Link to="/login" className="center small">กลับไปเข้าสู่ระบบ</Link>
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
  return <AuthFrame title={'รหัสผ่านใหม่\nติดตามต่อได้ทันที'} sub="ลิงก์ตั้งรหัสผ่านใช้ได้เพียงครั้งเดียว">
    <form className="stack" style={{ width: 'min(440px, 100%)', gap: 20 }} onSubmit={submit}>
      <h1>ตั้งรหัสผ่านใหม่</h1>
      {done ? <><Note tone="sage" icon="check">ตั้งรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่</Note><Link to="/login" className="btn primary block">เข้าสู่ระบบ</Link></> : !/^[a-f0-9]{64}$/.test(token) ? <ErrorBox error="ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง กรุณาขอลิงก์ใหม่" /> : <>
        <PasswordFields {...{ password, confirm, setPassword, setConfirm }} />
        <ErrorBox error={error} /><Button type="submit" block busy={busy} disabled={!confirm || password !== confirm}>บันทึกรหัสผ่านใหม่</Button>
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
    <Link className="crumb" to={homeFor(session?.role)}>กลับหน้าหลักของฉัน</Link>
    <PageHead title="ตั้งค่าบัญชี" sub={session?.email} />
    <form className="card lg stack" style={{ gap: 20 }} onSubmit={submit}>
      <h2>เปลี่ยนรหัสผ่าน</h2><Note>หลังเปลี่ยนรหัสผ่าน จะออกจากระบบทุกอุปกรณ์ และต้องเข้าสู่ระบบใหม่</Note>
      <Input id="current-password" label="รหัสผ่านปัจจุบัน" type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={e => setCurrent(e.target.value)} />
      <PasswordFields {...{ password, confirm, setPassword, setConfirm }} />
      <ErrorBox error={error} /><Button type="submit" busy={busy} disabled={!confirm || password !== confirm}>เปลี่ยนรหัสผ่าน</Button>
    </form>
  </div>;
}
