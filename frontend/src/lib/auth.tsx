import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Api, setUnauthorizedHandler, tokenStore } from './api';
import type { Role } from './api';

export interface Session { token: string; role: Role; email: string; departmentId: string; exp: number }

// The gateway checks the token; the browser only reads its claims to choose menus and routes.
function decode(token: string | null): Session | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))));
    const c = JSON.parse(json) as { role: Role; email: string; departmentId: string; exp: number };
    if (c.exp && c.exp * 1000 < Date.now()) return null;
    return { token, role: c.role, email: c.email ?? '', departmentId: c.departmentId ?? '', exp: c.exp };
  } catch {
    return null;
  }
}

interface AuthCtx {
  session: Session | null;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => void;
  /** Returns the current token, or asks the gateway for a guest token when nobody is signed in. */
  ensureToken: () => Promise<Session>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => decode(tokenStore.get()));
  const save = useCallback((token: string | null) => {
    tokenStore.set(token);
    const s = decode(token);
    setSession(s);
    return s;
  }, []);
  const logout = useCallback(() => { save(null); }, [save]);
  useEffect(() => { setUnauthorizedHandler(() => save(null)); }, [save]);
  useEffect(() => { if (!decode(tokenStore.get())) tokenStore.set(null); }, []);

  const value = useMemo<AuthCtx>(() => ({
    session,
    logout,
    login: async (email, password) => save((await Api.login(email, password)).accessToken)!,
    ensureToken: async () => session ?? save((await Api.guest()).accessToken)!,
  }), [session, logout, save]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

export const homeFor = (role?: Role) => (role === 'ADMIN' ? '/admin' : role === 'STAFF' ? '/staff' : role === 'REPORTER' ? '/my' : '/');
