import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ToastProvider, useToast, useOptionalToast } from './ToastProvider';

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

  it('useOptionalToast returns null outside a provider and the context inside one', () => {
    let outside: unknown = 'unset';
    let inside: unknown = null;
    function Probe({ into }: { into: 'outside' | 'inside' }) {
      const v = useOptionalToast();
      if (into === 'outside') outside = v;
      else inside = v;
      return null;
    }
    renderWithTheme(<Probe into="outside" />);
    expect(outside).toBeNull();
    renderWithTheme(
      <ToastProvider>
        <Probe into="inside" />
      </ToastProvider>,
    );
    expect(inside).toEqual({ notify: expect.any(Function) });
  });
});
