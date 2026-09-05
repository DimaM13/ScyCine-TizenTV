import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Play, CornerDownLeft, Tv } from 'lucide-react';
import { TIZEN_KEYS } from '../../tizen/tizenKeys';

export const RemoteSimulator: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  // Hide completely on physical Samsung Smart TV hardware
  if (typeof window !== 'undefined' && Boolean((window as any).tizen || (window as any).webapis)) {
    return null;
  }

  const triggerKey = (keyCode: number) => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true
      })
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 select-none">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cinema-850/90 hover:bg-cinema-800 text-cinema-gold border border-cinema-gold/40 shadow-xl cursor-pointer backdrop-blur text-xs font-bold"
        >
          <Tv className="w-4 h-4" />
          <span>Пульт ТВ</span>
        </button>
      ) : (
        <div className="w-56 bg-cinema-950/95 border-2 border-cinema-gold/40 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl flex flex-col items-center gap-3">
          <div className="flex items-center justify-between w-full pb-1 border-b border-slate-800">
            <span className="text-[11px] font-black tracking-widest text-cinema-gold uppercase">Samsung Remote</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* D-Pad */}
          <div className="relative w-36 h-36 rounded-full bg-cinema-900 border border-slate-700/80 flex items-center justify-center p-2 shadow-inner">
            {/* UP */}
            <button
              onClick={() => triggerKey(TIZEN_KEYS.KEY_UP)}
              className="absolute top-1 left-1/2 -translate-x-1/2 w-10 h-9 rounded-t-full bg-cinema-800 hover:bg-cinema-gold hover:text-slate-950 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronUp className="w-5 h-5" />
            </button>

            {/* DOWN */}
            <button
              onClick={() => triggerKey(TIZEN_KEYS.KEY_DOWN)}
              className="absolute bottom-1 left-1/2 -translate-x-1/2 w-10 h-9 rounded-b-full bg-cinema-800 hover:bg-cinema-gold hover:text-slate-950 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronDown className="w-5 h-5" />
            </button>

            {/* LEFT */}
            <button
              onClick={() => triggerKey(TIZEN_KEYS.KEY_LEFT)}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-9 h-10 rounded-l-full bg-cinema-800 hover:bg-cinema-gold hover:text-slate-950 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* RIGHT */}
            <button
              onClick={() => triggerKey(TIZEN_KEYS.KEY_RIGHT)}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-10 rounded-r-full bg-cinema-800 hover:bg-cinema-gold hover:text-slate-950 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* CENTER OK */}
            <button
              onClick={() => triggerKey(TIZEN_KEYS.KEY_ENTER)}
              className="w-12 h-12 rounded-full bg-cinema-gold text-slate-950 font-black text-xs flex items-center justify-center cursor-pointer shadow-gold-glow active:scale-95 transition-transform"
            >
              OK
            </button>
          </div>

          {/* Return & Play Controls */}
          <div className="grid grid-cols-3 gap-2 w-full pt-1">
            <button
              onClick={() => triggerKey(TIZEN_KEYS.KEY_RETURN)}
              className="h-9 rounded-lg bg-cinema-800 hover:bg-cinema-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
              <span>Назад</span>
            </button>

            <button
              onClick={() => triggerKey(TIZEN_KEYS.KEY_PLAY_PAUSE)}
              className="h-9 rounded-lg bg-cinema-800 hover:bg-cinema-700 text-cinema-gold flex items-center justify-center cursor-pointer"
            >
              <Play className="w-4 h-4 fill-cinema-gold" />
            </button>

            <button
              onClick={() => triggerKey(TIZEN_KEYS.KEY_STOP)}
              className="h-9 rounded-lg bg-cinema-800 hover:bg-cinema-700 text-red-400 text-xs font-bold flex items-center justify-center cursor-pointer"
            >
              Стоп
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
