// MuraStream — Streaming Source Providers
// Adapted from Streambert's PLAYER_SOURCES for browser-based iframes

export interface StreamingSource {
  id: string;
  label: string;
  tag?: string; // e.g. 'ANIME'
  movieUrl: (id: number) => string;
  tvUrl: (id: number, season: number, episode: number) => string;
  animeUrl?: (id: number, episode: number) => string;
  colorParam?: string;
  langParam?: string;
  params?: Record<string, string>;
}

const NEXSTREAM_KEY = process.env.NEXTSTREAM_API_KEY || '';

export const STREAMING_SOURCES: StreamingSource[] = [
  {
    id: 'nexstream',
    label: 'NexStream',
    movieUrl: (id) => `https://api.codespecters.com/embed/movie/${id}?apikey=${NEXSTREAM_KEY}`,
    tvUrl: (id, season, ep) => `https://api.codespecters.com/embed/tv/${id}/${season}/${ep}?apikey=${NEXSTREAM_KEY}`,
  },
  {
    id: 'videasy',
    label: 'Videasy',
    colorParam: 'color',
    params: { overlay: 'true' },
    movieUrl: (id) => `https://player.videasy.to/movie/${id}`,
    tvUrl: (id, season, ep) => `https://player.videasy.to/tv/${id}/${season}/${ep}`,
  },
  {
    id: 'vidsrc',
    label: 'VidSrc',
    langParam: 'ds_lang',
    movieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tvUrl: (id, season, ep) => `https://vidsrc.to/embed/tv/${id}/${season}/${ep}`,
  },
  {
    id: 'vidking',
    label: 'Vidking',
    colorParam: 'color',
    params: { autoPlay: 'true' },
    movieUrl: (id) => `https://www.vidking.net/embed/movie/${id}`,
    tvUrl: (id, season, ep) => `https://www.vidking.net/embed/tv/${id}/${season}/${ep}`,
  },
];

export function getSourceUrl(
  sourceId: string,
  type: 'movie' | 'tv',
  id: number,
  season?: number,
  episode?: number,
  accentColor?: string,
  subtitleLang?: string,
): string {
  const source = STREAMING_SOURCES.find(s => s.id === sourceId) || STREAMING_SOURCES[0];
  const baseUrl = type === 'movie' ? source.movieUrl(id) : source.tvUrl(id, season || 1, episode || 1);
  const url = new URL(baseUrl);

  if (source.params) {
    Object.entries(source.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  if (accentColor && source.colorParam) {
    url.searchParams.set(source.colorParam, accentColor.replace(/^#/, ''));
  }
  if (subtitleLang && source.langParam) {
    url.searchParams.set(source.langParam, subtitleLang);
  }

  return url.toString();
}

export function getSourceById(id: string): StreamingSource | undefined {
  return STREAMING_SOURCES.find(s => s.id === id);
}

export function getDefaultSource(): StreamingSource {
  return STREAMING_SOURCES[0]; // Videasy
}
