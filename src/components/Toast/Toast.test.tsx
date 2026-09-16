import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ToastProvider, useToast } from './ToastProvider';

function Trigger() {
  const { notify } = useToast();
  return <button onClick={() => notify('Saved', 'success')}>fire</button>;
}

describe('Toast', () => {
  it('shows a toast when notify is called', () => {
    renderWithTheme(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});
