'use client';

import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Input } from '@/components/Input';
import { FormField } from '@/components/FormField';
import { searchArtists } from '@/lib/admin/actions';
import type { ArtistMatch, ArtistSearchResult } from '@/lib/admin/types';
import { buildOptions, type ComboOption } from './artist-options';
import { newChip, type ArtistChip, type Direction } from './upload-reducer';

export const SEARCH_DEBOUNCE_MS = 250;

export type ArtistComboboxProps = {
  id: string;
  label: string;
  chips: ArtistChip[];
  pending: ArtistChip[];
  onAdd: (chip: ArtistChip) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: Direction) => void;
  error?: string;
  search?: (query: string) => Promise<ArtistSearchResult>;
};

const Box = styled.div`
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xs};
  align-items: center;
`;

const Chip = styled.span<{ $new: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  padding: 0.15rem ${({ theme }) => theme.space.sm};
  border: 1px solid ${({ theme, $new }) => ($new ? theme.colors.accent : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.pill};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.text};
`;

const NewBadge = styled.span`
  color: ${({ theme }) => theme.colors.accent};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ChipButton = styled.button`
  background: none;
  border: 0;
  padding: 0 0.15rem;
  cursor: pointer;
  font: inherit;
  color: ${({ theme }) => theme.colors.muted};
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.colors.accent};
  }
`;

const List = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  margin: ${({ theme }) => theme.space.xs} 0 0;
  padding: ${({ theme }) => theme.space.xs} 0;
  list-style: none;
  background: ${({ theme }) => theme.colors.raised};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const Option = styled.li<{ $active: boolean }>`
  padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md};
  cursor: pointer;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $active }) => ($active ? theme.colors.accent : theme.colors.text)};
  background: ${({ theme, $active }) => ($active ? theme.colors.surface : 'transparent')};
`;

function optionLabel(o: ComboOption): string {
  return o.kind === 'create' ? `Create "${o.name}"` : o.chip.name;
}

export function ArtistCombobox({
  id,
  label,
  chips,
  pending,
  onAdd,
  onRemove,
  onMove,
  error,
  search = searchArtists,
}: ArtistComboboxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ArtistMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef('');

  // Debounced search. `latest` drops responses for queries the user has
  // already typed past, so a slow early response can't overwrite a newer one.
  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await search(q);
      if (latest.current === q) setResults(res.artists);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search]);

  const options = buildOptions(query, results, pending, chips);
  const listId = `${id}-listbox`;
  const showList = open && options.length > 0;

  function pick(o: ComboOption) {
    // Never create a blank artist (buildOptions already yields nothing for a blank query).
    if (o.kind === 'create' && !o.name.trim()) return;
    onAdd(o.kind === 'create' ? newChip(o.name) : o.chip);
    setQuery('');
    setResults([]);
    setActive(-1);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (options.length === 0) return;
      e.preventDefault();
      pick(options[active >= 0 ? active : 0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (e.key === 'Backspace' && query === '' && chips.length > 0) {
      onRemove(chips[chips.length - 1].key);
    }
  }

  return (
    <FormField label={label} htmlFor={`${id}-input`} error={error}>
      <Box>
        {chips.map((c, i) => (
          <Chip key={c.key} $new={c.id === null}>
            <ChipButton type="button" aria-label={`Move ${c.name} left`} disabled={i === 0} onClick={() => onMove(c.key, -1)}>
              ←
            </ChipButton>
            {c.name}
            {c.id === null ? <NewBadge>new</NewBadge> : null}
            <ChipButton
              type="button"
              aria-label={`Move ${c.name} right`}
              disabled={i === chips.length - 1}
              onClick={() => onMove(c.key, 1)}
            >
              →
            </ChipButton>
            <ChipButton type="button" aria-label={`Remove ${c.name}`} onClick={() => onRemove(c.key)}>
              ×
            </ChipButton>
          </Chip>
        ))}
        <Input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          $invalid={Boolean(error)}
          value={query}
          placeholder="Search or add an artist"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          onFocus={() => setOpen(true)}
        />
        {showList ? (
          <List id={listId} role="listbox">
            {options.map((o, i) => (
              <Option
                key={o.kind === 'create' ? 'create' : o.chip.key}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                $active={i === active}
                // mousedown (not click) so the pick lands before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                {optionLabel(o)}
              </Option>
            ))}
          </List>
        ) : null}
      </Box>
    </FormField>
  );
}
