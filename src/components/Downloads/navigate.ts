// Isolated so tests can mock it (jsdom's location.assign isn't spyable).
// The cross-origin `download` attribute is ignored by browsers; the signed
// URL's Content-Disposition: attachment makes the browser save the file and
// keep this page (and the player) running.
export function navigateTo(url: string): void {
  window.location.assign(url);
}
