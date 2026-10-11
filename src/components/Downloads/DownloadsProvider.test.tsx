import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DownloadsProvider, useDownloads } from './DownloadsProvider';

function Probe({ id }: { id: string }) {
  const { isDownloaded, markDownloaded } = useDownloads();
  return (
    <button type="button" onClick={() => markDownloaded(id)}>
      {id}:{isDownloaded(id) ? 'yes' : 'no'}
    </button>
  );
}

describe('DownloadsProvider', () => {
  it('reports initial ids as downloaded', () => {
    render(
      <DownloadsProvider initialIds={['t1']}>
        <Probe id="t1" />
        <Probe id="t2" />
      </DownloadsProvider>,
    );
    expect(screen.getByText('t1:yes')).toBeInTheDocument();
    expect(screen.getByText('t2:no')).toBeInTheDocument();
  });

  it('markDownloaded flips every consumer of that id', () => {
    render(
      <DownloadsProvider initialIds={[]}>
        <Probe id="t1" />
        <Probe id="t1" />
      </DownloadsProvider>,
    );
    fireEvent.click(screen.getAllByText('t1:no')[0]);
    expect(screen.getAllByText('t1:yes')).toHaveLength(2);
  });

  it('picks up new initialIds on rerender without losing local marks', () => {
    const { rerender } = render(
      <DownloadsProvider initialIds={[]}>
        <Probe id="t1" />
        <Probe id="t9" />
      </DownloadsProvider>,
    );
    fireEvent.click(screen.getByText('t1:no'));
    rerender(
      <DownloadsProvider initialIds={['t9']}>
        <Probe id="t1" />
        <Probe id="t9" />
      </DownloadsProvider>,
    );
    expect(screen.getByText('t1:yes')).toBeInTheDocument();
    expect(screen.getByText('t9:yes')).toBeInTheDocument();
  });

  it('falls back to nothing-downloaded outside a provider, without throwing', () => {
    render(<Probe id="t1" />);
    fireEvent.click(screen.getByText('t1:no'));
    expect(screen.getByText('t1:no')).toBeInTheDocument();
  });
});
