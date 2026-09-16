import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    renderWithTheme(
      <Modal open={false} onClose={() => {}} label="demo">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderWithTheme(
      <Modal open onClose={onClose} label="demo">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'demo' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
