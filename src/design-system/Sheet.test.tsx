import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('an interrupted drag never closes the editor', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  const onClose = vi.fn();
  const ui = render(
    <Sheet open title="Editor" onClose={onClose}>
      Draft
    </Sheet>,
  );
  const handle = ui.getByRole('heading', { name: 'Editor' }).closest('.sticky')!;
  fireEvent.pointerDown(handle, { clientY: 10 });
  fireEvent.pointerMove(handle, { clientY: 150 });
  fireEvent.pointerCancel(handle);
  fireEvent.pointerUp(handle, { clientY: 150 });
  expect(onClose).not.toHaveBeenCalled();
  expect(ui.getByRole('dialog')).toBeTruthy();
});
