import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DEPARTMENT_ID, field, fixture, json, selectOption } from './app-fixture';

let app: ReturnType<typeof fixture>;
afterEach(() => expect(app.unexpected).toEqual([]));

it('displays reports and sends all selected filters to the API', async () => {
  app = fixture();
  const { user } = app.open('/admin/analytics', 'ADMIN');
  expect(await screen.findAllByText('2.0 ชั่วโมง')).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'จำนวนแจ้งซ่อมรายวัน' })).toBeTruthy();
  fireEvent.change(field('ตั้งแต่วันที่'), { target: { value: '2026-11-01' } });
  fireEvent.change(field('ถึงวันที่'), { target: { value: '2026-11-10' } });
  await selectOption(user, screen.getByRole('combobox', { name: 'หน่วยงาน' }), 'Facilities');
  await selectOption(user, screen.getByRole('combobox', { name: 'หมวดหมู่' }), 'ไฟฟ้า');
  await waitFor(() => expect(app.requests.filter(request => request.path === '/analytics').at(-1)?.url.searchParams.get('category')).toBe('Electrical'));
  const params = app.requests.filter(request => request.path === '/analytics').at(-1)!.url.searchParams;
  expect(Object.fromEntries(params)).toEqual({ from: '2026-11-01', to: '2026-11-10', departmentId: DEPARTMENT_ID, category: 'Electrical' });
});

it.each([null, 48])('handles missing and multi-day MTTR (%s) without changing the reported totals', async mttrHours => {
  app = fixture();
  app.on('GET', '/analytics', () => json({ total: 0, resolvedCount: 0, mttrHours, closedRate: 0, generatedAt: '2026-11-10T00:00:00Z', byDepartment: [], byCategory: [], byStatus: [], daily: [], hotspots: [] }));
  app.open('/admin/analytics', 'ADMIN');
  await screen.findByText('ไม่มีข้อมูลในช่วงที่เลือก');
  expect(screen.getByText(mttrHours === null ? '—' : '2.0 วัน')).toBeTruthy();
});

it('shows an analytics outage and reloads the report after recovery', async () => {
  app = fixture();
  let fail = true;
  app.on('GET', '/analytics', () => fail ? json({ message: 'Unavailable' }, 503) : json({ total: 0, resolvedCount: 0, mttrHours: null, closedRate: 0, generatedAt: '2026-11-10T00:00:00Z' }));
  const { user } = app.open('/admin/analytics', 'ADMIN');
  expect((await screen.findByRole('alert')).textContent).toBe('ระบบบางส่วนไม่พร้อมใช้งานชั่วคราว ลองอีกครั้งในอีกสักครู่');
  fail = false;
  await user.click(screen.getByRole('button', { name: 'รีเฟรช' }));
  expect(await screen.findByText('ไม่มีข้อมูลในช่วงที่เลือก')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
