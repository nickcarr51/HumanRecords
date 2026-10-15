import { SweepIcon } from './SweepIcon';

/** Shared geometric icons; the enclosing button supplies the circle and label. */
export function PlaybackIcon({ playing }: { playing: boolean }) {
  return (
    <SweepIcon
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {playing ? (
        <>
          <rect x="5" y="4" width="5" height="16" rx="1" />
          <rect x="14" y="4" width="5" height="16" rx="1" />
        </>
      ) : (
        <path d="M7 4 21 12 7 20Z" />
      )}
    </SweepIcon>
  );
}
