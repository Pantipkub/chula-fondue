import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Button, Drawer, Modal, PasswordInput, PhotoPicker, Select, ToastProvider, useToast } from '../../frontend/src/components/ui';
import { TicketCard } from '../../frontend/src/pages/reporter';
import type { Ticket } from '../../frontend/src/lib/api';

it('a busy button remains disabled even when disabled=false is explicitly supplied', async () => {
  const action = vi.fn();
  render(<Button busy disabled={false} onClick={action}>บันทึก</Button>);
  const button = screen.getByRole('button', { name: 'บันทึก' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  await userEvent.click(button);
  expect(action).not.toHaveBeenCalled();
});

it('password visibility changes preserve the typed value and accessible toggle state', async () => {
  render(<PasswordInput id="password" label="รหัสผ่าน" defaultValue="test-input-only" />);
  const input = screen.getByLabelText('รหัสผ่าน') as HTMLInputElement;
  expect(input.type).toBe('password');
  await userEvent.click(screen.getByRole('button', { name: 'แสดงรหัสผ่าน' }));
  expect(input.type).toBe('text');
  expect(input.value).toBe('test-input-only');
  expect(screen.getByRole('button', { name: 'ซ่อนรหัสผ่าน' }).getAttribute('aria-pressed')).toBe('true');
});

it('dropdown labels support text nodes without object stringification and keep an empty option', () => {
  const { rerender } = render(<Select id="category" label="หมวด" value=""><option value="">ทุกหมวด</option><option value="1">หมวด {1}</option></Select>);
  expect(screen.getByRole('combobox').textContent).toContain('ทุกหมวด');
  rerender(<Select id="category" label="หมวด" value="1"><option value="">ทุกหมวด</option><option value="1">หมวด {1}</option></Select>);
  expect(screen.getByRole('combobox').textContent).toContain('หมวด 1');
  expect(screen.getByRole('combobox').textContent).not.toContain('[object Object]');
});

it('the photo picker is keyboard-operable and validates type, size and count', async () => {
  const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  function Picker() {
    const [files, setFiles] = useState<File[]>([]);
    return <PhotoPicker files={files} onChange={setFiles} max={2} />;
  }
  const { container, unmount } = render(<Picker />);
  const input = container.querySelector('input[type=file]') as HTMLInputElement;
  const click = vi.spyOn(input, 'click').mockImplementation(() => {});
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: /ลากรูป/ }));
  await user.keyboard('{Enter}');
  expect(click).toHaveBeenCalledTimes(1);
  const invalid = new File(['text'], 'not-image.txt', { type: 'text/plain' });
  fireEvent.change(input, { target: { files: [invalid] } });
  expect(screen.getByText(/รองรับเฉพาะ JPG/)).toBeTruthy();
  const large = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [large] } });
  expect(screen.getByText(/ขนาดเกิน 5 MB/)).toBeTruthy();
  const images = ['first', 'second', 'third'].map(name => new File(['image'], `${name}.png`, { type: 'image/png' }));
  fireEvent.change(input, { target: { files: images } });
  expect(screen.getAllByRole('img')).toHaveLength(2);
  expect(screen.getByText('แนบได้สูงสุด 2 รูป')).toBeTruthy();
  await user.click(screen.getAllByRole('button', { name: 'ลบรูป' })[0]);
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.getByRole('button', { name: /ลากรูป/ })).toBeTruthy();
  unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:first.png');
});

it.each([Modal, Drawer])('opens a native dialog and supports cancellation/backdrop dismissal', async Component => {
  const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  const close = vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  const onClose = vi.fn();
  const { unmount } = render(<Component open onClose={onClose} label="ยืนยัน"><Button>ดำเนินการ</Button></Component>);
  const dialog = screen.getByRole('dialog', { name: 'ยืนยัน' });
  expect(dialog.tagName).toBe('DIALOG');
  expect(show).toHaveBeenCalledTimes(1);
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'ปิดยืนยัน' }));
  expect(onClose).toHaveBeenCalledTimes(2);
  unmount();
  expect(close).toHaveBeenCalledTimes(1);
});

it('wraps forward/backward Tab at dialog boundaries and restores focus when closed', () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  try {
    const { unmount } = render(<Modal open onClose={() => {}} label="ยืนยัน"><select aria-hidden="true" tabIndex={-1}><option>hidden form control</option></select><Button>แรก</Button><Button>สุดท้าย</Button><select aria-hidden="true" tabIndex={-1}><option>hidden form control</option></select></Modal>);
    const first = screen.getByRole('button', { name: 'แรก' });
    const last = screen.getByRole('button', { name: 'สุดท้าย' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(first);
    unmount();
    expect(document.activeElement).toBe(trigger);
  } finally { trigger.remove(); }
});

it('ticket actions are outside the navigation link and do not navigate on confirmation', async () => {
  const confirm = vi.fn();
  const ticket = { id: 'ticket', category: 'Electrical', description: 'ไฟเสีย', status: 'RESOLVED', photoUrls: [], location: 'Library', updatedAt: new Date().toISOString() } as Ticket;
  render(<MemoryRouter><TicketCard t={ticket} i={0} to="/tickets/ticket"><Button onClick={confirm}>ตรวจรับ</Button></TicketCard></MemoryRouter>);
  const action = screen.getByRole('button', { name: 'ตรวจรับ' });
  expect(action.closest('a')).toBeNull();
  expect(screen.getByRole('link').getAttribute('href')).toBe('/tickets/ticket');
  await userEvent.click(action);
  expect(confirm).toHaveBeenCalledTimes(1);
});

it('multiple notifications receive distinct IDs and disappear after their display period', () => {
  vi.useFakeTimers();
  function Notify() {
    const toast = useToast();
    return <Button onClick={() => { toast('สำเร็จ'); toast('ผิดพลาด', 'red'); }}>แจ้งเตือน</Button>;
  }
  try {
    const { container } = render(<ToastProvider><Notify /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'แจ้งเตือน' }));
    expect(container.querySelectorAll('.toast')).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(4200); });
    expect(container.querySelectorAll('.toast')).toHaveLength(0);
  } finally { vi.useRealTimers(); }
});
