import { expect, it } from 'vitest';
import { createAdminClient } from './test-helpers';

it('assigns unique permanent catalog numbers to new records and preserves them through edits', async () => {
  const admin = createAdminClient();
  for (const table of ['albums', 'tracks'] as const) {
    const rows = [1, 2].map(n => ({ title: `Catalog number test ${n}`, ...(table === 'tracks' ? { audio_url: 'tracks/test.mp3' } : {}) }));
    const { data, error } = await admin.from(table).insert(rows).select('id, catalog_number');
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    try {
      expect(data![0].catalog_number).toBeGreaterThan(0);
      expect(data![1].catalog_number).toBeGreaterThan(data![0].catalog_number);
      const { data: edited, error: editError } = await admin.from(table).update({ title: 'Edited title' }).eq('id', data![0].id).select('catalog_number').single();
      expect(editError).toBeNull();
      expect(edited!.catalog_number).toBe(data![0].catalog_number);
      const { error: renumberError } = await admin.from(table).update({ catalog_number: data![1].catalog_number + 100 }).eq('id', data![0].id);
      expect(renumberError).not.toBeNull();
    } finally {
      if (data?.length) await admin.from(table).delete().in('id', data.map(row => row.id));
    }
  }
});
