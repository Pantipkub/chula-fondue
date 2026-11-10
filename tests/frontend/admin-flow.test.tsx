import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DEPARTMENT_ID, field, fixture, json, makeTicket, selectOption, TICKET_ID } from './app-fixture';

let app: ReturnType<typeof fixture>;
afterEach(() => expect(app.unexpected).toEqual([]));

it('creates a department with normalized fields and a removable building list', async () => {
  app = fixture();
  app.on('POST', '/departments', request => {
    app.state.departments.push({ id: 'new-department', active: true, ...request.body } as typeof app.state.departments[number]);
    return json(app.state.departments.at(-1));
  });
  const { user } = app.open('/admin/departments', 'ADMIN');
  await screen.findByRole('heading', { name: 'Facilities' });
  await user.click(screen.getByRole('button', { name: 'เพิ่มหน่วยงาน', exact: true }));
  await user.type(field('ชื่อหน่วยงาน'), ' IT ');
  await user.type(field('อีเมลติดต่อ'), 'it@example.test');
  await user.type(field('เพิ่มอาคาร'), 'Temporary{Enter}');
  await user.click(screen.getByRole('button', { name: 'ลบ Temporary' }));
  await user.type(field('เพิ่มอาคาร'), 'Lab{Enter}');
  await user.click(screen.getByRole('button', { name: 'บันทึก', exact: true }));
  await screen.findByRole('heading', { name: 'IT', exact: true });
  expect(app.requests.find(request => request.method === 'POST')?.body).toEqual({ name: 'IT', contactEmail: 'it@example.test', buildings: ['Lab'] });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('preserves department edits on an outage and saves them on retry', async () => {
  app = fixture();
  let fail = true;
  app.on('PUT', `/departments/${DEPARTMENT_ID}`, request => {
    if (fail) return json({ message: 'Unavailable' }, 503);
    Object.assign(app.state.departments[0], request.body);
    return json(app.state.departments[0]);
  });
  const { user } = app.open('/admin/departments', 'ADMIN');
  await user.click(await screen.findByRole('button', { name: 'แก้ไข Facilities' }));
  await user.clear(field('ชื่อหน่วยงาน'));
  await user.type(field('ชื่อหน่วยงาน'), 'Facilities updated');
  await user.click(screen.getByRole('button', { name: 'บันทึก', exact: true }));
  await screen.findByRole('alert');
  expect((field('ชื่อหน่วยงาน') as HTMLInputElement).value).toBe('Facilities updated');
  fail = false;
  await user.click(screen.getByRole('button', { name: 'บันทึก', exact: true }));
  await screen.findByRole('heading', { name: 'Facilities updated' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('blocks department closure while assigned work is still open', async () => {
  app = fixture();
  app.state.tickets = [makeTicket({ status: 'ASSIGNED', departmentId: DEPARTMENT_ID })];
  const { user } = app.open('/admin/departments', 'ADMIN');
  await user.click(await screen.findByRole('button', { name: 'ปิดใช้งาน Facilities' }));
  const dialog = screen.getByRole('dialog', { name: 'ปิดใช้งานหน่วยงาน' });
  expect(within(dialog).getByText('ยังมีงานค้าง 1 งาน')).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: 'ปิดใช้งาน', exact: true }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก', exact: true }));
  expect(app.requests.some(request => request.method === 'DELETE')).toBe(false);
});

it('closes and reopens a department without losing its historical identity', async () => {
  app = fixture();
  let fail = true;
  app.on('DELETE', `/departments/${DEPARTMENT_ID}`, () => {
    if (fail) return json({ message: 'Unavailable' }, 503);
    app.state.departments[0].active = false;
    return json({});
  });
  app.on('PUT', `/departments/${DEPARTMENT_ID}`, request => { Object.assign(app.state.departments[0], request.body); return json(app.state.departments[0]); });
  const { user } = app.open('/admin/departments', 'ADMIN');
  await user.click(await screen.findByRole('button', { name: 'ปิดใช้งาน Facilities' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ปิดใช้งาน', exact: true }));
  await screen.findByRole('alert');
  fail = false;
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ปิดใช้งาน', exact: true }));
  await user.click(await screen.findByRole('button', { name: 'เปิดใช้งานอีกครั้ง' }));
  await screen.findByRole('button', { name: 'ปิดใช้งาน Facilities' });
  expect(app.state.departments[0].id).toBe(DEPARTMENT_ID);
  expect(app.state.departments[0].active).toBe(true);
});

it('creates and updates a routing rule and preserves failed saves', async () => {
  app = fixture();
  let fail = true;
  app.on('POST', '/routing-rules', request => {
    if (fail) return json({ message: 'Unavailable' }, 503);
    app.state.rules.push({ id: 'rule', ...request.body } as typeof app.state.rules[number]);
    return json(app.state.rules[0]);
  });
  app.on('PUT', '/routing-rules/rule', request => { Object.assign(app.state.rules[0], request.body); return json(app.state.rules[0]); });
  const { user } = app.open('/admin/departments', 'ADMIN');
  await selectOption(user, await screen.findByRole('combobox', { name: 'ไฟฟ้า', exact: true }), 'Facilities');
  await user.click(screen.getByRole('checkbox', { name: 'เปิดส่งต่ออัตโนมัติ ไฟฟ้า' }));
  await user.click(screen.getByRole('button', { name: 'บันทึกไฟฟ้า', exact: true }));
  await screen.findByRole('alert');
  fail = false;
  await user.click(screen.getByRole('button', { name: 'บันทึกไฟฟ้า', exact: true }));
  await waitFor(() => expect((screen.getByRole('button', { name: 'บันทึกไฟฟ้า', exact: true }) as HTMLButtonElement).disabled).toBe(true));
  await user.click(screen.getByRole('checkbox', { name: 'เปิดส่งต่ออัตโนมัติ ไฟฟ้า' }));
  await user.click(screen.getByRole('button', { name: 'บันทึกไฟฟ้า', exact: true }));
  await waitFor(() => expect(app.requests.some(request => request.method === 'PUT' && request.path === '/routing-rules/rule')).toBe(true));
  expect(app.state.rules[0]).toMatchObject({ category: 'Electrical', departmentId: DEPARTMENT_ID, enabled: false });
});

it.each(['STAFF', 'ADMIN'] as const)('creates a %s account with the required role-specific fields', async role => {
  app = fixture();
  app.on('POST', '/auth/users', request => json({ id: 'new-user', ...request.body }));
  const { user } = app.open('/admin/users', 'ADMIN');
  await screen.findByRole('button', { name: 'จัดการบัญชี staff@example.test' });
  await user.type(field('อีเมล'), 'new@example.test');
  await user.type(field('รหัสผ่านเริ่มต้น'), 'test-input-only');
  if (role === 'ADMIN') await user.click(screen.getByRole('radio', { name: 'ผู้ดูแลระบบ', exact: true }));
  else await selectOption(user, screen.getByRole('combobox', { name: 'หน่วยงาน' }), 'Facilities');
  await user.click(screen.getByRole('button', { name: 'สร้างบัญชี', exact: true }));
  await screen.findByText('สร้างบัญชี new@example.test แล้ว');
  expect(app.requests.find(request => request.method === 'POST')?.body).toEqual({ email: 'new@example.test', password: 'test-input-only', role, ...(role === 'STAFF' ? { departmentId: DEPARTMENT_ID } : {}) });
});

it('updates role and active state, keeps errors visible and removes staff-only fields for reporters', async () => {
  app = fixture();
  let fail = true;
  app.on('PUT', '/auth/users/staff-id', request => {
    if (fail) return json({ message: 'Unavailable' }, 503);
    Object.assign(app.state.users[0], request.body);
    return json(app.state.users[0]);
  });
  const { user } = app.open('/admin/users', 'ADMIN');
  await user.click(await screen.findByRole('button', { name: 'จัดการบัญชี staff@example.test' }));
  const dialog = screen.getByRole('dialog');
  await selectOption(user, within(dialog).getByRole('combobox', { name: 'บทบาท' }), 'ผู้แจ้ง');
  await user.click(within(dialog).getByRole('checkbox', { name: 'เปิดใช้งานบัญชี' }));
  await user.click(within(dialog).getByRole('button', { name: 'บันทึกบัญชี' }));
  await screen.findByRole('alert');
  fail = false;
  await user.click(within(dialog).getByRole('button', { name: 'บันทึกบัญชี' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(app.requests.filter(request => request.method === 'PUT').at(-1)?.body).toEqual({ role: 'REPORTER', active: false });
});

it('filters the admin inbox and opens ticket details with the keyboard', async () => {
  app = fixture();
  app.state.tickets.push(makeTicket({ id: 'cccccccc-0000-4000-8000-000000000001', status: 'ASSIGNED', departmentId: DEPARTMENT_ID, departmentName: 'Facilities' }));
  const { user, container } = app.open('/admin', 'ADMIN');
  await screen.findByRole('table');
  await user.click(within(container.querySelector('.tabs')!).getByRole('button', { name: /^ทั้งหมด/ }));
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
  await user.type(field('ค้นหา'), 'not-found');
  await screen.findByText('ไม่มีงานในสถานะนี้');
  await user.clear(field('ค้นหา'));
  const row = (await screen.findAllByRole('row'))[1];
  row.focus();
  await user.keyboard('{Enter}');
  await waitFor(() => expect(window.location.pathname).toBe('/admin/tickets/' + TICKET_ID));
  await screen.findByRole('heading', { level: 1, name: 'ไฟทางเดินเสีย' });
});

it('recategorizes, retries routing, then assigns the selected department', async () => {
  app = fixture();
  app.state.tickets[0].routingStatus = 'REVIEW';
  app.state.tickets[0].routingReason = 'NO_RULE';
  for (const action of ['category', 'retry-routing', 'assign']) app.on('POST', `/tickets/${TICKET_ID}/${action}`, request => {
    if (action === 'category') app.state.tickets[0].category = request.body.category as string;
    if (action === 'assign') Object.assign(app.state.tickets[0], { status: 'ASSIGNED', departmentId: request.body.departmentId, departmentName: 'Facilities' });
    return json(app.state.tickets[0]);
  });
  const { user } = app.open('/admin/tickets/' + TICKET_ID, 'ADMIN');
  await selectOption(user, await screen.findByRole('combobox', { name: 'หมวดงาน', exact: true }), 'ประปา');
  await user.click(screen.getByRole('button', { name: 'เปลี่ยนหมวด', exact: true }));
  await screen.findByText('เปลี่ยนหมวดงานแล้ว');
  await user.click(screen.getByRole('button', { name: 'ส่งต่ออีกครั้ง', exact: true }));
  await screen.findByText('สั่งส่งต่ออีกครั้งแล้ว');
  await selectOption(user, screen.getByRole('combobox', { name: 'หน่วยงาน', exact: true }), 'Facilities');
  await user.click(screen.getByRole('button', { name: 'ส่งต่อ', exact: true }));
  await waitFor(() => expect(app.state.tickets[0].status).toBe('ASSIGNED'));
  expect(app.requests.find(request => request.path.endsWith('/assign'))?.body).toEqual({ departmentId: DEPARTMENT_ID });
});

it('requires a rejection reason and retains the dialog on a failed request', async () => {
  app = fixture();
  let fail = true;
  app.on('POST', `/tickets/${TICKET_ID}/reject`, request => {
    if (fail) return json({ message: 'Unavailable' }, 503);
    Object.assign(app.state.tickets[0], { status: 'REJECTED', reason: request.body.reason });
    return json(app.state.tickets[0]);
  });
  const { user } = app.open('/admin/tickets/' + TICKET_ID, 'ADMIN');
  await user.click(await screen.findByRole('button', { name: 'ไม่รับเรื่อง', exact: true }));
  const dialog = screen.getByRole('dialog');
  expect((within(dialog).getByRole('button', { name: 'ยืนยันไม่รับเรื่อง' }) as HTMLButtonElement).disabled).toBe(true);
  await user.type(field('เหตุผล'), ' งานซ้ำ ');
  await user.click(within(dialog).getByRole('button', { name: 'ยืนยันไม่รับเรื่อง' }));
  expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
  fail = false;
  await user.click(within(dialog).getByRole('button', { name: 'ยืนยันไม่รับเรื่อง' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(app.requests.filter(request => request.path.endsWith('/reject')).at(-1)?.body).toEqual({ reason: 'งานซ้ำ' });
});
