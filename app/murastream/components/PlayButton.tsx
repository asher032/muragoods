'use client';

import Link from 'next/link';
import { usePlayback } from '@/app/lib/murastream/playback/client';
import { GlassButton } from '@/app/components/ui/GlassButton';

// A "Watch Now" button that means it.
//
// It asks the resolver whether a validated, authorized source actually exists
// and renders accordingly:
//
//   PLAYABLE            "Watch Now" — a source was confirmed
//   resolving            "Checking availability…"
//   anything else       "View details" — the title exists in the catalog but
//                       there is no authorized source, and the button does
//                       NOT claim otherwise
//
// The previous buttons linked straight to the watch page regardless, so a
// title with no source still advertised playback it did not have.
//
// Geometry and colour come from the ONE Muragoods design system
// (GlassButton), so this CTA is the same object as the one on the shop, the
// account pages and the dashboard.

type Variant = 'primary' | 'secondary';

const PLAY_ICON = (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden>
    <path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z" />
  </svg>
);

export default function PlayButton({
  mediaType,
  tmdbId,
  season = 1,
  episode = 1,
  variant = 'primary',
}: {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  season?: number;
  episode?: number;
  variant?: Variant;
}) {
  const { phase, source } = usePlayback({
    mediaType,
    tmdbId,
    season: mediaType === 'tv' ? season : null,
    episode: mediaType === 'tv' ? episode : null,
  });

  if (phase === 'loading') {
    return (
      <GlassButton variant="secondary" aria-live="polite" disabled>
        Checking availability…
      </GlassButton>
    );
  }

  if (phase === 'ready' && source) {
    const href = mediaType === 'tv'
      ? `/murastream/watch?type=tv&id=${tmdbId}&season=${season}&episode=${episode}`
      : `/murastream/watch?type=movie&id=${tmdbId}`;
    return (
      <GlassButton variant={variant} href={href}>
        {PLAY_ICON}
        Watch Now
      </GlassButton>
    );
  }

  // No authorized source. The title is still browsable — the button just
  // stops promising playback.
  const detailsHref = `/murastream/${mediaType}/${tmdbId}`;
  return (
    <GlassButton variant="secondary" href={detailsHref}>
      View details
    </GlassButton>
  );
}
