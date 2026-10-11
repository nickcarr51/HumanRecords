// Pure (no server-only): builds the name a downloaded file is saved under.
// The R2 object itself is never touched; this only feeds Content-Disposition.

const MAX_BASE = 150; // code points, before ".ext"

const chars = (s: string) => Array.from(s);
const len = (s: string) => chars(s).length;
const trimEnd = (s: string) => s.replace(/[. ]+$/, "");

function clean(s: string): string {
  return trimEnd(
    s
      .replace(/[/\\:]/g, "-")
      .replace(/[?*"<>|\x00-\x1f\x7f]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function cut(s: string, max: number): string {
  return trimEnd(chars(s).slice(0, max).join(""));
}

export function extFromKey(key: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(key.slice(key.lastIndexOf("/") + 1));
  return m ? m[1].toLowerCase() : "bin";
}

export function downloadFilename(artistNames: string[], title: string, ext: string): string {
  const artists = artistNames.map(clean).filter(Boolean);
  const name = clean(title) || "track";
  const withTitle = (artistPart: string) => (artistPart ? `${artistPart} - ${name}` : name);

  let base = withTitle(artists.join(" x "));

  if (len(base) > MAX_BASE) {
    base = "";
    for (let k = artists.length - 1; k >= 1; k--) {
      const candidate = withTitle(`${artists.slice(0, k).join(" x ")} x ${artists.length - k} more`);
      if (len(candidate) <= MAX_BASE) {
        base = candidate;
        break;
      }
    }
    if (!base) {
      // Even one artist + title doesn't fit: keep the first artist, cut the title.
      const prefix =
        artists.length > 1
          ? `${artists[0]} x ${artists.length - 1} more - `
          : artists.length === 1
            ? `${artists[0]} - `
            : "";
      base = cut(prefix + name, MAX_BASE);
    }
  }

  return `${base}.${ext}`;
}
