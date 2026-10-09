import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FormField } from './FormField';
import { Checkbox } from '@/components/Checkbox/Checkbox';
import { Radio } from '@/components/Radio/Radio';

describe('FormField + choice inputs', () => {
  it('shows the error over the hint when present', () => {
    renderWithTheme(
      <FormField label="Email" htmlFor="email" hint="we never share it" error="required">
        <input id="email" />
      </FormField>,
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('required');
    expect(screen.queryByText('we never share it')).not.toBeInTheDocument();
  });

  it('toggles a checkbox', () => {
    renderWithTheme(<Checkbox aria-label="agree" />);
    const box = screen.getByLabelText('agree');
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
  });

  it('selects a radio', () => {
    renderWithTheme(<Radio aria-label="one" name="g" />);
    const r = screen.getByLabelText('one');
    fireEvent.click(r);
    expect(r).toBeChecked();
  });
});
