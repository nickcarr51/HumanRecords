import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FileInput } from './FileInput';

describe('FileInput', () => {
  it('labels the native input with the button text and reports chosen files', () => {
    const onChange = vi.fn();
    renderWithTheme(<FileInput id="f" buttonLabel="Choose MP3" accept=".mp3" onChange={onChange} />);
    const input = screen.getByLabelText('Choose MP3');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', '.mp3');
    const file = new File(['x'], 'a.mp3', { type: 'audio/mpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('passes disabled and invalid through to the native input', () => {
    renderWithTheme(<FileInput id="f" disabled $invalid />);
    const input = screen.getByLabelText('Choose file');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
