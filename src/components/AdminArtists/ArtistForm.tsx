'use client';

import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/Input';
import { Stack } from '@/components/Stack';
import { Textarea } from '@/components/Textarea';
import { createArtist, updateArtist } from '@/lib/admin/artists-actions';
import {
  MAX_ARTIST_NAME_LENGTH,
  MAX_BIO_LENGTH,
  type AdminArtistDetail,
  type ArtistActionResult,
  type LinkedUser,
} from '@/lib/admin/artists-types';
import { isRedirectError } from './redirect';
import { UserCombobox } from './UserCombobox';

export interface ArtistFormProps {
  artist?: AdminArtistDetail;
}

// Create mode (no artist): createArtist redirects to the new artist's page.
// Edit mode: updateArtist; the page re-renders via revalidatePath.
export function ArtistForm({ artist }: ArtistFormProps) {
  const [name, setName] = useState(artist?.name ?? '');
  const [bio, setBio] = useState(artist?.bio ?? '');
  const [linkedUser, setLinkedUser] = useState<LinkedUser | null>(artist?.linkedUser ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const input = { name, bio, userId: linkedUser?.id ?? null };
    let res: ArtistActionResult;
    try {
      res = artist ? await updateArtist(artist.id, input) : await createArtist(input);
    } catch (err) {
      if (isRedirectError(err)) throw err;
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
        <FormField label="Name" htmlFor="artist-name">
          <Input
            id="artist-name"
            maxLength={MAX_ARTIST_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Bio" htmlFor="artist-bio">
          <Textarea id="artist-bio" rows={6} maxLength={MAX_BIO_LENGTH} value={bio} onChange={(e) => setBio(e.target.value)} />
        </FormField>
        <UserCombobox
          id="artist-user"
          label="Linked user"
          value={linkedUser}
          onChange={setLinkedUser}
          artistId={artist?.id}
          disabled={pending}
        />
        <div>
          <Button type="submit" loading={pending}>
            {artist ? 'Save' : 'Create artist'}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
