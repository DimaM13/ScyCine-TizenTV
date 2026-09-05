import React, { useState, useEffect } from 'react';
import { MediaItem, Episode } from '../types';
import { SkyCineApi } from '../api/client';
import { TVButton } from '../components/common/TVButton';
import { spatialNav } from '../tizen/spatialNavigation';
import { Play, Star, Calendar, Clock, ArrowLeft } from 'lucide-react';

interface DetailModalProps {
  media: MediaItem;
  onClose: () => void;
  onPlay: (media: MediaItem, episode?: Episode, episodesList?: Episode[]) => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  media,
  onClose,
  onPlay
}) => {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const isShow = media.type === 'SHOW' || Boolean(media.showTitle);

  // Register Back Key Handler for Modal
  useEffect(() => {
    const handleBack = () => {
      onClose();
      return true;
    };
    spatialNav.pushBackHandler(handleBack);
    return () => {
      spatialNav.popBackHandler(handleBack);
    };
  }, [onClose]);

  useEffect(() => {
    if (isShow) {
      setLoadingEpisodes(true);
      SkyCineApi.getShowEpisodes(media.title || media.showTitle || '')
        .then((epList) => {
          setEpisodes(epList);
          if (epList.length > 0) {
            setSelectedSeason(epList[0].seasonNumber || 1);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingEpisodes(false));
    }
  }, [media, isShow]);

  const seasonsList = Array.from(new Set(episodes.map(e => e.seasonNumber))).sort((a, b) => a - b);
  const currentSeasonEpisodes = episodes.filter(e => e.seasonNumber === selectedSeason);

  const backdropUrl = SkyCineApi.getImageUrl(media.backdropPath || media.posterPath);

  return (
    <div className="tizen-modal-active fixed inset-0 z-50 bg-cinema-950 flex flex-col overflow-y-auto select-none">
      {/* Top Backdrop Area */}
      <div className="relative w-full h-[460px] bg-cinema-900 overflow-hidden flex items-end p-12">
        {backdropUrl && (
          <img
            src={backdropUrl}
            alt={media.title}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-950 via-cinema-950/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-cinema-950 via-cinema-950/70 to-transparent" />

        {/* Back Button */}
        <div className="absolute top-8 left-8 z-20">
          <TVButton
            id="detail-back-btn"
            variant="secondary"
            onClick={onClose}
            icon={<ArrowLeft className="w-5 h-5" />}
          >
            Назад
          </TVButton>
        </div>

        {/* Metadata & Actions */}
        <div className="relative z-10 max-w-3xl flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {media.rating && (
              <div className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded text-xs font-bold text-cinema-gold border border-cinema-gold/30">
                <Star className="w-3.5 h-3.5 fill-cinema-gold" />
                <span>{media.rating.toFixed(1)}</span>
              </div>
            )}
            {media.year && (
              <span className="flex items-center gap-1 text-slate-300 text-xs font-semibold">
                <Calendar className="w-3.5 h-3.5" />
                <span>{media.year}</span>
              </span>
            )}
            {media.durationSeconds && (
              <span className="flex items-center gap-1 text-slate-300 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>{Math.floor(media.durationSeconds / 60)} мин</span>
              </span>
            )}
            {media.resolution && (
              <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900/60 text-[10px] font-bold text-slate-300">
                {media.resolution}
              </span>
            )}
          </div>

          <h1 className="text-3xl font-black text-white">{media.title}</h1>

          {media.overview && (
            <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed">
              {media.overview}
            </p>
          )}

          <div className="pt-2">
            <TVButton
              id="detail-play-main-btn"
              variant="primary"
              onClick={() => {
                if (isShow && episodes.length > 0) {
                  onPlay(media, episodes[0], episodes);
                } else {
                  onPlay(media);
                }
              }}
              icon={<Play className="w-5 h-5 fill-slate-950" />}
              className="px-8 text-base"
            >
              {isShow ? 'Смотреть с 1 серии' : 'Смотреть фильм'}
            </TVButton>
          </div>
        </div>
      </div>

      {/* Series Episodes Browser */}
      {isShow && (
        <div className="p-12 pt-6 flex flex-col gap-6">
          {/* Season Tabs */}
          {seasonsList.length > 1 && (
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-slate-400 uppercase mr-2">Сезоны:</span>
              {seasonsList.map((sNum) => (
                <button
                  key={sNum}
                  data-tv-focus="true"
                  data-focus-id={`season-tab-${sNum}`}
                  onClick={() => setSelectedSeason(sNum)}
                  className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    selectedSeason === sNum
                      ? 'bg-cinema-gold text-slate-950 shadow-gold-glow'
                      : 'bg-cinema-900 text-slate-300 hover:bg-cinema-850'
                  }`}
                >
                  {sNum} сезон
                </button>
              ))}
            </div>
          )}

          {/* Episodes List */}
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-bold text-white">
              Серии ({currentSeasonEpisodes.length})
            </h3>

            {loadingEpisodes ? (
              <div className="h-32 flex items-center justify-center text-cinema-gold">
                <div className="w-8 h-8 border-4 border-cinema-gold/20 border-t-cinema-gold rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                {currentSeasonEpisodes.map((ep) => {
                  const epThumb = SkyCineApi.getImageUrl(ep.stillPath);
                  return (
                    <div
                      key={ep.id}
                      data-tv-focus="true"
                      data-focus-id={`ep-card-${ep.id}`}
                      onClick={() => onPlay(media, ep, episodes)}
                      className="group bg-cinema-900 border border-slate-800 hover:border-cinema-gold rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-200"
                    >
                      <div className="relative aspect-video w-full bg-cinema-850 overflow-hidden">
                        {epThumb ? (
                          <img
                            src={epThumb}
                            alt={ep.title || ''}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600">
                            <Play className="w-6 h-6 opacity-40 text-cinema-gold" />
                          </div>
                        )}
                        <span className="absolute bottom-2 left-2 bg-black/75 px-2 py-0.5 rounded text-[10px] font-bold text-cinema-gold border border-cinema-gold/30">
                          {ep.episodeNumber} серия
                        </span>
                      </div>

                      <div className="p-3">
                        <h4 className="text-sm font-semibold text-slate-200 truncate group-hover:text-cinema-gold">
                          {ep.title || `${ep.episodeNumber} серия`}
                        </h4>
                        {ep.overview && (
                          <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                            {ep.overview}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
