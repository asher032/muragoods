import type { MediaItem } from '../../types';
import AnimeCard from './AnimeCard';

interface AnimeRowProps {
  title: string;
  items: MediaItem[];
  moreHref?: string;
}

export default function AnimeRow({ title, items, moreHref }: AnimeRowProps) {
  if (items.length === 0) return null;

  return (
    <div className="anime-row">
      <div className="anime-row-header">
        <p className="anime-row-title">{title}</p>
        {moreHref && <a href={moreHref} className="anime-row-more">View All →</a>}
      </div>
      <div className="anime-scroll">
        {items.map(item => <AnimeCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}
