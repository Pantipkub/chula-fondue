import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { App } from '../../frontend/src/App';
import { tokenStore } from '../../frontend/src/lib/api';
import type { Department, PublicUser, Role, Ticket } from '../../frontend/src/lib/api';

export const TICKET_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
export const DEPARTMENT_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return { id: TICKET_ID, status: 'SUBMITTED', category: 'Electrical', description: 'ไฟทางเดินเสีย', location: 'Library ชั้น 2',
    photoUrls: ['https://images.example/before.png'], completionPhotoUrls: [], reporterEmail: 'reporter@example.test',
    departmentId: '', departmentName: '', reason: '', createdAt: '2026-11-10T01:00:00Z', updatedAt: '2026-11-10T02:00:00Z', ...overrides };
}
export function jwt(role: Role) {
  const claims = { role, email: 'reporter@example.test', departmentId: DEPARTMENT_ID, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `test.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
}
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
export const field = (label: string) => screen.getByLabelText(label, { normalizer: text => text.replace(/\s*\*$/, '').trim() });
type Request = { path: string; method: string; body: Record<string, unknown>; init: RequestInit; url: URL };
type Handler = (request: Request) => Response | Promise<Response>;

export function fixture() {
  const handlers = new Map<string, Handler>();
  const requests: Request[] = [];
  const unexpected: string[] = [];
  const state = {
    tickets: [makeTicket()],
    departments: [{ id: DEPARTMENT_ID, name: 'Facilities', contactEmail: 'team@example.test', buildings: ['Library'], active: true }] as Department[],
    users: [{ id: 'staff-id', email: 'staff@example.test', role: 'STAFF', departmentId: DEPARTMENT_ID, active: true }] as PublicUser[],
    rules: [] as { id: string; category: string; departmentId: string; enabled: boolean }[],
    notifications: [] as { eventId: string; ticketId: string; status: string; recipientEmail: string; receivedAt: string; read: boolean; delivery: string; recipientDepartmentId?: string }[],
  };
  const fetch = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
    const request = { path, method, body, init, url };
    requests.push(request);
    const handler = handlers.get(`${method} ${path}`);
    if (handler) return handler(request);
    if (method === 'GET') {
      if (path === '/tickets') {
        const status = url.searchParams.get('status');
        return json({ tickets: state.tickets.filter(ticket => !status || ticket.status === status) });
      }
      if (path.endsWith('/history')) {
        const ticket = state.tickets.find(ticket => path === `/tickets/${ticket.id}/history`);
        return ticket ? json({ ticket, history: [] }) : json({ message: 'Not found' }, 404);
      }
      if (path === '/departments') return json(state.departments);
      if (path === '/auth/users') return json(state.users);
      if (path === '/routing-rules') return json(state.rules);
      if (path === '/notifications') return json(state.notifications);
      if (path === '/analytics') return json({ total: 1, resolvedCount: 1, mttrHours: 2, closedRate: 100, generatedAt: '2026-11-10T00:00:00Z',
        byStatus: [], byCategory: [{ name: 'Electrical', count: 1 }], hotspots: [{ name: 'Library', count: 1 }],
        byDepartment: [{ id: DEPARTMENT_ID, name: 'Facilities', count: 1, mttrHours: 2 }], daily: [{ date: '2026-11-10', count: 1 }] });
    }
    unexpected.push(`${method} ${path}`);
    return json({ message: `Unexpected fixture request: ${method} ${path}` }, 500);
  });
  return {
    state, requests, unexpected, fetch,
    on(method: string, path: string, handler: Handler) { handlers.set(`${method} ${path}`, handler); },
    open(path: string, role?: Role) {
      localStorage.clear();
      sessionStorage.clear();
      tokenStore.set(null);
      if (role) tokenStore.set(jwt(role), false);
      window.history.replaceState({}, '', path);
      vi.stubGlobal('fetch', fetch);
      return { ...render(<App />), user: userEvent.setup() };
    },
  };
}

export async function selectOption(user: ReturnType<typeof userEvent.setup>, control: HTMLElement, name: string) {
  // Radix opens on pointer down; wait for the selected value before the next input event.
  await user.click(control);
  const { screen, waitFor } = await import('@testing-library/react');
  await user.click(await screen.findByRole('option', { name, exact: true }));
  await waitFor(() => { if (!control.textContent?.includes(name)) throw new Error('Selection has not committed'); });
}
