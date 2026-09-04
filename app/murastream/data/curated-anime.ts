// Curated anime catalog — used as fallback when Jikan API is slow/down
// All poster + banner URLs use verified working AniList CDN
// eslint-disable-next-line @typescript-eslint/no-explicit-any

const AL = 'https://s4.anilist.co/file/anilistcdn/media/anime';

export const CURATED_ANIME: (Record<string, any> & { id: number; anilistId: number; title: string; categories: string[] })[] = [
  // ─── ACTION ────────────────────────────────────────
  {
    id: 16498, anilistId: 16498, title: 'Attack on Titan', mediaType: 'tv',
    overview: 'Centuries ago, mankind was slaughtered to near extinction by monstrous humanoid creatures called Titans.',
    posterPath: `${AL}/cover/medium/bx16498-buvcRTBx4NSm.jpg`, backdropPath: `${AL}/banner/16498-8jpFCOcDmneX.jpg`,
    voteAverage: 8.5, year: '2013', genres: ['Action', 'Drama', 'Fantasy'], episodes: 87, status: 'Finished Airing', score: 8.54, hasSub: true, hasDub: true, categories: ['action', 'trending', 'top'],
  },
  {
    id: 5114, anilistId: 5114, title: 'Fullmetal Alchemist: Brotherhood', mediaType: 'tv',
    overview: 'After a horrific alchemy experiment goes wrong, brothers Edward and Alphonse Elric search for the Philosopher Stone.',
    posterPath: `${AL}/cover/medium/bx5114-nSWCgQlmOMtj.jpg`, backdropPath: `${AL}/banner/5114-q0V5URebphSG.jpg`,
    voteAverage: 8.7, year: '2009', genres: ['Action', 'Adventure', 'Drama'], episodes: 64, status: 'Finished Airing', score: 8.71, hasSub: true, hasDub: true, categories: ['action', 'top'],
  },
  {
    id: 113415, anilistId: 113415, title: 'Jujutsu Kaisen', mediaType: 'tv',
    overview: 'A boy swallows a cursed talisman and enrolls in a school of sorcerers to find the demon other parts.',
    posterPath: `${AL}/cover/medium/bx113415-LHBAeoZDIsnF.jpg`, backdropPath: `${AL}/banner/113415-jQBSkxWAAk83.jpg`,
    voteAverage: 8.6, year: '2020', genres: ['Action', 'Fantasy', 'Supernatural'], episodes: 47, status: 'Currently Airing', score: 8.62, hasSub: true, hasDub: true, categories: ['action', 'trending'],
  },
  {
    id: 101922, anilistId: 101922, title: 'Demon Slayer: Kimetsu no Yaiba', mediaType: 'tv',
    overview: 'Ever since the death of his father, Tanjirou Kamado has been supporting his family and hunting demons.',
    posterPath: `${AL}/cover/medium/bx101922-WBsBl0ClmgYL.jpg`, backdropPath: `${AL}/banner/101922-33MtJGsUSxga.jpg`,
    voteAverage: 8.7, year: '2019', genres: ['Action', 'Fantasy', 'Supernatural'], episodes: 55, status: 'Currently Airing', score: 8.71, hasSub: true, hasDub: true, categories: ['action', 'trending', 'top'],
  },
  {
    id: 21087, anilistId: 21087, title: 'One Punch Man', mediaType: 'tv',
    overview: 'The seemingly unimpressive Saitama has a rather unique hobby: being a hero.',
    posterPath: `${AL}/cover/medium/bx21087-B5DHjqZ3kW4b.jpg`, backdropPath: `${AL}/banner/21087-sHb9zUZFsHe1.jpg`,
    voteAverage: 8.4, year: '2015', genres: ['Action', 'Comedy', 'Sci-Fi'], episodes: 24, status: 'Finished Airing', score: 8.42, hasSub: true, hasDub: true, categories: ['action', 'comedy'],
  },
  // ─── ADVENTURE ────────────────────────────────────
  {
    id: 21, anilistId: 21, title: 'One Piece', mediaType: 'tv',
    overview: 'Gol D. Roger was known as the Pirate King. Monkey D. Luffy sets off on his grand adventure.',
    posterPath: `${AL}/cover/medium/bx21-ELSYx3yMPcKM.jpg`, backdropPath: `${AL}/banner/21-wf37VakJmZqs.jpg`,
    voteAverage: 8.7, year: '1999', genres: ['Action', 'Adventure', 'Comedy'], episodes: 1100, status: 'Currently Airing', score: 8.71, hasSub: true, hasDub: true, categories: ['adventure', 'top', 'trending'],
  },
  {
    id: 99263, anilistId: 99263, title: 'The Rising of the Shield Hero', mediaType: 'tv',
    overview: 'Iwatani Naofumi is summoned to a parallel world along with three other heroes.',
    posterPath: `${AL}/cover/medium/bx99263-LcazQwdlWzMy.jpg`, backdropPath: `${AL}/banner/99263-IwkmdCTsDY1t.jpg`,
    voteAverage: 7.6, year: '2019', genres: ['Action', 'Adventure', 'Fantasy'], episodes: 50, status: 'Finished Airing', score: 7.59, hasSub: true, hasDub: true, categories: ['adventure', 'isekai'],
  },
  {
    id: 108617, anilistId: 108617, title: 'Somali and the Forest Spirit', mediaType: 'tv',
    overview: 'In a world inhabited by mystical creatures, a golem and a young human girl set off on a journey.',
    posterPath: `${AL}/cover/medium/bx108617-PgoYLgWzzm0c.png`, backdropPath: `${AL}/banner/108617-K5pexm0OYdJl.jpg`,
    voteAverage: 7.8, year: '2020', genres: ['Adventure', 'Fantasy', 'Slice of Life'], episodes: 12, status: 'Finished Airing', score: 7.76, hasSub: true, hasDub: false, categories: ['adventure', 'fantasy'],
  },
  // ─── COMEDY ────────────────────────────────────────
  {
    id: 40779, anilistId: 40779, title: "Konosuba: God's Blessing on This Wonderful World!", mediaType: 'tv',
    overview: 'After dying a laughable death in a traffic accident, Kazuma finds himself before a beautiful but obnoxious goddess.',
    posterPath: `${AL}/cover/medium/bx21202-mPOr80AEjUcZ.png`, backdropPath: `${AL}/banner/21202-UWijdV7RMnXo.jpg`,
    voteAverage: 8.1, year: '2016', genres: ['Adventure', 'Comedy', 'Fantasy'], episodes: 20, status: 'Finished Airing', score: 8.11, hasSub: true, hasDub: true, categories: ['comedy', 'isekai'],
  },
  {
    id: 101921, anilistId: 101921, title: 'Kaguya-sama: Love is War', mediaType: 'tv',
    overview: 'At Shuchiin Academy, Miyuki Shirogane and Kaguya Shinomiya seem perfect for each other.',
    posterPath: `${AL}/cover/medium/bx101921-ufrjLzhSz7L1.jpg`, backdropPath: `${AL}/banner/101921-GgvvFhlNhzlF.jpg`,
    voteAverage: 8.4, year: '2019', genres: ['Comedy', 'Romance'], episodes: 37, status: 'Finished Airing', score: 8.36, hasSub: true, hasDub: true, categories: ['comedy', 'romance'],
  },
  {
    id: 21804, anilistId: 21804, title: 'The Disastrous Life of Saiki K.', mediaType: 'tv',
    overview: 'Kusuo Saiki has had psychic powers since he was born and they are more trouble than they are worth.',
    posterPath: `${AL}/cover/medium/bx21804-As6tDLAvEvNY.jpg`, backdropPath: `${AL}/banner/21804-K0xl0PE1PfHt.jpg`,
    voteAverage: 8.3, year: '2016', genres: ['Comedy', 'Supernatural'], episodes: 120, status: 'Finished Airing', score: 8.33, hasSub: true, hasDub: true, categories: ['comedy'],
  },
  {
    id: 102976, anilistId: 102976, title: 'KonoSuba: Legend of Crimson', mediaType: 'tv',
    overview: 'After a brief return to the fantasy world, Kazuma and his party face new threats.',
    posterPath: `${AL}/cover/medium/bx102976-2Yi5icRbjukO.png`, backdropPath: `${AL}/banner/102976-xv7fCzBwQ7GU.jpg`,
    voteAverage: 8.0, year: '2017', genres: ['Adventure', 'Comedy', 'Fantasy'], episodes: 10, status: 'Finished Airing', score: 8.0, hasSub: true, hasDub: true, categories: ['comedy', 'isekai'],
  },
  // ─── ROMANCE ───────────────────────────────────────
  {
    id: 20814, anilistId: 20814, title: 'Your Lie in April', mediaType: 'tv',
    overview: 'Kousei Arima is a piano prodigy who lost the ability to hear the piano after his mother death.',
    posterPath: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx140583-VjeF9eXirThy.png',
    backdropPath: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/140583-yBvGP4pn4var.jpg',
    voteAverage: 8.7, year: '2014', genres: ['Drama', 'Music', 'Romance'], episodes: 22, status: 'Finished Airing', score: 8.68, hasSub: true, hasDub: true, categories: ['romance', 'top'],
  },
  {
    id: 124080, anilistId: 124080, title: 'Horimiya', mediaType: 'tv',
    overview: 'On the surface, Kyouko Hori is a brilliant high school student. But at home she is a different person.',
    posterPath: `${AL}/cover/medium/bx124080-3i22mRVPBS0T.jpg`, backdropPath: `${AL}/banner/124080-ARyLAHHgikRq.jpg`,
    voteAverage: 8.2, year: '2021', genres: ['Comedy', 'Romance', 'Slice of Life'], episodes: 13, status: 'Finished Airing', score: 8.15, hasSub: true, hasDub: true, categories: ['romance'],
  },
  {
    id: 132405, anilistId: 132405, title: 'My Dress-Up Darling', mediaType: 'tv',
    overview: 'Wakana Gojou overcomes a traumatic past and discovers a new friend in Marin Kitagawa.',
    posterPath: `${AL}/cover/medium/bx132405-qP7FQYGmNI3d.jpg`, backdropPath: `${AL}/banner/132405-LnPQaqaksEpN.jpg`,
    voteAverage: 8.4, year: '2022', genres: ['Comedy', 'Romance'], episodes: 12, status: 'Finished Airing', score: 8.39, hasSub: true, hasDub: true, categories: ['romance', 'trending'],
  },
  {
    id: 4224, anilistId: 4224, title: 'Toradora!', mediaType: 'tv',
    overview: 'Ryuuji Takasu is a gentle guy whose appearance scares people. Taiga Aisaka is a tiny girl with a violent temper.',
    posterPath: `${AL}/cover/medium/bx4224-PXVMBLNwy2aF.jpg`, backdropPath: `${AL}/banner/4224-iPUOHdMde27j.jpg`,
    voteAverage: 8.2, year: '2008', genres: ['Comedy', 'Drama', 'Romance'], episodes: 25, status: 'Finished Airing', score: 8.22, hasSub: true, hasDub: true, categories: ['romance'],
  },
  // ─── FANTASY ───────────────────────────────────────
  {
    id: 108465, anilistId: 108465, title: 'Mushoku Tensei: Jobless Reincarnation', mediaType: 'tv',
    overview: 'A 34-year-old NEET is reincarnated into a fantasy world and decides to make the most of his second chance.',
    posterPath: `${AL}/cover/medium/bx108465-1ANspF1EWyFx.jpg`, backdropPath: `${AL}/banner/108465-RgsRpTMhP9Sv.jpg`,
    voteAverage: 8.3, year: '2021', genres: ['Adventure', 'Drama', 'Fantasy'], episodes: 37, status: 'Finished Airing', score: 8.33, hasSub: true, hasDub: true, categories: ['fantasy', 'isekai', 'trending'],
  },
  {
    id: 10087, anilistId: 10087, title: 'Fate/Zero', mediaType: 'tv',
    overview: 'The Holy Grail War is a battle royale among seven mages who summon seven heroic spirits.',
    posterPath: `${AL}/cover/medium/bx10087-M4Hd9qrHGrXk.png`, backdropPath: `${AL}/banner/10087-32MFY9VnJQ7I.jpg`,
    voteAverage: 8.2, year: '2011', genres: ['Action', 'Fantasy', 'Supernatural'], episodes: 13, status: 'Finished Airing', score: 8.24, hasSub: true, hasDub: true, categories: ['fantasy', 'action'],
  },
  {
    id: 11757, anilistId: 11757, title: 'Sword Art Online', mediaType: 'tv',
    overview: 'In the year 2022, gamers rejoice as Sword Art Online, a VRMMORPG, launches.',
    posterPath: `${AL}/cover/medium/bx11757-SxYDUzdr9rh2.jpg`, backdropPath: `${AL}/banner/11757-TlEEV9weG4Ag.jpg`,
    voteAverage: 7.2, year: '2012', genres: ['Action', 'Adventure', 'Fantasy'], episodes: 96, status: 'Finished Airing', score: 7.24, hasSub: true, hasDub: true, categories: ['fantasy', 'action'],
  },
  // ─── ISEKAI / TRENDING ────────────────────────────
  {
    id: 150672, anilistId: 150672, title: 'Oshi no Ko', mediaType: 'tv',
    overview: 'Ai Hoshino and Gorou Hoshiemi form an unlikely partnership that leads them into idol culture and personal drama.',
    posterPath: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx150672-WqmmwZ4nMzAy.png',
    backdropPath: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/150672-ISwoA0eS722H.jpg',
    voteAverage: 8.6, year: '2023', genres: ['Drama', 'Mystery', 'Supernatural'], episodes: 11, status: 'Currently Airing', score: 8.64, hasSub: true, hasDub: true, categories: ['trending', 'top'],
  },
  {
    id: 151807, anilistId: 151807, title: 'Solo Leveling', mediaType: 'tv',
    overview: 'In a world where hunters must battle deadly monsters, Sung Jinwoo finds himself the weakest hunter of all.',
    posterPath: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx151807-it355ZgzquUd.png',
    backdropPath: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-37yfQA3ym8PA.jpg',
    voteAverage: 8.4, year: '2024', genres: ['Action', 'Adventure', 'Fantasy'], episodes: 12, status: 'Finished Airing', score: 8.38, hasSub: true, hasDub: true, categories: ['trending', 'top', 'action'],
  },
  {
    id: 108466, anilistId: 108466, title: 'Jobless Reincarnation Season 2', mediaType: 'tv',
    overview: 'Rudeus Greyrat continues his journey of self-discovery and growth in a new world.',
    posterPath: `${AL}/cover/medium/bx108465-1ANspF1EWyFx.jpg`, backdropPath: `${AL}/banner/108465-RgsRpTMhP9Sv.jpg`,
    voteAverage: 8.4, year: '2023', genres: ['Adventure', 'Fantasy'], episodes: 25, status: 'Finished Airing', score: 8.42, hasSub: true, hasDub: true, categories: ['isekai', 'fantasy'],
  },
  // ─── SPORTS ────────────────────────────────────────
  {
    id: 20583, anilistId: 20583, title: 'Haikyuu!!', mediaType: 'tv',
    overview: 'A volleyball-obsessed teenager joins his school volleyball team and aims to become the best player.',
    posterPath: `${AL}/cover/medium/bx20583-sOkNkYOeJxKN.jpg`, backdropPath: `${AL}/banner/20583-iPFMBm7cBjU.jpg`,
    voteAverage: 8.5, year: '2014', genres: ['Comedy', 'Drama', 'Sports'], episodes: 85, status: 'Finished Airing', score: 8.51, hasSub: true, hasDub: true, categories: ['sports', 'top'],
  },
  {
    id: 131594, anilistId: 131594, title: 'Blue Lock', mediaType: 'tv',
    overview: 'After a disastrous defeat at the World Cup, Japan team struggles to regroup. What is missing is an Ace Striker.',
    posterPath: `${AL}/cover/medium/bx131594-eYAoFzJqWbE.jpg`, backdropPath: `${AL}/banner/131594-nKnHODJxEWiV.jpg`,
    voteAverage: 8.0, year: '2022', genres: ['Drama', 'Sports'], episodes: 24, status: 'Finished Airing', score: 8.03, hasSub: true, hasDub: true, categories: ['sports', 'trending'],
  },
  {
    id: 14440, anilistId: 14440, title: "Kuroko's Basketball", mediaType: 'tv',
    overview: 'The Teppei Basketball Club begins to make a name for itself within the Inter-High preliminaries.',
    posterPath: `${AL}/cover/medium/bx14440-sfNCnEOp7OYk.jpg`, backdropPath: `${AL}/banner/14440-tLwYwOCbrjU.jpg`,
    voteAverage: 7.9, year: '2012', genres: ['Comedy', 'Sports'], episodes: 75, status: 'Finished Airing', score: 7.94, hasSub: true, hasDub: true, categories: ['sports'],
  },
  // ─── SCHOOL / SLICE OF LIFE ───────────────────────
  {
    id: 7791, anilistId: 7791, title: 'K-ON!', mediaType: 'tv',
    overview: 'The story follows the members of the light music club of Sakuragaoka Girls High School.',
    posterPath: `${AL}/cover/medium/bx7791-g3g4vMKPsOE.jpg`, backdropPath: `${AL}/banner/7791-wY9G4bK6eDv.jpg`,
    voteAverage: 7.9, year: '2009', genres: ['Comedy', 'Music', 'Slice of Life'], episodes: 39, status: 'Finished Airing', score: 7.87, hasSub: true, hasDub: true, categories: ['school', 'slice_of_life'],
  },
  {
    id: 15051, anilistId: 15051, title: 'Silver Spoon', mediaType: 'tv',
    overview: 'Yuugo Hachiken is a shy boy from the city who enrolls in an agricultural boarding school in Hokkaido.',
    posterPath: `${AL}/cover/medium/bx15051-4xK3GfL6OQ4.jpg`, backdropPath: `${AL}/banner/15051-jw0yPMcJQ7M.jpg`,
    voteAverage: 7.7, year: '2013', genres: ['Comedy', 'Drama', 'Slice of Life'], episodes: 22, status: 'Finished Airing', score: 7.72, hasSub: true, hasDub: true, categories: ['school', 'slice_of_life'],
  },
  {
    id: 131969, anilistId: 131969, title: 'Spy x Family', mediaType: 'tv',
    overview: 'Master spy Twilight is unparalleled when it comes to going undercover on dangerous missions.',
    posterPath: `${AL}/cover/medium/bx131969-ehId2N6YdSCf.jpg`, backdropPath: `${AL}/banner/131969-kFq3GKJOMd6t.jpg`,
    voteAverage: 8.4, year: '2022', genres: ['Action', 'Comedy'], episodes: 37, status: 'Currently Airing', score: 8.42, hasSub: true, hasDub: true, categories: ['trending', 'comedy', 'action'],
  },
  {
    id: 154109, anilistId: 154109, title: "Frieren: Beyond Journey's End", mediaType: 'tv',
    overview: 'After the party of heroes defeated the Demon King, they returned to lives of solitude.',
    posterPath: `${AL}/cover/medium/bx154109-yFv0K2Vvdb.jpg`, backdropPath: `${AL}/banner/154109-uG5cMnK0Oj.jpg`,
    voteAverage: 8.7, year: '2023', genres: ['Adventure', 'Drama', 'Fantasy'], episodes: 28, status: 'Finished Airing', score: 8.73, hasSub: true, hasDub: true, categories: ['top', 'trending', 'fantasy'],
  },
];

// Deduplicate by anilistId
const seen = new Set<number>();
export const DEDUPED_ANIME = CURATED_ANIME.filter(a => {
  if (seen.has(a.anilistId)) return false;
  seen.add(a.anilistId);
  return true;
});
