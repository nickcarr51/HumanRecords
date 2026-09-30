import type { ArtistMatch } from "@/lib/admin/types";
import { existingChip, normalizeName, type ArtistChip } from "./upload-reducer";

export type ComboOption = { kind: "existing"; chip: ArtistChip } | { kind: "create"; name: string };

// Dropdown contents for one artist field: DB matches, plus artists typed as
// "new" elsewhere in the form (so the same new artist isn't created twice),
// minus what's already chipped here, plus a Create row when nothing matches
// exactly (case/space-insensitive, same rule as the DB).
export function buildOptions(
  query: string,
  results: ArtistMatch[],
  pending: ArtistChip[],
  selected: ArtistChip[],
): ComboOption[] {
  const q = normalizeName(query);
  if (!q) return [];

  const fromDb = results.map(existingChip);
  const dbNames = new Set(fromDb.map((c) => normalizeName(c.name)));
  const fromForm = pending.filter(
    (c) => normalizeName(c.name).includes(q) && !dbNames.has(normalizeName(c.name)),
  );
  const candidates = [...fromDb, ...fromForm];

  const selectedNames = new Set(selected.map((c) => normalizeName(c.name)));
  const options: ComboOption[] = candidates
    .filter((c) => !selectedNames.has(normalizeName(c.name)))
    .map((chip) => ({ kind: "existing", chip }));

  const exact = selectedNames.has(q) || candidates.some((c) => normalizeName(c.name) === q);
  if (!exact) options.push({ kind: "create", name: query.trim() });
  return options;
}
