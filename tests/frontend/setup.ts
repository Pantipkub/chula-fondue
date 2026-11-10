import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom does not implement the native dialog lifecycle; browser checks cover focus/Escape.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', ''); } },
  close: { configurable: true, value() { this.removeAttribute('open'); } },
});

// Browser layout and pointer APIs used by Radix are absent in jsdom.
for (const name of ['setPointerCapture', 'releasePointerCapture', 'scrollIntoView']) {
  if (!(name in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value() {} });
}
if (!('hasPointerCapture' in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value() { return false; } });
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
