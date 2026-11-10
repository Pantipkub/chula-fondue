import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Api, setUnauthorizedHandler, tokenStore } from './api';
import type { Role } from './api';

export interface Session { token: string; role: Role; email: string; departmentId: string; exp: number }

// The gateway checks the token; the browser only reads its claims to choose menus and routes.
export function decode(token: string | null): Session | null {
  if (!token) { return null; }
  try {
    const part = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const bytes = Uint8Array.from(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')), c => c.codePointAt(0) ?? 0);
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const c = JSON.parse(json) as { role: Role; email: string; departmentId: string; exp: number };
    if (c.exp && c.exp * 1000 < Date.now()) { return null; }
    return { token, role: c.role, email: c.email ?? '', departmentId: c.departmentId ?? '', exp: c.exp };
  } catch {
    return null;
  }
}

interface AuthCtx {
  session: Session | null;
  sessionNotice: 'replaced' | null;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  clearSession: () => void;
  /** Returns the current token, or asks the gateway for a guest token when nobody is signed in. */
  ensureToken: () => Promise<Session>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [session, setSession] = useState<Session | null>(() => decode(tokenStore.get()));
  const [sessionNotice, setSessionNotice] = useState(() => tokenStore.notice());
  const save = useCallback((token: string | null, publish = true) => {
    tokenStore.set(token, publish);
    const s = decode(tokenStore.get());
    setSession(s);
    setSessionNotice(tokenStore.notice());
    return s;
  }, []);
  const logout = useCallback(async () => {
    const snapshot = tokenStore.snapshot();
    const role = decode(snapshot.token)?.role;
    try { if (role && role !== 'GUEST') { await Api.logout(); } }
    catch { /* Local sign-out remains available while the service is offline. */ }
    finally { if (tokenStore.isCurrent(snapshot)) { save(null); } }
  }, [save]);
  useEffect(() => {
    setUnauthorizedHandler(() => save(null));
    const token = tokenStore.get();
    if (token && !decode(token)) { tokenStore.set(null); }
    const unsubscribe = tokenStore.subscribe(() => {
      setSession(decode(tokenStore.get()));
      setSessionNotice(tokenStore.notice());
    });
    return () => { unsubscribe(); setUnauthorizedHandler(() => {}); };
  }, [save]);

  const value = useMemo<AuthCtx>(() => ({
    session,
    sessionNotice,
    logout,
    clearSession: () => { save(null); },
    login: async (email, password) => save((await Api.login(email, password)).accessToken)!,
    ensureToken: async () => {
      const existing = decode(tokenStore.get());
      if (existing) { return existing; }
      const snapshot = tokenStore.snapshot();
      const guest = await Api.guest();
      const latest = decode(tokenStore.get());
      if (latest) { return latest; }
      if (!tokenStore.isCurrent(snapshot)) { throw new Error('สถานะการเข้าสู่ระบบเปลี่ยนไป กรุณาลองใหม่'); }
      // Guest access in an old tab must not replace a signed-in account in another tab.
      return save(guest.accessToken, false)!;
    },
  }), [session, sessionNotice, logout, save]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) { throw new Error('useAuth outside AuthProvider'); }
  return c;
}

export const homeFor = (role?: Role) => ({ ADMIN: '/admin', STAFF: '/staff', REPORTER: '/my', GUEST: '/' })[role ?? 'GUEST'] ?? '/';
