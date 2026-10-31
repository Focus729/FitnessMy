import { fireEvent, render, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { NumberField } from './primitives';
afterEach(cleanup);
it('preserves an intermediate decimal separator while publishing numeric values', () => {
  function Form() {
    const [value, setValue] = useState<number | ''>('');
    return (
      <>
        <NumberField aria-label="weight" value={value} onChange={setValue} />
        <output>{value}</output>
      </>
    );
  }
  const ui = render(<Form />);
  const field = ui.getByLabelText('weight') as HTMLInputElement;
  for (const value of ['8', '80', '80,', '80,5']) fireEvent.change(field, { target: { value } });
  expect(field.value).toBe('80,5');
  expect(ui.container.querySelector('output')?.textContent).toBe('80.5');
  fireEvent.change(field, { target: { value: 'not-a-number' } });
  expect(field.value).toBe('80,5');
});
