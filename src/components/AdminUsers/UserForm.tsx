'use client';

import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/Input';
import { Stack } from '@/components/Stack';
import { updateUserProfile } from '@/lib/admin/users-actions';
import type { ActionResult, AdminUserRow } from '@/lib/admin/users-types';

// Admin sets the email directly — no confirmation email is sent.
export function UserForm({ user }: { user: AdminUserRow }) {
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    let res: ActionResult;
    try {
      res = await updateUserProfile(user.id, { name, email });
    } catch {
      setError('Something went wrong. Try again.');
      return;
    } finally {
      setPending(false);
    }
    if (res.error) setError(res.error);
    else setSaved(true);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack $gap="md">
        {error ? (
          <Alert $tone="error" role="alert">
            {error}
          </Alert>
        ) : null}
        {saved ? (
          <Alert $tone="success" role="status">
            Saved.
          </Alert>
        ) : null}
        <FormField label="Name" htmlFor="user-name">
          <Input id="user-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField
          label="Email"
          htmlFor="user-email"
          hint={emailChanged ? 'Sign-in codes will go to the new address.' : undefined}
        >
          <Input
            id="user-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </FormField>
        <div>
          <Button type="submit" loading={pending}>
            Save
          </Button>
        </div>
      </Stack>
    </form>
  );
}
