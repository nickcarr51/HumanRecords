'use client';

import { useState } from 'react';
import { Select } from '@/components/Select';
import { setUserRole } from '@/lib/admin/users-actions';
import { ROLE_LABELS, USER_ROLES, type UserRole } from '@/lib/admin/users-types';
import { Cell, Status } from './users.styles';

export interface RoleSelectProps {
  userId: string;
  role: UserRole;
  disabled: boolean;
  label: string;
}

// Saves on change; reverts and shows the error if the save fails.
export function RoleSelect({ userId, role, disabled, label }: RoleSelectProps) {
  const [value, setValue] = useState<UserRole>(role);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'muted' | 'error'; text: string } | null>(null);

  async function change(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as UserRole;
    const previous = value;
    setValue(next);
    setSaving(true);
    setMessage(null);
    const res = await setUserRole(userId, next);
    setSaving(false);
    if (res.error) {
      setValue(previous);
      setMessage({ tone: 'error', text: res.error });
    } else {
      setMessage({ tone: 'muted', text: 'Saved' });
    }
  }

  return (
    <Cell>
      <Select aria-label={label} value={value} onChange={change} disabled={disabled || saving}>
        {USER_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
      {message ? (
        <Status $tone={message.tone} role={message.tone === 'error' ? 'alert' : undefined}>
          {message.text}
        </Status>
      ) : null}
    </Cell>
  );
}
