import React, { useState, useEffect } from 'react';
import { MediaItem, Library } from '../types';
import { SkyCineApi } from '../api/client';
import { TVCard } from '../components/common/TVCard';
import { TVButton } from '../components/common/TVButton';
import { Play, Info, Star } from 'lucide-react';

interface HomePageProps {
  onPlayMedia: (item: MediaItem) => void;
  onOpenDetail: (item: MediaItem) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onPlayMedia, onOpenDetail }) => {
  const [continueWatching, setContinueWatching] = useState<MediaItem[]>([]);
  const [featuredItem, setFeaturedItem] = useState<MediaItem | null>(null);
  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [shows, setShows] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHomeContent() {
      try {
        const [contItems, libs, showItems] = await Promise.all([
          SkyCineApi.getContinueWatching().catch(() => []),
          SkyCineApi.getLibraries().catch(() => []),
          SkyCineApi.getShows().catch(() => [])
        ]);

        setContinueWatching(contItems);
        setShows(showItems);

        // Fetch movies from first movie library
        const movieLib = libs.find((l: Library) => l.type === 'movies') || libs[0];
        if (movieLib) {
          const mItems = await SkyCineApi.getLibraryItems(movieLib.id).catch(() => []);
          setMovies(mItems);
          if (mItems.length > 0) {
            setFeaturedItem(mItems[0]);
          }
        } else if (showItems.length > 0) {
          setFeaturedItem(showItems[0]);
        }
      } catch (e) {
        console.error('Error loading home data:', e);
      } finally {
        setLoading(false);
      }
    }
    loadHomeContent();
  }, []);

  const heroBackdrop = featuredItem
    ? SkyCineApi.getImageUrl(featuredItem.backdropPath || featuredItem.posterPath)
    : '';

  return (
    <div className="flex-1 h-screen overflow-y-auto overflow-x-hidden bg-cinema-950 pb-20">
      {/* 1. HERO BILLBOARD BANNER */}
      {featuredItem && (
        <div className="relative w-full h-[520px] bg-cinema-900 overflow-hidden flex items-end p-12">
          {/* Backdrop Image */}
          {heroBackdrop && (
            <img
              src={heroBackdrop}
              alt={featuredItem.title}
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          )}

          {/* Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-cinema-950 via-cinema-950/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-cinema-950 via-cinema-950/70 to-transparent" />

          {/* Hero Content */}
          <div className="relative z-10 max-w-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded bg-cinema-gold text-slate-950 font-black text-xs tracking-wider uppercase shadow-gold-glow">
                Эксклюзив
              </span>
              {featuredItem.rating && (
                <div className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded text-xs font-bold text-cinema-gold border border-cinema-gold/30 backdrop-blur">
                  <Star className="w-3.5 h-3.5 fill-cinema-gold" />
                  <span>{featuredItem.rating.toFixed(1)}</span>
                </div>
              )}
              {featuredItem.year && (
                <span className="text-slate-300 font-semibold text-xs">
                  {featuredItem.year}
                </span>
              )}
              {featuredItem.resolution && (
                <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900/60 text-[11px] font-bold text-slate-300">
                  {featuredItem.resolution}
                </span>
              )}
            </div>

            <h1 className="text-4xl font-black text-white tracking-tight leading-tight line-clamp-2">
              {featuredItem.title}
            </h1>

            {featuredItem.overview && (
              <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed">
                {featuredItem.overview}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <TVButton
                id="hero-play-btn"
                variant="primary"
                onClick={() => onPlayMedia(featuredItem)}
                icon={<Play className="w-5 h-5 fill-slate-950" />}
                className="px-8 text-base"
              >
                Смотреть
              </TVButton>
              <TVButton
                id="hero-info-btn"
                variant="secondary"
                onClick={() => onOpenDetail(featuredItem)}
                icon={<Info className="w-5 h-5" />}
                className="px-6 text-base"
              >
                О фильме
              </TVButton>
            </div>
          </div>
        </div>
      )}

      {/* 2. CONTINUE WATCHING SHELF */}
      {continueWatching.length > 0 && (
        <section className="px-12 mt-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-6 bg-cinema-gold rounded-full inline-block" />
            Продолжить просмотр
          </h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 pt-1">
            {continueWatching.map((item) => (
              <TVCard
                key={`cont-${item.id}`}
                id={`card-cont-${item.id}`}
                item={item}
                onClick={() => onPlayMedia(item)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 3. MOVIES SHELF */}
      {movies.length > 0 && (
        <section className="px-12 mt-8">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-6 bg-cinema-gold rounded-full inline-block" />
            Фильмы медиатеки
          </h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 pt-1">
            {movies.map((item) => (
              <TVCard
                key={`movie-${item.id}`}
                id={`card-movie-${item.id}`}
                item={item}
                onClick={() => onOpenDetail(item)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 4. SHOWS SHELF */}
      {shows.length > 0 && (
        <section className="px-12 mt-8">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-6 bg-cinema-gold rounded-full inline-block" />
            Сериалы
          </h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 pt-1">
            {shows.map((item) => (
              <TVCard
                key={`show-${item.id}`}
                id={`card-show-${item.id}`}
                item={item}
                onClick={() => onOpenDetail(item)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
