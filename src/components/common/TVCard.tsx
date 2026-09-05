import React, { useState } from 'react';
import { MediaItem } from '../../types';
import { SkyCineApi } from '../../api/client';
import { Play, Star } from 'lucide-react';

interface TVCardProps {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
  id?: string;
  subtitle?: string;
}

export const TVCard: React.FC<TVCardProps> = ({ item, onClick, id, subtitle }) => {
  const [imgError, setImgError] = useState(false);

  const posterUrl = SkyCineApi.getImageUrl(item.posterPath || item.stillPath);
  const title = item.title || item.displayTitle || '';
  const progressPercent = item.durationSeconds && item.userProgress
    ? Math.min(100, Math.round((item.userProgress / item.durationSeconds) * 100))
    : 0;

  return (
    <div
      data-tv-focus="true"
      data-focus-id={id || `card-${item.id}`}
      onClick={() => onClick(item)}
      className="tv-card-focus-target flex-shrink-0 w-44 rounded-xl overflow-hidden bg-cinema-900 border border-slate-800/80 cursor-pointer select-none relative group"
    >
      {/* Poster Image */}
      <div className="relative aspect-[2/3] w-full bg-cinema-850 overflow-hidden">
        {posterUrl && !imgError ? (
          <img
            src={posterUrl}
            alt={title}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-cinema-800 text-slate-500">
            <Play className="w-8 h-8 mb-2 opacity-40 text-cinema-gold" />
            <span className="text-xs line-clamp-2">{title}</span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2 left-2 flex gap-1 items-center">
          {item.rating ? (
            <div className="flex items-center gap-1 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-bold text-cinema-gold border border-cinema-gold/30">
              <Star className="w-3 h-3 fill-cinema-gold text-cinema-gold" />
              <span>{item.rating.toFixed(1)}</span>
            </div>
          ) : null}
          {item.resolution && (
            <div className="bg-slate-900/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-300 border border-slate-700">
              {item.resolution}
            </div>
          )}
        </div>

        {/* Watch Progress Bar */}
        {progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
            <div
              className="h-full bg-cinema-gold"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Title & Metadata */}
      <div className="p-3">
        <h4 className="text-sm font-semibold text-slate-100 truncate group-hover:text-cinema-gold transition-colors">
          {title}
        </h4>
        <p className="text-xs text-slate-400 mt-0.5 truncate">
          {subtitle || item.year || (item.type === 'SHOW' ? 'Сериал' : 'Фильм')}
        </p>
      </div>
    </div>
  );
};
