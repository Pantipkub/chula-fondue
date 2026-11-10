import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
});
const store = async () => (await import('../../frontend/src/lib/session-store')).tokenStore;

it('a new login replaces the old tab without allowing it to delete the winning session', async () => {
  const first = await store();
  first.set('first-token');
  const old = first.snapshot();
  sessionStorage.clear();
  vi.resetModules();
  const second = await store();
  second.set('second-token');
  expect(first.get()).toBeNull();
  expect(first.notice()).toBe('replaced');
  expect(first.isCurrent(old)).toBe(false);
  first.set(null);
  expect(second.get()).toBe('second-token');
  expect(JSON.parse(localStorage.getItem('fondue.session')!).token).toBe('second-token');
});

it('a guest session stays private to its tab and survives reconciliation', async () => {
  const first = await store();
  first.set('guest-token', false);
  localStorage.setItem('fondue.session', JSON.stringify({ id: 'another-tab', token: 'reporter-token' }));
  expect(first.get()).toBe('guest-token');
  expect(first.notice()).toBeNull();
  first.set(null);
  expect(JSON.parse(localStorage.getItem('fondue.session')!).token).toBe('reporter-token');
});

it('logging out of the owning tab publishes logout and removes the legacy token', async () => {
  const current = await store();
  current.set('signed-in');
  const snapshot = current.snapshot();
  current.set(null);
  expect(current.get()).toBeNull();
  expect(current.isCurrent(snapshot)).toBe(false);
  expect(JSON.parse(localStorage.getItem('fondue.session')!).token).toBeNull();
  expect(localStorage.getItem('fondue.token')).toBeNull();
});

it('identical JWTs from two successful logins still have distinct session IDs', async () => {
  const current = await store();
  current.set('same-token');
  const first = current.snapshot();
  current.set('same-token');
  expect(current.isCurrent(first)).toBe(false);
});

it('restores a tab session and migrates a legacy token', async () => {
  localStorage.setItem('fondue.token', 'legacy-token');
  const current = await store();
  expect(current.get()).toBe('legacy-token');
  current.set('restored-token', false);
  vi.resetModules();
  expect((await store()).get()).toBe('restored-token');
});

it('retains an in-memory session if browser storage is blocked', async () => {
  const current = await store();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  current.set('memory-token');
  expect(current.get()).toBe('memory-token');
  current.set(null);
  expect(current.get()).toBeNull();
});

it('notifies subscribers and stops notifying after cleanup', async () => {
  const current = await store();
  current.set('first');
  const listener = vi.fn();
  const unsubscribe = current.subscribe(listener);
  expect(listener).toHaveBeenCalledTimes(1);
  localStorage.setItem('fondue.session', JSON.stringify({ id: 'new-tab', token: 'new-token' }));
  window.dispatchEvent(new StorageEvent('storage', { key: 'fondue.session' }));
  expect(current.get()).toBeNull();
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  current.set('local');
  expect(listener).toHaveBeenCalledTimes(2);
});

it('invalid storage data falls back to a signed-out session', async () => {
  localStorage.setItem('fondue.session', '{');
  sessionStorage.setItem('fondue.tabSession', '{');
  expect((await store()).get()).toBeNull();
});
