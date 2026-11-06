import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { Button, Icon, Logo } from './ui';

const initials = (email: string) => (email ? email.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) : '?');

function useMobileMenu() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return { open, setOpen, toggle };
}

/** Top navigation for visitors, guests and reporters. */
export function TopNav() {
  const { session, logout } = useAuth();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const mobile = useMobileMenu();
  const role = session?.role;
  const links = role === 'REPORTER'
    ? [['/report', 'แจ้งปัญหา'], ['/my', 'เรื่องของฉัน'], ['/notifications', 'การแจ้งเตือน'], ['/track', 'ติดตามสถานะ']]
    : [['/', 'หน้าแรก'], ['/report', 'แจ้งปัญหา'], ['/track', 'ติดตามสถานะ']];
  return (
    <header className={`topnav${mobile.open ? ' menu-open' : ''}`}>
      <Logo to={role === 'REPORTER' ? '/my' : '/'} />
      <nav id="public-navigation" className="navlinks" aria-label="เมนูหลัก">
        {links.map(([to, label]) => <NavLink key={to} to={to} end onClick={() => mobile.setOpen(false)} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>{label}</NavLink>)}
        {(role === 'ADMIN' || role === 'STAFF') && <NavLink to={homeFor(role)} onClick={() => mobile.setOpen(false)} className="navlink">ไปหน้าเจ้าหน้าที่</NavLink>}
      </nav>
      <div className="row nav-actions" style={{ ['--gap' as string]: '10px' }}>
        {!session || role === 'GUEST' ? (
          <>
            {role === 'GUEST' && <span className="rolechip tone-honey guest-chip"><Icon name="user" size={14} />ผู้เยี่ยมชม</span>}
            <Button kind="outline" sm onClick={() => nav('/login')}>เข้าสู่ระบบ</Button>
            {!session && <Button className="nav-report" sm icon="plus" onClick={() => nav('/report')}>แจ้งปัญหา</Button>}
          </>
        ) : (
          <div style={{ position: 'relative' }}>
            <button className="userpill" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label={`บัญชี ${session.email}`}>
              <span className="avatar">{initials(session.email)}</span>
              <span className="who" style={{ textAlign: 'left' }}><span className="strong small" style={{ display: 'block' }}>{session.email}</span><span className="xs muted">{role === 'REPORTER' ? 'ผู้แจ้ง · Reporter' : role}</span></span>
              <Icon name="down" size={16} />
            </button>
            {menu && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 50, padding: 8, minWidth: 200, zIndex: 30 }}>
                <button className="btn ghost block" style={{ justifyContent: 'flex-start' }} onClick={() => { logout(); nav('/'); }}><Icon name="logout" />ออกจากระบบ</button>
              </div>
            )}
          </div>
        )}
        <button ref={mobile.toggle} className="icon-btn mobile-toggle" type="button" aria-label={mobile.open ? 'ปิดเมนูหลัก' : 'เปิดเมนูหลัก'} aria-expanded={mobile.open} aria-controls="public-navigation" onClick={() => mobile.setOpen((open) => !open)}><Icon name={mobile.open ? 'x' : 'menu'} size={22} /></button>
      </div>
    </header>
  );
}

export function PublicLayout() {
  return <><TopNav /><Outlet /></>;
}

/** Sends people who are not signed in with one of `roles` to the login page. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session } = useAuth();
  const loc = useLocation();
  if (!session || session.role === 'GUEST') return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!roles.includes(session.role)) return <Navigate to={homeFor(session.role)} replace />;
  return <>{children}</>;
}

const MENUS: Record<'ADMIN' | 'STAFF', [string, string, string][]> = {
  ADMIN: [['/admin', 'inbox', 'กล่องเรื่องเข้า'], ['/admin/departments', 'building', 'หน่วยงาน'], ['/admin/users', 'users', 'บัญชีเจ้าหน้าที่'], ['/admin/analytics', 'chart', 'รายงานวิเคราะห์']],
  STAFF: [['/staff', 'inbox', 'คิวงานของหน่วยงาน']],
};

/** Sidebar layout for Admin and Staff. `counts` adds a small number next to a menu item. */
export function AppShell({ role, counts = {}, search }: { role: 'ADMIN' | 'STAFF'; counts?: Record<string, number>; search?: ReactNode }) {
  const { session, logout } = useAuth();
  const nav = useNavigate();
  const mobile = useMobileMenu();
  return (
    <div className="shell">
      <aside className={`sidebar${mobile.open ? ' menu-open' : ''}`}>
        <div className="sidebar-heading">
          <Logo to={role === 'ADMIN' ? '/admin' : '/staff'} />
          <button ref={mobile.toggle} className="icon-btn mobile-toggle" type="button" aria-label={mobile.open ? 'ปิดเมนูเจ้าหน้าที่' : 'เปิดเมนูเจ้าหน้าที่'} aria-expanded={mobile.open} aria-controls="workspace-navigation" onClick={() => mobile.setOpen((open) => !open)}><Icon name={mobile.open ? 'x' : 'menu'} size={22} /></button>
        </div>
        <nav id="workspace-navigation" className="stack navgroup" aria-label="เมนูเจ้าหน้าที่" style={{ ['--gap' as string]: '6px' }}>
          <div className="sec">{role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่หน่วยงาน'}</div>
          {MENUS[role].map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/admin' || to === '/staff'} onClick={() => mobile.setOpen(false)} className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}>
              <Icon name={icon} size={20} />{label}{counts[to] ? <span className="count">{counts[to]}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="usercard">
          <span className="avatar" style={{ width: 36, height: 36 }}>{initials(session?.email ?? '')}</span>
          <div className="grow who"><div className="strong small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.email}</div><div className="xs muted">{role === 'ADMIN' ? 'Admin' : 'Staff'}</div></div>
          <button className="icon-btn" aria-label="ออกจากระบบ" onClick={() => { logout(); nav('/login'); }}><Icon name="logout" /></button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="search">{search}</div>
          <div className="row topbar-links">
            <Link to="/notifications" className="small">การแจ้งเตือน</Link><Link to="/" className="small">ดูหน้าเว็บผู้แจ้ง</Link>
            <span className={`rolechip ${role === 'ADMIN' ? 'tone-pink' : 'tone-lilac'}`}><Icon name={role === 'ADMIN' ? 'shield' : 'wrench'} size={14} />{role === 'ADMIN' ? 'Admin' : 'Staff'}</span>
          </div>
        </div>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}

export const PageHead = ({ title, sub, eyebrow, children }: { title: string; sub?: string; eyebrow?: string; children?: ReactNode }) => (
  <div className="pagehead">
    <div className="stack" style={{ ['--gap' as string]: '4px' }}>
      {eyebrow && <span className="small strong" style={{ color: 'var(--pink-700)' }}>{eyebrow}</span>}
      <h1>{title}</h1>
      {sub && <p className="muted small">{sub}</p>}
    </div>
    {children && <div className="actions">{children}</div>}
  </div>
);
export const Crumb = ({ to, label, current }: { to: string; label: string; current: string }) => (
  <div className="row wrap small" style={{ ['--gap' as string]: '8px' }}><Link to={to} className="crumb"><Icon name="back" size={16} />{label}</Link><span style={{ color: 'var(--ink-400)' }}>/</span><span className="muted strong">{current}</span></div>
);
