// Shared drama sections config — used by the /murastream/kdrama browse page
// and the home page drama tab.
export type DramaSection = {
  id: string;
  label: string;
  lang: string; // TMDB with_original_language
};

export const DRAMA_SECTIONS: DramaSection[] = [
  { id: 'kdrama', label: 'K-Dramas', lang: 'ko' },
  { id: 'cdrama', label: 'C-Dramas', lang: 'zh' },
  { id: 'jdrama', label: 'J-Dramas', lang: 'ja' },
];
