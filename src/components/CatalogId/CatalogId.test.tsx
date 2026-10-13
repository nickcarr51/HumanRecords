import { expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CatalogId } from './CatalogId';

it('formats permanent album and track numbers without truncating large catalogs', () => {
  renderWithTheme(<><CatalogId kind="album" number={1} /><CatalogId kind="track" number={12} /><CatalogId kind="album" number={1001} /></>);
  expect(screen.getByLabelText('Album catalog HS001')).toHaveTextContent('HS001');
  expect(screen.getByLabelText('Track catalog HSS012')).toHaveTextContent('HSS012');
  expect(screen.getByLabelText('Album catalog HS1001')).toBeInTheDocument();
});

it('omits an unavailable catalog number', () => {
  const { container } = renderWithTheme(<CatalogId kind="album" />);
  expect(container).toBeEmptyDOMElement();
});
