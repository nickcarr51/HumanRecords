'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/Input';
import { searchLinkableUsers } from '@/lib/admin/artists-actions';
import { userLabel, type LinkableUser, type LinkableUsersResult, type LinkedUser } from '@/lib/admin/artists-types';
import { ComboBox, List, Option, Picked } from './admin-artists.styles';

export const SEARCH_DEBOUNCE_MS = 250;

export interface UserComboboxProps {
  id: string;
  label: string;
  value: LinkedUser | null;
  onChange: (user: LinkedUser | null) => void;
  artistId?: string;
  search?: (query: string, artistId?: string) => Promise<LinkableUsersResult>;
  disabled?: boolean;
}

function optionText(u: LinkableUser): string {
  return u.linkedArtist ? `${userLabel(u)} — linked to ${u.linkedArtist.name}` : userLabel(u);
}

export function UserCombobox({
  id,
  label,
  value,
  onChange,
  artistId,
  search = searchLinkableUsers,
  disabled = false,
}: UserComboboxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkableUser[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searchFailed, setSearchFailed] = useState(false);
  const latest = useRef('');

  // Debounced search; `latest` drops responses for queries already typed past.
  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      let res: LinkableUsersResult | null = null;
      try {
        res = await search(q, artistId);
      } catch {
        res = null;
      }
      if (latest.current !== q) return;
      setActive(-1);
      if (!res || res.error) {
        setResults([]);
        setSearchFailed(true);
      } else {
        setResults(res.users);
        setSearchFailed(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search, artistId]);

  const listId = `${id}-listbox`;
  const showList = open && !disabled && results.length > 0;

  function pick(u: LinkableUser) {
    if (u.linkedArtist) return;
    onChange({ id: u.id, name: u.name, email: u.email });
    setQuery('');
    setResults([]);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (!showList) return;
      const u = results[active >= 0 ? active : 0];
      if (!u) return;
      e.preventDefault();
      pick(u);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  if (value) {
    return (
      <FormField label={label}>
        <Picked>
          <span>{userLabel(value)}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Clear ${label.toLowerCase()}`}
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            Clear
          </Button>
        </Picked>
      </FormField>
    );
  }

  return (
    <FormField label={label} htmlFor={`${id}-input`} hint="Optional. Search by name or email.">
      <ComboBox>
        <Input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          value={query}
          disabled={disabled}
          placeholder="Not linked"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setResults([]);
            setSearchFailed(false);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          onFocus={() => !disabled && setOpen(true)}
        />
        {showList ? (
          <List id={listId} role="listbox">
            {results.map((u, i) => (
              <Option
                key={u.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={u.linkedArtist ? true : undefined}
                $active={i === active}
                $disabled={Boolean(u.linkedArtist)}
                // mousedown (not click) so the pick lands before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(u);
                }}
              >
                {optionText(u)}
              </Option>
            ))}
          </List>
        ) : null}
      </ComboBox>
      {searchFailed ? <div role="status">Couldn&apos;t search users.</div> : null}
    </FormField>
  );
}
