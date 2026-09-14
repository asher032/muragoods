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
];
