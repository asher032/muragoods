import type { MediaItem } from '../types';

// Sample catalog used ONLY when no TMDB credentials are configured (local
// dev without secrets — the Vercel CLI redacts secret values it pulls, so a
// plain `vercel env pull` cannot produce working keys). Production always
// uses real TMDB data. Ids and poster paths are real TMDB values (verified
// HTTP 200) so detail pages and deep links still resolve.
export const SAMPLE_MEDIA: MediaItem[] = [
  {
    id: 27205, mediaType: 'movie', title: 'Inception', year: '2010', voteAverage: 8.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
    overview: 'A thief who steals corporate secrets through dream-sharing technology.',
    genreIds: [28, 878],
  },
  {
    id: 155, mediaType: 'movie', title: 'The Dark Knight', year: '2008', voteAverage: 8.5,
    posterPath: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    overview: 'Batman raises the stakes in his war on crime — and meets the Joker.',
    genreIds: [28, 80],
  },
  {
    id: 157336, mediaType: 'movie', title: 'Interstellar', year: '2014', voteAverage: 8.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    overview: 'A team of explorers travel through a wormhole in space.',
    genreIds: [12, 18, 878],
  },
  {
    id: 278, mediaType: 'movie', title: 'The Shawshank Redemption', year: '1994', voteAverage: 8.7,
    posterPath: 'https://image.tmdb.org/t/p/w500/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/v8xVDqt8uCul3c3mgx4VpGCwxJC.jpg',
    overview: 'Two imprisoned men bond over a number of years.',
    genreIds: [18, 80],
  },
  {
    id: 603, mediaType: 'movie', title: 'The Matrix', year: '1999', voteAverage: 8.2,
    posterPath: 'https://image.tmdb.org/t/p/w500/bV9qTVHTVf0gkW0j7p7M0ILD4pG.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/lrtSb1skJayPydZk0OSMAKjBOVe.jpg',
    overview: 'A computer hacker learns what reality really is.',
    genreIds: [28, 878],
  },
  {
    id: 96102, mediaType: 'tv', title: 'Hospital Playlist', year: '2020', voteAverage: 8.6,
    posterPath: 'https://image.tmdb.org/t/p/w500/8MSjQkH2FrG0t4l84L5HmiSFrS7.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/gl6scQy8Klx9MEXNCLE86vhs24U.jpg',
    overview: 'Five doctors, longtime friends, work at the same hospital.',
    genreIds: [18], originalLanguage: 'ko',
  },
  {
    id: 128883, mediaType: 'tv', title: 'Hometown Cha-Cha-Cha', year: '2021', voteAverage: 8.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/en6lrlJ1DhyvkeZEqrk3R6EJz1p.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/2avhn5tACIdOp9F5EhNytbChJib.jpg',
    overview: 'A dentist moves to a seaside village and meets a handyman.',
    genreIds: [18, 10749], originalLanguage: 'ko',
  },
  {
    id: 94605, mediaType: 'tv', title: 'Arcane', year: '2021', voteAverage: 8.7,
    posterPath: 'https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/5cvnxEHT3e39DvT6ARw4GNCFrB0.jpg',
    overview: 'Two sisters on opposite sides of a war between utopian cities.',
    genreIds: [16, 10765, 10759],
  },
  {
    id: 1396, mediaType: 'tv', title: 'Breaking Bad', year: '2008', voteAverage: 8.9,
    posterPath: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    overview: 'A chemistry teacher turned meth manufacturer.',
    genreIds: [18, 80],
  },
  {
    id: 1399, mediaType: 'tv', title: 'Game of Thrones', year: '2011', voteAverage: 8.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',
    overview: 'Nine noble families wage war for the Iron Throne.',
    genreIds: [18, 10765],
  },
  {
    id: 475557, mediaType: 'movie', title: 'Joker', year: '2019', voteAverage: 8.1,
    posterPath: 'https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/rlay2M5QYvi6igbGcFjq8jxeusY.jpg',
    overview: 'A failed comedian spirals into madness in Gotham City.',
    genreIds: [80, 53],
  },
  {
    id: 4474, mediaType: 'movie', title: 'Guardians of the Galaxy', year: '2014', voteAverage: 8.1,
    posterPath: 'https://image.tmdb.org/t/p/w500/j4NCuEfLHzIjaWDns5fz6nGH2FD.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/lJkE6khRc6QRl54kem7VbsRkL05.jpg',
    overview: 'A band of intergalactic misfits join forces to stop a fanatical warrior.',
    genreIds: [28, 12, 35],
  },

  // ─── K-Dramas (ko) — real TMDB entries so the drama browse has variety ──
  {
    id: 93405, mediaType: 'tv', title: 'Squid Game', year: '2021', voteAverage: 7.9,
    posterPath: 'https://image.tmdb.org/t/p/w500/1QdXdRYfktUSONkl1oD5gc6Be0s.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/2meX1nMdScFOoV4370rqHWKmXhY.jpg',
    overview: 'Cash-strapped players accept a desperate invitation to deadly children\'s games.',
    genreIds: [10759, 9648, 18], originalLanguage: 'ko',
  },
  {
    id: 200709, mediaType: 'tv', title: 'Weak Hero', year: '2022', voteAverage: 8.7,
    posterPath: 'https://image.tmdb.org/t/p/w500/5Sd01WeraL2oA3Vv6O4rcRxockn.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/cLTAda6fMRirkCY1xfO4pmcHVkk.jpg',
    overview: 'A model student fights back against school violence with strategy over strength.',
    genreIds: [10759, 18], originalLanguage: 'ko',
  },
  {
    id: 246473, mediaType: 'tv', title: 'Made in Korea', year: '2025', voteAverage: 8.1,
    posterPath: 'https://image.tmdb.org/t/p/w500/cyBg9FJ2AmTWEGktA43gMo4t0Vj.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/3GmRS3efCTp6jumogKOxYBrV5mO.jpg',
    overview: 'An agent and a broker chase wealth and power through 1970s Korea\'s turmoil.',
    genreIds: [80, 18], originalLanguage: 'ko',
  },
  {
    id: 206693, mediaType: 'tv', title: 'My Dearest', year: '2023', voteAverage: 8.3,
    posterPath: 'https://image.tmdb.org/t/p/w500/d00uWx8T84ZRsguQTqITl3HnFJO.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/3MkrzqX1jog9ItFux72MvYyYfuT.jpg',
    overview: 'A Joseon noblewoman and a mysterious swordsman fall in love amid invasion.',
    genreIds: [18, 10768, 9648], originalLanguage: 'ko',
  },
  {
    id: 291496, mediaType: 'tv', title: 'Our Sticky Love', year: '2026', voteAverage: 8.7,
    posterPath: 'https://image.tmdb.org/t/p/w500/tSZ4aFpTGc8Oj52SuzPUUZ7WKL0.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/mp2AFsWsuyxCzenJh3DTKw7z4jG.jpg',
    overview: 'Two unlikely neighbours keep colliding — and keeps getting stickier.',
    genreIds: [18, 35], originalLanguage: 'ko',
  },
  {
    id: 276161, mediaType: 'tv', title: 'Teach You a Lesson', year: '2026', voteAverage: 9.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/fMECSPrTmRClSViMsXFYmiYIcWP.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/vyG93jhmPL7tBIhRtCLa5mdBKob.jpg',
    overview: 'An action-packed revenge drama set inside a school gone rotten.',
    genreIds: [10759, 18, 35], originalLanguage: 'ko',
  },

  // ─── C-Dramas (zh) ──────────────────────────────────────────────────────
  {
    id: 245292, mediaType: 'tv', title: 'The Spirealm', year: '2024', voteAverage: 8.9,
    posterPath: 'https://image.tmdb.org/t/p/w500/9fg3f2OW0yDnx6SfBWctYCs4ZU7.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/pmUWKAxTWyo9JsKQskECPpWwYrn.jpg',
    overview: 'A game designer enters a deadly supernatural realm he cannot log out of.',
    genreIds: [18, 9648, 35], originalLanguage: 'zh',
  },
  {
    id: 211089, mediaType: 'tv', title: 'Strange Tales of Tang Dynasty', year: '2022', voteAverage: 8.3,
    posterPath: 'https://image.tmdb.org/t/p/w500/nyhBueT07zQS7wWLYFDNO8LdO3N.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/8b5yXvmWSOl64Abk1wMYhzs4OnP.jpg',
    overview: 'A detective and a medic unravel supernatural crimes in Chang\'an.',
    genreIds: [9648, 80, 18, 10759], originalLanguage: 'zh',
  },
  {
    id: 249972, mediaType: 'tv', title: 'Blossom', year: '2024', voteAverage: 8.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/38WomXthArq5cKRfkHkxYRo6DLe.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/gtmkb7g4jMMhmnufsxkXtGEkcYk.jpg',
    overview: 'A noblewoman outwits her enemies through a second chance at life.',
    genreIds: [18], originalLanguage: 'zh',
  },
  {
    id: 106449, mediaType: 'tv', title: 'A Record of a Mortal\'s Journey to Immortality', year: '2020', voteAverage: 8.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/5JV6AfPMHbCrtB5oUhKkSiPARQ3.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/8NIvQY34tNPc4txNeym2zEYk9ek.jpg',
    overview: 'An ordinary boy climbs the treacherous path of immortal cultivation.',
    genreIds: [16, 10759, 18], originalLanguage: 'zh',
  },
  {
    id: 123542, mediaType: 'tv', title: 'LINK CLICK', year: '2021', voteAverage: 8.2,
    posterPath: 'https://image.tmdb.org/t/p/w500/wo9jwu5qMvXzhW2cyy5E6hOVs92.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/w3agwUSMpJ4X9t1jGrDtqqRPjDQ.jpg',
    overview: 'Two partners dive into photos to change the pasts of their clients.',
    genreIds: [16, 10765, 9648, 18], originalLanguage: 'zh',
  },
  {
    id: 124003, mediaType: 'tv', title: 'Perfect World', year: '2021', voteAverage: 8.2,
    posterPath: 'https://image.tmdb.org/t/p/w500/qy60bm9admmgpkmcPeW4BvRjjVm.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/qgTHKXeje3iInDXFaIBsIHpJQzu.jpg',
    overview: 'A young cultivator rises through a world of gods and ancient wars.',
    genreIds: [16, 10759], originalLanguage: 'zh',
  },

  // ─── J-Dramas (ja) ─────────────────────────────────────────────────────
  {
    id: 40663, mediaType: 'tv', title: 'AIBOU: Tokyo Detective Duo', year: '2002', voteAverage: 7.5,
    posterPath: 'https://image.tmdb.org/t/p/w500/8u8rCCeuBufMQ1VlGX0lruhDaPR.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/jWeEu0YRqYZNj0HpRWYnZU2MsHo.jpg',
    overview: 'Two mismatched detectives crack Tokyo\'s strangest cases together.',
    genreIds: [18, 80, 9648], originalLanguage: 'ja',
  },
  {
    id: 2661, mediaType: 'tv', title: 'Kamen Rider', year: '1971', voteAverage: 6.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/2DIBDFHiKQawz4WPsYekl9DHwyA.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/usLRh1bcbL0Q9X8zf6rL4OV1qrA.jpg',
    overview: 'A cyborg hero fights the organization that remade him.',
    genreIds: [10759, 10765, 18], originalLanguage: 'ja',
  },
  {
    id: 30984, mediaType: 'tv', title: 'Bleach', year: '2004', voteAverage: 8.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/2EewmxXe72ogD0EaWM8gqa0ccIw.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/o0NsbcIvsllg6CJX0FBFY8wWbsn.jpg',
    overview: 'A teenager gains soul-reaper powers and defends the living world.',
    genreIds: [10759, 16, 10765], originalLanguage: 'ja',
  },
  {
    id: 94664, mediaType: 'tv', title: 'Mushoku Tensei: Jobless Reincarnation', year: '2021', voteAverage: 8.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/gLKOYIMyKlUHW0SVdskhgf9C0yy.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/j9fRIimor0AMFJR9kjZubXcABzZ.jpg',
    overview: 'A reborn man relives life from childhood in a world of magic.',
    genreIds: [10759, 16, 10765], originalLanguage: 'ja',
  },
  {
    id: 65942, mediaType: 'tv', title: 'Re:ZERO -Starting Life in Another World-', year: '2016', voteAverage: 8.1,
    posterPath: 'https://image.tmdb.org/t/p/w500/oHqYrPAsIiTD5m4DuxumV4er8BU.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/7ZruEnSnHD6Jx5mF0hBt1E306Vt.jpg',
    overview: 'A trapped teen dies repeatedly, returning each time to the same moment.',
    genreIds: [16, 9648, 10759, 10765], originalLanguage: 'ja',
  },
  {
    id: 207468, mediaType: 'tv', title: 'Kaiju No. 8', year: '2024', voteAverage: 8.4,
    posterPath: 'https://image.tmdb.org/t/p/w500/83yDUQVpdhv8ePy3nbTRzFaKYuQ.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/htGeuCcNhlBe8GTx3izKOsd8frw.jpg',
    overview: 'A kaiju-cleanup worker becomes a monster himself — the first human one.',
    genreIds: [16, 10759, 10765], originalLanguage: 'ja',
  },
];
