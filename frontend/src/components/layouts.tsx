import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { Button, Icon, IconButton, Logo } from './ui';

const initials = (email: string) => (email ? email.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) : '?');
const ROLE_LABEL: Record<string, string> = { REPORTER: 'ผู้แจ้ง', STAFF: 'เจ้าหน้าที่', ADMIN: 'ผู้ดูแลระบบ', GUEST: 'ผู้เยี่ยมชม' };

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
    ? [['/report', 'แจ้งซ่อม'], ['/my', 'รายการแจ้งซ่อม'], ['/track', 'ติดตามสถานะ']]
    : [['/', 'หน้าแรก'], ['/report', 'แจ้งซ่อม'], ['/track', 'ติดตามสถานะ']];
  return (
    <header className={`topnav${mobile.open ? ' menu-open' : ''}`}>
      <Logo to={role === 'REPORTER' ? '/my' : '/'} />
      <nav id="public-navigation" className="navlinks" aria-label="เมนูหลัก">
        {links.map(([to, label]) => <NavLink key={to} to={to} end onClick={() => mobile.setOpen(false)} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>{label}</NavLink>)}
        {(role === 'ADMIN' || role === 'STAFF') && <NavLink to={homeFor(role)} onClick={() => mobile.setOpen(false)} className="navlink">หน้าเจ้าหน้าที่</NavLink>}
      </nav>
      <div className="row nav-actions" style={{ ['--gap' as string]: '8px' }}>
        {!session || role === 'GUEST' ? (
          <>
            {role === 'GUEST' && <span className="rolechip tone-honey guest-chip"><Icon name="user" size={14} />ผู้เยี่ยมชม</span>}
            <Button kind="outline" sm onClick={() => nav('/login')}>เข้าสู่ระบบ</Button>
            {!session && <Button className="nav-report" sm icon="plus" onClick={() => nav('/report')}>แจ้งซ่อม</Button>}
          </>
        ) : (
          <>
            <NavLink to="/notifications" className={({ isActive }) => `icon-btn ghost${isActive ? ' active' : ''}`} aria-label="การแจ้งเตือน" title="การแจ้งเตือน"><Icon name="bell" /></NavLink>
            <div style={{ position: 'relative' }}>
              <button className="userpill" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label={`บัญชี ${session.email}`}>
                <span className="avatar">{initials(session.email)}</span>
                <span className="who" style={{ textAlign: 'left' }}><span className="strong small" style={{ display: 'block' }}>{session.email}</span><span className="xs muted">{ROLE_LABEL[role ?? ''] ?? role}</span></span>
                <Icon name="down" size={16} />
              </button>
              {menu && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 50, padding: 8, minWidth: 200, zIndex: 30 }}>
                  <Link to="/account" className="btn ghost block" style={{ justifyContent: 'flex-start' }} onClick={() => setMenu(false)}><Icon name="settings" />ตั้งค่าบัญชี</Link>
                  <button className="btn ghost block" style={{ justifyContent: 'flex-start' }} onClick={async () => { await logout(); nav('/'); }}><Icon name="logout" />ออกจากระบบ</button>
                </div>
              )}
            </div>
          </>
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
  ADMIN: [['/admin', 'inbox', 'งานแจ้งซ่อม'], ['/admin/departments', 'building', 'หน่วยงาน'], ['/admin/users', 'users', 'บัญชีผู้ใช้'], ['/admin/analytics', 'chart', 'รายงาน']],
  STAFF: [['/staff', 'inbox', 'คิวงานซ่อม']],
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
          <div className="grow who"><div className="strong small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{session?.email}</div><div className="xs muted">{ROLE_LABEL[role]}</div></div>
          <IconButton icon="logout" label="ออกจากระบบ" onClick={async () => { await logout(); nav('/login'); }} />
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="search">{search}</div>
          <div className="row topbar-links">
            <Link to="/" className="icon-btn ghost" aria-label="หน้าแจ้งซ่อม" title="หน้าแจ้งซ่อม"><Icon name="external" /></Link>
            <Link to="/notifications" className="icon-btn ghost" aria-label="การแจ้งเตือน" title="การแจ้งเตือน"><Icon name="bell" /></Link>
            <Link to="/account" className="icon-btn ghost" aria-label="ตั้งค่าบัญชี" title="ตั้งค่าบัญชี"><Icon name="settings" /></Link>
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
  <div className="row wrap small" style={{ ['--gap' as string]: '8px' }}><Link to={to} className="crumb"><Icon name="back" size={16} />{label}</Link><span style={{ color: 'var(--ink-400)' }}>/</span><span className="muted tid">{current}</span></div>
);
