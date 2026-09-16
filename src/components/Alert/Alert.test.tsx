import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Alert } from './Alert';
import { Spinner } from '@/components/Spinner/Spinner';

describe('Alert + Spinner', () => {
  it('renders an alert and a spinner', () => {
    renderWithTheme(
      <>
        <Alert $tone="error" role="alert">Upload failed</Alert>
        <Spinner aria-label="loading" role="status" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
    expect(screen.getByRole('status', { name: 'loading' })).toBeInTheDocument();
  });
});
