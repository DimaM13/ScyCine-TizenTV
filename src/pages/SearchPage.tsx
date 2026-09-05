import React, { useState, useRef, useEffect } from 'react';
import { MediaItem } from '../types';
import { SkyCineApi } from '../api/client';
import { VirtualKeyboard } from '../components/common/VirtualKeyboard';
import { TVCard } from '../components/common/TVCard';
import { Search } from 'lucide-react';

interface SearchPageProps {
  onOpenDetail: (item: MediaItem) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onOpenDetail }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const searchDebounceRef = useRef<any>(null);

  const executeSearch = (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    SkyCineApi.search(searchTerm)
      .then((items) => setResults(items))
      .catch((e) => console.error('Search error:', e))
      .finally(() => setLoading(false));
  };

  const scheduleSearch = (text: string) => {
    clearTimeout(searchDebounceRef.current);
    if (!text.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    searchDebounceRef.current = setTimeout(() => {
      executeSearch(text);
    }, 300);
  };

  useEffect(() => {
    return () => clearTimeout(searchDebounceRef.current);
  }, []);

  const handleKeyPress = (char: string) => {
    const updated = query + char;
    setQuery(updated);
    scheduleSearch(updated);
  };

  const handleBackspace = () => {
    const updated = query.slice(0, -1);
    setQuery(updated);
    scheduleSearch(updated);
  };

  const handleClear = () => {
    clearTimeout(searchDebounceRef.current);
    setQuery('');
    setResults([]);
    setLoading(false);
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-cinema-950 p-12 flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-black text-white">Поиск медиафайлов</h1>
        <p className="text-sm text-slate-400 mt-1">
          Набирайте название фильма или сериала на экранной клавиатуре
        </p>
      </div>

      {/* Search Bar Display */}
      <div className="flex items-center gap-3 bg-cinema-900 border-2 border-cinema-gold/60 rounded-2xl px-5 py-3.5 max-w-xl shadow-gold-glow">
        <Search className="w-6 h-6 text-cinema-gold flex-shrink-0" />
        <span className="text-lg font-bold text-white flex-1 truncate">
          {query ? query : <span className="text-slate-500 font-normal">Введите название...</span>}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start">
        {/* Virtual Keyboard */}
        <div className="col-span-6">
          <VirtualKeyboard
            onKeyPress={handleKeyPress}
            onBackspace={handleBackspace}
            onClear={handleClear}
            onSubmit={() => executeSearch(query)}
          />
        </div>

        {/* Results Column */}
        <div className="col-span-6">
          <h3 className="text-base font-bold text-white mb-3 flex items-center justify-between">
            <span>Результаты поиска</span>
            <span className="text-xs text-slate-400">{results.length} найдено</span>
          </h3>

          {loading ? (
            <div className="h-48 flex items-center justify-center text-cinema-gold">
              <div className="w-8 h-8 border-4 border-cinema-gold/20 border-t-cinema-gold rounded-full animate-spin"></div>
            </div>
          ) : results.length === 0 ? (
            <div className="h-48 bg-cinema-900/50 border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 p-6 text-center">
              <p className="text-sm font-semibold">
                {query ? 'Ничего не найдено' : 'Начните ввод на пульте для поиска'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 max-h-[560px] overflow-y-auto pr-2">
              {results.map((item) => (
                <TVCard
                  key={item.id}
                  id={`search-card-${item.id}`}
                  item={item}
                  onClick={() => onOpenDetail(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
