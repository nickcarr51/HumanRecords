import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Input } from './Input';
import { Textarea } from '@/components/Textarea/Textarea';
import { Select } from '@/components/Select/Select';

describe('text inputs', () => {
  it('accept typed values and render options', () => {
    renderWithTheme(
      <>
        <Input aria-label="name" defaultValue="" />
        <Textarea aria-label="bio" />
        <Select aria-label="genre" defaultValue="a">
          <option value="a">A</option>
          <option value="b">B</option>
        </Select>
      </>,
    );
    const name = screen.getByLabelText('name');
    fireEvent.change(name, { target: { value: 'hi' } });
    expect(name).toHaveValue('hi');
    expect(screen.getByLabelText('bio')).toBeInTheDocument();
    expect(screen.getByLabelText('genre')).toHaveValue('a');
  });
});
