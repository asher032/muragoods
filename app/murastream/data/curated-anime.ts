// Curated anime catalog — used as fallback when Jikan API is slow/down
// These are well-known, popular anime titles organized by category
// eslint-disable-next-line @typescript-eslint/no-explicit-any

const IMG = 'https://image.tmdb.org/t/p/w500';

export const CURATED_ANIME: (Record<string, any> & { id: number; title: string; categories: string[] })[] = [
  // ─── ACTION ────────────────────────────────────────
  {
    id: 16498, title: 'Attack on Titan', mediaType: 'tv', overview: 'Centuries ago, mankind was slaughtered to near extinction by monstrous humanoid creatures called Titans, forcing humans to hide in fear behind enormous concentric walls.',
    posterPath: `${IMG}/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg`, backdropPath: `${IMG}/sIRK4NYsVnIThA0rTIxYmdMaLiA.jpg`, voteAverage: 8.5, year: '2013', genres: ['Action', 'Drama', 'Fantasy'], releaseDate: '2013-04-07', originalLanguage: 'ja', episodes: 87, status: 'Finished Airing', score: 8.54, studios: ['Wit Studio', 'MAPPA'], hasSub: true, hasDub: true, categories: ['action', 'trending', 'top'],
  },
  {
    id: 5114, title: 'Fullmetal Alchemist: Brotherhood', mediaType: 'tv', overview: 'After a horrific alchemy experiment goes wrong in the Elric household, brothers Edward and Alphonse are left in a catastrophic new reality.',
    posterPath: `${IMG}/mFdFnkzGNQVBUDjKrN1XvqQQtjB.jpg`, backdropPath: `${IMG}/2W4ZM7Wim3DLVN1g4RZXn6bHQ8S.jpg`, voteAverage: 8.7, year: '2009', genres: ['Action', 'Adventure', 'Drama'], releaseDate: '2009-04-05', originalLanguage: 'ja', episodes: 64, status: 'Finished Airing', score: 8.71, studios: ['Bones'], hasSub: true, hasDub: true, categories: ['action', 'top'],
  },
  {
    id: 31964, title: 'Jujutsu Kaisen', mediaType: 'tv', overview: 'A boy swallows a cursed talisman - the finger of a demon - and becomes possessed, enrolling in a school of sorcerers to find the demon\'s other parts.',
    posterPath: `${IMG}/fHnXbutterrCd5no3EYKfvpjZYU.jpg`, backdropPath: `${IMG}/dQFhpMRbWyDfBklmxAWGhJ9yDxO.jpg`, voteAverage: 8.6, year: '2020', genres: ['Action', 'Fantasy', 'Supernatural'], releaseDate: '2020-10-03', originalLanguage: 'ja', episodes: 47, status: 'Currently Airing', score: 8.62, studios: ['MAPPA'], hasSub: true, hasDub: true, categories: ['action', 'trending'],
  },
  {
    id: 41467, title: 'Demon Slayer: Kimetsu no Yaiba', mediaType: 'tv', overview: 'Ever since the death of his father, the burden of supporting the family has fallen upon Tanjirou Kamado\'s shoulders.',
    posterPath: `${IMG}/wrCVHdkBlBWdJUZPvnxe0XhmnhZ.jpg`, backdropPath: `${IMG}/5DUMPBSnHOZsbhLDnWKIHyGZPvO.jpg`, voteAverage: 8.7, year: '2019', genres: ['Action', 'Fantasy', 'Supernatural'], releaseDate: '2019-04-06', originalLanguage: 'ja', episodes: 55, status: 'Currently Airing', score: 8.71, studios: ['ufotable'], hasSub: true, hasDub: true, categories: ['action', 'trending', 'top'],
  },
  {
    id: 30276, title: 'One Punch Man', mediaType: 'tv', overview: 'The seemingly unimpressive Saitama has a rather unique hobby: being a hero.',
    posterPath: `${IMG}/iZ5bVnaKUhMPMfCkNTMi4dwxjMd.jpg`, backdropPath: `${IMG}/meeoG8LzEhJQsdl7KekkJCZKDU.jpg`, voteAverage: 8.4, year: '2015', genres: ['Action', 'Comedy', 'Sci-Fi'], releaseDate: '2015-10-05', originalLanguage: 'ja', episodes: 24, status: 'Finished Airing', score: 8.42, studios: ['Madhouse'], hasSub: true, hasDub: true, categories: ['action', 'comedy'],
  },
  // ─── ADVENTURE ────────────────────────────────────
  {
    id: 21, title: 'One Piece', mediaType: 'tv', overview: 'Gol D. Roger was known as the Pirate King, the strongest and most infamous being to have sailed the Grand Line.',
    posterPath: `${IMG}/cMD9Ygz11zjJzAovURpO75Qg7rT.jpg`, backdropPath: `${IMG}/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg`, voteAverage: 8.7, year: '1999', genres: ['Action', 'Adventure', 'Comedy'], releaseDate: '1999-10-20', originalLanguage: 'ja', episodes: 1100, status: 'Currently Airing', score: 8.71, studios: ['Toei Animation'], hasSub: true, hasDub: true, categories: ['adventure', 'top', 'trending'],
  },
  {
    id: 35964, title: 'The Rising of the Shield Hero', mediaType: 'tv', overview: 'Iwatani Naofumi, a laid-back university student, is summoned to a parallel world along with three other heroes.',
    posterPath: `${IMG}/mFb0t1fcaXV0RJRqE3SLnS3EMDt.jpg`, backdropPath: `${IMG}/c5IxfZ8D5mDxBmvqKlMVYVljwxm.jpg`, voteAverage: 7.6, year: '2019', genres: ['Action', 'Adventure', 'Fantasy'], releaseDate: '2019-01-09', originalLanguage: 'ja', episodes: 50, status: 'Finished Airing', score: 7.59, studios: ['Kinema Citrus'], hasSub: true, hasDub: true, categories: ['adventure', 'isekai'],
  },
  {
    id: 38197, title: 'Somali and the Forest Spirit', mediaType: 'tv', overview: 'In a world inhabited by mystical creatures, a golem and a young human girl set off on a journey.',
    posterPath: `${IMG}/kE0sDwaw3K8kYgLYsLkYGtOOjUh.jpg`, backdropPath: `${IMG}/3JYmHBIpM39VqMFVT7gVPjS1eJA.jpg`, voteAverage: 7.8, year: '2020', genres: ['Adventure', 'Fantasy', 'Slice of Life'], releaseDate: '2020-01-09', originalLanguage: 'ja', episodes: 12, status: 'Finished Airing', score: 7.76, studios: ['Sasayori'], hasSub: true, hasDub: false, categories: ['adventure', 'fantasy'],
  },
  // ─── COMEDY ────────────────────────────────────────
  {
    id: 30276, title: 'One Punch Man', mediaType: 'tv', overview: 'The seemingly unimpressive Saitama has a rather unique hobby: being a hero.', posterPath: `${IMG}/iZ5bVnaKUhMPMfCkNTMi4dwxjMd.jpg`, backdropPath: `${IMG}/meeoG8LzEhJQsdl7KekkJCZKDU.jpg`, voteAverage: 8.4, year: '2015', genres: ['Action', 'Comedy', 'Sci-Fi'], releaseDate: '2015-10-05', originalLanguage: 'ja', episodes: 24, status: 'Finished Airing', score: 8.42, studios: ['Madhouse'], hasSub: true, hasDub: true, categories: ['comedy'],
  },
  {
    id: 40779, title: 'Konosuba: God\'s Blessing on This Wonderful World!', mediaType: 'tv', overview: 'After dying a laughable death in a traffic accident, Kazuma Satou finds himself sitting before a beautiful but obnoxious goddess.',
    posterPath: `${IMG}/eBdUdYKI0Ut3hPbdhoPYIin5IhS.jpg`, backdropPath: `${IMG}/kKgQzkUCnQmeTPkyIwHly2t6ZFI.jpg`, voteAverage: 8.1, year: '2016', genres: ['Adventure', 'Comedy', 'Fantasy'], releaseDate: '2016-01-14', originalLanguage: 'ja', episodes: 20, status: 'Finished Airing', score: 8.11, studios: ['Studio Deen'], hasSub: true, hasDub: true, categories: ['comedy', 'isekai'],
  },
  {
    id: 31478, title: 'Kaguya-sama: Love is War', mediaType: 'tv', overview: 'At the prestigious Shuchiin Academy, Miyuki Shirogane and Kaguya Shinomiya seem perfect for each other.',
    posterPath: `${IMG}/5dWWQI5LaNVhSjKkZbRPgi6PmDG.jpg`, backdropPath: `${IMG}/9WQ9tXGbgJBOjjK9brfC10Sr6Y9.jpg`, voteAverage: 8.4, year: '2019', genres: ['Comedy', 'Romance'], releaseDate: '2019-01-12', originalLanguage: 'ja', episodes: 37, status: 'Finished Airing', score: 8.36, studios: ['A-1 Pictures'], hasSub: true, hasDub: true, categories: ['comedy', 'romance'],
  },
  {
    id: 23413, title: 'Saiki K. Desires Being Reborn', mediaType: 'tv', overview: 'Kusuo Saiki has had psychic powers since he was born — and they\'re way more trouble than they\'re worth.',
    posterPath: `${IMG}/pB6n7jFwjUm2d2gTUMMqKNgqVhD.jpg`, backdropPath: `${IMG}/4KyJhMoWGcOq5YdZcVKYdRG0WPB.jpg`, voteAverage: 8.3, year: '2016', genres: ['Comedy', 'Supernatural'], releaseDate: '2016-07-04', originalLanguage: 'ja', episodes: 120, status: 'Finished Airing', score: 8.33, studios: ['J.C.Staff'], hasSub: true, hasDub: true, categories: ['comedy'],
  },
  {
    id: 38000, title: 'KonoSuba: Legend of Crimson', mediaType: 'tv', overview: 'After a brief return to the fantasy world, Kazuma and his party face new threats.', posterPath: `${IMG}/h8RnsZTkEEqFhMrQq5eKfDUPLVj.jpg`, backdropPath: `${IMG}/kKgQzkUCnQmeTPkyIwHly2t6ZFI.jpg`, voteAverage: 8.0, year: '2017', genres: ['Adventure', 'Comedy', 'Fantasy'], releaseDate: '2017-01-12', originalLanguage: 'ja', episodes: 10, status: 'Finished Airing', score: 8.0, studios: ['Studio Deen'], hasSub: true, hasDub: true, categories: ['comedy', 'isekai'],
  },
  // ─── ROMANCE ───────────────────────────────────────
  {
    id: 11757, title: 'Your Lie in April', mediaType: 'tv', overview: 'Kousei Arima is a piano prodigy who lost the ability to hear the piano after his mother\'s death.',
    posterPath: `${IMG}/y2G2TeYPFGvfqWh5YlM1aGNmCCd.jpg`, backdropPath: `${IMG}/x8L48NDq3JDNQbPkjMIwEPX0WQE.jpg`, voteAverage: 8.7, year: '2014', genres: ['Drama', 'Music', 'Romance'], releaseDate: '2014-10-10', originalLanguage: 'ja', episodes: 22, status: 'Finished Airing', score: 8.68, studios: ['A-1 Pictures'], hasSub: true, hasDub: true, categories: ['romance', 'top'],
  },
  {
    id: 43608, title: 'Horimiya', mediaType: 'tv', overview: 'On the surface, Kyouko Hori is a brilliant and popular high school student. But at home, she\'s a different person.',
    posterPath: `${IMG}/jSPRfOjqL5WFPelzdWFPai3R56I.jpg`, backdropPath: `${IMG}/mL8FhBKjQf9EYg9NOgix2fJE38S.jpg`, voteAverage: 8.2, year: '2021', genres: ['Comedy', 'Romance', 'Slice of Life'], releaseDate: '2021-01-10', originalLanguage: 'ja', episodes: 13, status: 'Finished Airing', score: 8.15, studios: ['CloverWorks'], hasSub: true, hasDub: true, categories: ['romance'],
  },
  {
    id: 45620, title: 'My Dress-Up Darling', mediaType: 'tv', overview: 'Wakana Gojou is a high school student who overcomes a traumatic past and discovers a new friend in Marin Kitagawa.',
    posterPath: `${IMG}/hS3ggIy2v8nDw2C31EhX2V5JlPr.jpg`, backdropPath: `${IMG}/jXV7aOINQnZjhBIPFcoTIHyNcDF.jpg`, voteAverage: 8.4, year: '2022', genres: ['Comedy', 'Romance'], releaseDate: '2022-01-09', originalLanguage: 'ja', episodes: 12, status: 'Finished Airing', score: 8.39, studios: ['CloverWorks'], hasSub: true, hasDub: true, categories: ['romance', 'trending'],
  },
  {
    id: 18507, title: 'Toradora!', mediaType: 'tv', overview: 'Ryuuji Takasu is a gentle guy whose appearance scares people. Taiga Aisaka is a tiny girl with a violent personality.',
    posterPath: `${IMG}/2d2vY8qfKgXbHp2Vq40IfsBnG7.jpg`, backdropPath: `${IMG}/iKdE9VY8dJlWNjw8aJw4cKjS4uB.jpg`, voteAverage: 8.2, year: '2008', genres: ['Comedy', 'Drama', 'Romance'], releaseDate: '2008-10-02', originalLanguage: 'ja', episodes: 25, status: 'Finished Airing', score: 8.22, studios: ['J.C.Staff'], hasSub: true, hasDub: true, categories: ['romance'],
  },
  // ─── FANTASY ───────────────────────────────────────
  {
    id: 38145, title: 'Mushoku Tensei: Jobless Reincarnation', mediaType: 'tv', overview: 'A 34-year-old NEET is reincarnated into a fantasy world and decides to make the most of his second chance at life.',
    posterPath: `${IMG}/g3FfJYGnSmKblMdM0M9vBvL5lGM.jpg`, backdropPath: `${IMG}/q5HzsR6FPnM7F2Psr5TqCzjb3k0.jpg`, voteAverage: 8.3, year: '2021', genres: ['Adventure', 'Drama', 'Fantasy'], releaseDate: '2021-01-11', originalLanguage: 'ja', episodes: 37, status: 'Finished Airing', score: 8.33, studios: ['Studio Bind'], hasSub: true, hasDub: true, categories: ['fantasy', 'isekai', 'trending'],
  },
  {
    id: 22319, title: 'Fate/Zero', mediaType: 'tv', overview: 'The Holy Grail War is a battle royale among seven mages who summon seven heroic spirits to compete for the Holy Grail.',
    posterPath: `${IMG}/jXRHhTRDFnjDIUFkfpFnh1TiKxW.jpg`, backdropPath: `${IMG}/qHxCwZ1FMr2vHOk3WcSPsPqJ0bS.jpg`, voteAverage: 8.2, year: '2011', genres: ['Action', 'Fantasy', 'Supernatural'], releaseDate: '2011-10-02', originalLanguage: 'ja', episodes: 13, status: 'Finished Airing', score: 8.24, studios: ['ufotable'], hasSub: true, hasDub: true, categories: ['fantasy', 'action'],
  },
  {
    id: 12445, title: 'Sword Art Online', mediaType: 'tv', overview: 'In the year 2022, gamers rejoice as Sword Art Online, a VRMMORPG, launches.',
    posterPath: `${IMG}/yqEYxsH3g7StFxndtSfey8YYlnM.jpg`, backdropPath: `${IMG}/49NnWBCfzUkA6JXDnJjGl5O28zF.jpg`, voteAverage: 7.2, year: '2012', genres: ['Action', 'Adventure', 'Fantasy'], releaseDate: '2012-07-08', originalLanguage: 'ja', episodes: 96, status: 'Finished Airing', score: 7.24, studios: ['A-1 Pictures'], hasSub: true, hasDub: true, categories: ['fantasy', 'action'],
  },
  // ─── ISEKAI ────────────────────────────────────────
  {
    id: 46848, title: 'Oshi no Ko', mediaType: 'tv', overview: 'Aimed at combining their talents, Ai Hoshino and Gorou Hoshiemi form an unlikely partnership that leads them into a world of idol culture, entertainment, and personal drama.',
    posterPath: `${IMG}/x4SrO77HEzEaYOdNqE5Hq3G1KLj.jpg`, backdropPath: `${IMG}/8gZVCYav1ldg0U5f2wEq3CPJwm5.jpg`, voteAverage: 8.6, year: '2023', genres: ['Drama', 'Mystery', 'Supernatural'], releaseDate: '2023-04-12', originalLanguage: 'ja', episodes: 11, status: 'Currently Airing', score: 8.64, studios: ['Doga Kobo'], hasSub: true, hasDub: true, categories: ['trending', 'top'],
  },
  {
    id: 52991, title: 'Solo Leveling', mediaType: 'tv', overview: 'In a world where hunters — human warriors who possess magical abilities — must battle deadly monsters, Sung Jinwoo finds himself the weakest hunter of all.',
    posterPath: `${IMG}/geCRueV3ElhRTr0xtJuEWJt6dJ1.jpg`, backdropPath: `${IMG}/mX3VJhWnGAgS9PnqBauMIYd7ArF.jpg`, voteAverage: 8.4, year: '2024', genres: ['Action', 'Adventure', 'Fantasy'], releaseDate: '2024-01-07', originalLanguage: 'ko', episodes: 12, status: 'Finished Airing', score: 8.38, studios: ['A-1 Pictures'], hasSub: true, hasDub: true, categories: ['trending', 'top', 'action'],
  },
  {
    id: 45615, title: 'Jobless Reincarnation Season 2', mediaType: 'tv', overview: 'Rudeus Greyrat continues his journey of self-discovery and growth in a new world.', posterPath: `${IMG}/g3FfJYGnSmKblMdM0M9vBvL5lGM.jpg`, backdropPath: `${IMG}/q5HzsR6FPnM7F2Psr5TqCzjb3k0.jpg`, voteAverage: 8.4, year: '2023', genres: ['Adventure', 'Fantasy'], releaseDate: '2023-07-02', originalLanguage: 'ja', episodes: 25, status: 'Finished Airing', score: 8.42, studios: ['Studio Bind'], hasSub: true, hasDub: true, categories: ['isekai', 'fantasy'],
  },
  // ─── SPORTS ────────────────────────────────────────
  {
    id: 32180, title: 'Haikyuu!!', mediaType: 'tv', overview: 'A volleyball-obsessed teenager joins his school volleyball team and aims to become the best player.',
    posterPath: `${IMG}/z25HpMFViB1tXM59nLkOLSoA8bC.jpg`, backdropPath: `${IMG}/4KkzJe6SCFBkGACU9Y9XPH4Y2bM.jpg`, voteAverage: 8.5, year: '2014', genres: ['Comedy', 'Drama', 'Sports'], releaseDate: '2014-04-06', originalLanguage: 'ja', episodes: 85, status: 'Finished Airing', score: 8.51, studios: ['Production I.G'], hasSub: true, hasDub: true, categories: ['sports', 'top'],
  },
  {
    id: 37633, title: 'Blue Lock', mediaType: 'tv', overview: 'After a disastrous defeat at the 2018 World Cup, Japan\'s team struggles to regroup. But what\'s missing is an absolute Ace Striker.',
    posterPath: `${IMG}/gSqCxiFFJMq8Yco4rYVYEOuNRvf.jpg`, backdropPath: `${IMG}/29q0EkJL7UM0qPqwjHPfFGLmxBh.jpg`, voteAverage: 8.0, year: '2022', genres: ['Drama', 'Sports'], releaseDate: '2022-10-09', originalLanguage: 'ja', episodes: 24, status: 'Finished Airing', score: 8.03, studios: ['8bit'], hasSub: true, hasDub: true, categories: ['sports', 'trending'],
  },
  {
    id: 35507, title: 'Kuroko\'s Basketball', mediaType: 'tv', overview: 'The Teppei Basketball Club has finally begun to make a name for itself within the Inter-High preliminaries.',
    posterPath: `${IMG}/jCjWKKjRmdYSuyJbYfYGsDkKMWV.jpg`, backdropPath: `${IMG}/w37YDb4NA0rM1yUVqRjJJNPjXrJ.jpg`, voteAverage: 7.9, year: '2012', genres: ['Comedy', 'Sports'], releaseDate: '2012-04-07', originalLanguage: 'ja', episodes: 75, status: 'Finished Airing', score: 7.94, studios: ['Production I.G'], hasSub: true, hasDub: true, categories: ['sports'],
  },
  // ─── SCHOOL / SLICE OF LIFE ───────────────────────
  {
    id: 14253, title: 'K-ON!', mediaType: 'tv', overview: 'The story follows the members of the light music club of Sakuragaoka Girls\' High School.',
    posterPath: `${IMG}/kIr3pVCARdCijJLrPJvE7G0TRBf.jpg`, backdropPath: `${IMG}/oqE8jJWqWc0rGCpBqHdXNnRsMaC.jpg`, voteAverage: 7.9, year: '2009', genres: ['Comedy', 'Music', 'Slice of Life'], releaseDate: '2009-04-03', originalLanguage: 'ja', episodes: 39, status: 'Finished Airing', score: 7.87, studios: ['Kyoto Animation'], hasSub: true, hasDub: true, categories: ['school', 'slice_of_life'],
  },
  {
    id: 28125, title: 'Silver Spoon', mediaType: 'tv', overview: 'Yuugo Hachiken is a shy boy from the city who enrolls in an agricultural boarding school in Hokkaido.',
    posterPath: `${IMG}/kYaFIFsSsMlaQK1kLFPAPjYFjwT.jpg`, backdropPath: `${IMG}/7FqFM8S3u3f4pEFKP5fOqMF3FjM.jpg`, voteAverage: 7.7, year: '2013', genres: ['Comedy', 'Drama', 'Slice of Life'], releaseDate: '2013-07-12', originalLanguage: 'ja', episodes: 22, status: 'Finished Airing', score: 7.72, studios: ['A-1 Pictures'], hasSub: true, hasDub: true, categories: ['school', 'slice_of_life'],
  },
  {
    id: 35555, title: 'Spy x Family', mediaType: 'tv', overview: 'Master spy Twilight is unparalleled when it comes to going undercover on dangerous missions.',
    posterPath: `${IMG}/3Pdv3MIkzMvla4SiE8qP2psjQEk.jpg`, backdropPath: `${IMG}/pBjfMq27wbaZ5AQ0b1r0JqqM8J3.jpg`, voteAverage: 8.4, year: '2022', genres: ['Action', 'Comedy'], releaseDate: '2022-04-09', originalLanguage: 'ja', episodes: 37, status: 'Currently Airing', score: 8.42, studios: ['Wit Studio', 'CloverWorks'], hasSub: true, hasDub: true, categories: ['trending', 'comedy', 'action'],
  },
  {
    id: 49624, title: 'Frieren: Beyond Journey\'s End', mediaType: 'tv', overview: 'After the party of heroes defeated the Demon King, they restored peace to the land and returned to lives of solitude.',
    posterPath: `${IMG}/dqZENchTd7lp5zht3Tm5CEpQjxp.jpg`, backdropPath: `${IMG}/l6s4CqGXqMxPDbqa0LDnBMSP4g0.jpg`, voteAverage: 8.7, year: '2023', genres: ['Adventure', 'Drama', 'Fantasy'], releaseDate: '2023-09-29', originalLanguage: 'ja', episodes: 28, status: 'Finished Airing', score: 8.73, studios: ['Madhouse'], hasSub: true, hasDub: true, categories: ['top', 'trending', 'fantasy'],
  },
];

// Deduplicate by id
const seen = new Set<number>();
export const DEDUPED_ANIME = CURATED_ANIME.filter(a => {
  if (seen.has(a.id)) return false;
  seen.add(a.id);
  return true;
});
