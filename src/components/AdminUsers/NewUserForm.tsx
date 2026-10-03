'use client';

import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/Input';
import { Row } from '@/components/Row';
import { Select } from '@/components/Select';
import { Stack } from '@/components/Stack';
import { createUser } from '@/lib/admin/users-actions';
import { ROLE_LABELS, USER_ROLES, type UserRole } from '@/lib/admin/users-types';

// Creates the account + invite link. Nothing is emailed; the link appears in
// the table below (the page re-renders via revalidatePath).
export function NewUserForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('listener');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setCreated(null);
    const res = await createUser({ email, name, role });
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCreated(email.trim().toLowerCase());
    setEmail('');
    setName('');
    setRole('listener');
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack $gap="md">
        {error ? (
          <Alert $tone="error" role="alert">
            {error}
          </Alert>
        ) : null}
        {created ? (
          <Alert $tone="success" role="status">
            Invite link created for {created}.
          </Alert>
        ) : null}
        <Row $gap="md" $wrap $align="flex-end">
          <FormField label="Email" htmlFor="new-user-email">
            <Input
              id="new-user-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Name" htmlFor="new-user-name">
            <Input id="new-user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Role" htmlFor="new-user-role">
            <Select id="new-user-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </FormField>
          <Button type="submit" loading={pending}>
            Create
          </Button>
        </Row>
      </Stack>
    </form>
  );
}
