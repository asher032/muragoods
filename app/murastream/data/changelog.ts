// MuraStream changelog data — single source of truth.
// Consumed by /murastream/changelog (rendering) and MuraStreamLayout
// (What's New badge: shows until the user has seen the latest entry).

export type ChangelogEntry = {
  id: string; // stable key for seen-tracking
  version: string;
  date: string;
  title: string;
  items: { label: string; text: string }[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: 'source-intelligence',
    version: 'Source Intelligence',
    date: 'September 2026',
    title: 'Smarter, cleaner playback',
    items: [
      { label: '⚑', text: 'Report button in the player — flag broken or ad-heavy sources. Reports feed trust scores and the admin dashboard.' },
      { label: '🟢', text: 'Trust badges on the active source, backed by real community reports (Trusted / Mixed / Low / Reported broken).' },
      { label: '⏱', text: 'Per-title source memory — repeat plays skip the health probe entirely and open your last working provider instantly.' },
      { label: 'S · N · F', text: 'Keyboard shortcuts: S cycles sources, N jumps to the next episode, F fullscreen, M mute, ←/→ seek episodes.' },
      { label: '▶', text: 'Instant next-episode autoplay when the player signals the episode ended — no countdown.' },
    ],
  },
  {
    id: 'dramas',
    version: 'K · C · J Dramas',
    date: 'September 2026',
    title: 'Asian drama universe',
    items: [
      { label: 'K·C·J', text: 'Dedicated drama browse page with K-Dramas, C-Dramas, and J-Dramas — genre, year, and sort filters plus infinite scroll.' },
      { label: 'HERO', text: 'Featured hero banner spotlighting the #1 trending drama of your current filter.' },
      { label: 'ORIGIN', text: 'Country badges (K-DRAMA / C-DRAMA / J-DRAMA) on cards across the whole app so origins are recognizable everywhere.' },
      { label: '2', text: 'Fixed episode numbering bug that made every TV episode play as Episode 1.' },
    ],
  },
  {
    id: 'free-vault',
    version: 'The Free Vault',
    date: 'September 2026',
    title: 'Real downloads, zero ads, guaranteed',
    items: [
      { label: 'DL', text: 'Four Creative-Commons films (Big Buck Bunny, Sintel, Elephants Dream, Tears of Steel) with real download buttons — fully legal.' },
      { label: '⚙', text: 'Native HLS player with a true quality selector (Auto/1080p/720p/…), progress resume, and no third-party embeds.' },
      { label: '🚫', text: 'The only section where zero ads is guaranteed by construction — there is no external player to inject anything.' },
    ],
  },
  {
    id: 'player-v2',
    version: 'Player v2',
    date: 'September 2026',
    title: 'Clean sources, health checks, fallbacks',
    items: [
      { label: '🔍', text: 'Server-side source verification — players probe all providers for the exact title before opening, so dead sources are skipped instead of silently stalling.' },
      { label: '🧹', text: 'Ad-heavy providers demoted to last-resort; notorious popup sources removed entirely.' },
      { label: '4K', text: 'VidLink, Videasy, Vidking, and Vidfast lead the queue — all ad-free and 4K-capable, with HD/4K labels on every source button.' },
      { label: '↻', text: 'Automatic fallback chain: if a source fails mid-playback it is marked red and playback hops to the next healthy provider.' },
    ],
  },
];

// The newest entry drives the What's New badge in the nav.
export const LATEST_CHANGELOG = CHANGELOG[0];
export const CHANGELOG_SEEN_KEY = 'ms-changelog-seen';
