// Tiny color helpers so components derive translucent/canvas colors from theme
// tokens instead of hard-coding rgba literals (see component-library skill).

/** '#rgb' | '#rrggbb' -> [r, g, b]. Returns null for anything else. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 'r, g, b' triplet for canvas/CSS contexts that supply their own alpha. */
export function rgbTriplet(hex: string): string {
  const rgb = hexToRgb(hex);
  return rgb ? rgb.join(', ') : hex;
}

/** '#rrggbb' + 0..1 -> 'rgba(r, g, b, a)'. Non-hex input is returned untouched. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}
