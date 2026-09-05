import React, { useState, useEffect } from 'react';
import { MediaItem, Library } from '../types';
import { SkyCineApi } from '../api/client';
import { TVCard } from '../components/common/TVCard';

interface CatalogPageProps {
  type: 'movies' | 'shows';
  onOpenDetail: (item: MediaItem) => void;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ type, onOpenDetail }) => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibId, setSelectedLibId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      try {
        const allLibs = await SkyCineApi.getLibraries().catch(() => []);
        const targetLibs = allLibs.filter(l => (type === 'movies' ? l.type !== 'shows' : l.type === 'shows'));
        setLibraries(targetLibs);

        if (type === 'shows') {
          const showList = await SkyCineApi.getShows().catch(() => []);
          setItems(showList);
        } else {
          // Movies: fetch all movie libraries when "all" is selected
          const libPromises = targetLibs.map(l => SkyCineApi.getLibraryItems(l.id).catch(() => []));
          const results = await Promise.all(libPromises);
          setItems(results.flat());
        }
      } catch (e) {
        console.error('Catalog load failed:', e);
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [type]);

  const handleSelectLib = async (libId: string) => {
    setSelectedLibId(libId);
    setLoading(true);
    try {
      if (libId === 'all') {
        if (type === 'shows') {
          const list = await SkyCineApi.getShows();
          setItems(list);
        } else {
          const libPromises = libraries.map(l => SkyCineApi.getLibraryItems(l.id).catch(() => []));
          const results = await Promise.all(libPromises);
          setItems(results.flat());
        }
      } else {
        const list = await SkyCineApi.getLibraryItems(libId);
        setItems(list);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-cinema-950 p-12">
      {/* Page Title & Library Filters */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-white">
            {type === 'movies' ? 'Фильмы' : 'Сериалы'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Коллекция медиатеки SkyCine ({items.length})
          </p>
        </div>

        {libraries.length > 1 && (
          <div className="flex items-center gap-2 bg-cinema-900 p-1.5 rounded-2xl border border-slate-800">
            <button
              data-tv-focus="true"
              data-focus-id="lib-pill-all"
              onClick={() => handleSelectLib('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                selectedLibId === 'all'
                  ? 'bg-cinema-gold text-slate-950 shadow-gold-glow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Все
            </button>
            {libraries.map((lib) => (
              <button
                key={lib.id}
                data-tv-focus="true"
                data-focus-id={`lib-pill-${lib.id}`}
                onClick={() => handleSelectLib(lib.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  selectedLibId === lib.id
                    ? 'bg-cinema-gold text-slate-950 shadow-gold-glow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {lib.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid of Items */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-cinema-gold">
          <div className="w-10 h-10 border-4 border-cinema-gold/20 border-t-cinema-gold rounded-full animate-spin"></div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
          <p className="text-base font-semibold">В этой категории пока нет элементов</p>
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-5 pb-16">
          {items.map((item) => (
            <TVCard
              key={item.id}
              id={`cat-card-${item.id}`}
              item={item}
              onClick={() => onOpenDetail(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
