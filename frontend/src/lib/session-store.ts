const TOKEN_KEY = 'fondue.token';
const SHARED_KEY = 'fondue.session';
const TAB_KEY = 'fondue.tabSession';

type TabSession = { id: string; token: string | null; shared: boolean; notice: 'replaced' | null };
export type SessionSnapshot = Pick<TabSession, 'id' | 'token'>;
const listeners = new Set<() => void>();

function readShared(): SessionSnapshot | null | undefined {
  try {
    const raw = localStorage.getItem(SHARED_KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (typeof value.id === 'string' && value.token === null) return null;
      if (typeof value.id === 'string' && typeof value.token === 'string') return value;
    }
    // Existing browser sessions can migrate without an extra login.
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { id: 'legacy', token } : null;
  } catch { return undefined; }
}

function initialSession(): TabSession {
  try {
    const raw = sessionStorage.getItem(TAB_KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (typeof value.id === 'string' && (value.token === null || typeof value.token === 'string') && typeof value.shared === 'boolean') {
        return { id: value.id, token: value.token, shared: value.shared, notice: value.notice === 'replaced' ? 'replaced' : null };
      }
    }
  } catch { /* Storage may be disabled; retain the session in memory. */ }
  const shared = readShared();
  return { id: shared?.id ?? crypto.randomUUID(), token: shared?.token ?? null, shared: !!shared, notice: null };
}

let current = initialSession();
function persist() {
  try { sessionStorage.setItem(TAB_KEY, JSON.stringify(current)); } catch { /* In-memory fallback. */ }
}
persist();
function notify() { listeners.forEach(listener => listener()); }

function reconcile() {
  if (!current.token || !current.shared) return;
  const shared = readShared();
  if (shared === undefined || (shared?.id === current.id && shared.token === current.token)) return;
  current = { id: crypto.randomUUID(), token: null, shared: false, notice: shared ? 'replaced' : null };
  persist();
  notify();
}

export const tokenStore = {
  get() { reconcile(); return current.token; },
  snapshot(): SessionSnapshot { reconcile(); return { id: current.id, token: current.token }; },
  isCurrent(snapshot: SessionSnapshot) { reconcile(); return current.id === snapshot.id && current.token === snapshot.token; },
  notice() { reconcile(); return current.notice; },
  set(token: string | null, publish = true) {
    reconcile();
    if (token) {
      current = { id: crypto.randomUUID(), token, shared: publish, notice: null };
      if (publish) {
        try {
          // A fresh ID changes on every successful login, even if the JWT is identical.
          localStorage.setItem(SHARED_KEY, JSON.stringify({ id: current.id, token }));
          try { localStorage.setItem(TOKEN_KEY, token); } catch { /* The shared envelope remains authoritative. */ }
        } catch { current.shared = false; }
      }
    } else {
      const shared = readShared();
      // An old tab must never delete or revoke the winning tab's session.
      if (current.shared && shared?.id === current.id && shared.token === current.token) {
        try {
          localStorage.setItem(SHARED_KEY, JSON.stringify({ id: crypto.randomUUID(), token: null }));
          localStorage.removeItem(TOKEN_KEY);
        } catch { /* Storage blocked. */ }
      }
      current = { id: crypto.randomUUID(), token: null, shared: false, notice: current.notice };
    }
    persist();
    notify();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === SHARED_KEY || event.key === TOKEN_KEY) reconcile();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    reconcile();
    listener();
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  },
};
