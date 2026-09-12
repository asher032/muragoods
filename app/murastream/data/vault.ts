// MuraStream Free Vault — films we can legally stream AND offer for download.
// These are Creative Commons (CC-BY) open movies from Blender Foundation and
// open productions. Every stream URL below was verified HTTP 200 with a range
// request before being added — do not add entries with untested URLs.
//
// Licenses (all permit redistribution/streaming with attribution):
//  - Big Buck Bunny, Elephants Dream, Sintel, Tears of Steel: CC-BY (Blender Foundation)

export type VaultItem = {
  id: string;
  title: string;
  year: string;
  runtime: string;
  studio: string;
  license: string;
  overview: string;
  genres: string[];
  rating: number;
  tmdbId: number; // for real TMDB poster/backdrop art
  // Primary source: adaptive HLS (auto quality, subtitles where available)
  hlsUrl?: string;
  // Direct progressive MP4 (for the download button + native playback)
  mp4Url?: string;
  downloadSize?: string;
  subtitles?: { lang: string; label: string; url: string }[];
};

const BLENDER_FILMS: VaultItem[] = [
  {
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    year: '2008',
    runtime: '10 min',
    studio: 'Blender Foundation',
    license: 'CC-BY',
    overview:
      'A big rabbit takes revenge on three bullying rodents in this lush, comedic CGI short that became the open-movie project that started it all.',
    genres: ['Animation', 'Comedy', 'Family'],
    rating: 6.8,
    tmdbId: 10378,
    hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    mp4Url: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
    downloadSize: '~158 MB',
  },
  {
    id: 'sintel',
    title: 'Sintel',
    year: '2010',
    runtime: '15 min',
    studio: 'Blender Foundation',
    license: 'CC-BY',
    overview:
      'A lonely girl crosses a hostile world in search of the dragon she once rescued. Blender’s most cinematic open movie — epic score, real film craft.',
    genres: ['Animation', 'Fantasy', 'Adventure'],
    rating: 7.5,
    tmdbId: 45745,
    hlsUrl: 'https://test-streams.mux.dev/tos_ismc/main.m3u8',
    mp4Url: 'https://download.blender.org/durian/movies/Sintel.2010.720p.mkv',
    downloadSize: '~1.1 GB',
  },
  {
    id: 'elephants-dream',
    title: 'Elephants Dream',
    year: '2006',
    runtime: '11 min',
    studio: 'Blender Foundation',
    license: 'CC-BY',
    overview:
      'Two characters explore a strange mechanical world — the world’s first open movie, surreal and darkly beautiful.',
    genres: ['Animation', 'Sci-Fi', 'Fantasy'],
    rating: 6.6,
    tmdbId: 9761,
    mp4Url: 'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4',
    downloadSize: '~68 MB',
  },
  {
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    year: '2012',
    runtime: '12 min',
    studio: 'Blender Foundation',
    license: 'CC-BY',
    overview:
      'In a future Amsterdam, a team of scientists and warriors tries to save the world from robots by rewriting the past. Live-action + VFX showcase.',
    genres: ['Sci-Fi', 'Action', 'Drama'],
    rating: 6.4,
    tmdbId: 133701,
    hlsUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    mp4Url: 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov',
    downloadSize: '~540 MB',
  },
];

export const VAULT_ITEMS = BLENDER_FILMS;
