import React, { useState, useRef, useEffect } from 'react';
import { Delete, CornerDownLeft, Globe, Space } from 'lucide-react';
import { spatialNav } from '../../tizen/spatialNavigation';

interface VirtualKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  defaultLang?: 'RU' | 'EN';
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  onKeyPress,
  onBackspace,
  onClear,
  onSubmit,
  submitLabel = 'Ввод',
  defaultLang = 'EN'
}) => {
  const [lang, setLang] = useState<'RU' | 'EN'>(defaultLang);
  const [focusedKeyId, setFocusedKeyId] = useState<string | null>(null);
  const lastActionTime = useRef<number>(0);

  // Sync focusedKeyId with spatial navigation events
  useEffect(() => {
    const handleFocusChange = (e: any) => {
      if (e.detail?.id) {
        setFocusedKeyId(e.detail.id);
      }
    };
    window.addEventListener('skycine_tv_focus_changed', handleFocusChange);
    return () => window.removeEventListener('skycine_tv_focus_changed', handleFocusChange);
  }, []);

  // Debounce key presses to strictly avoid double inputs or hardware chatter
  const safePress = (action: () => void) => {
    const now = Date.now();
    if (now - lastActionTime.current < 140) return;
    lastActionTime.current = now;
    action();
  };

  // Layouts featuring full symbols required for URL entry (:, /, ., -, @, _)
  const layouts = {
    EN: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ':'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm', '/', '.', '-']
    ],
    RU: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
      ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
      ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', '.', '/']
    ]
  };

  const currentLayout = layouts[lang];

  const handleToggleLang = () => {
    safePress(() => {
      setLang((prev) => (prev === 'RU' ? 'EN' : 'RU'));
      setTimeout(() => {
        spatialNav.setFocus('kb-lang');
      }, 30);
    });
  };

  return (
    <div
      data-current-lang={lang}
      className="tv-virtual-keyboard bg-cinema-900/95 border-2 border-slate-700/80 rounded-3xl p-6 flex flex-col gap-3 select-none shadow-2xl"
    >
      {/* Letter & Number rows (Large TV touch targets: 68x56px) */}
      <div className="flex flex-col gap-2.5">
        {currentLayout.map((row, rowIdx) => (
          <div key={`${lang}-${rowIdx}`} className="flex justify-center gap-2">
            {row.map((char) => {
              const keyId = `kb-${lang}-${char}`;
              const isFocused = focusedKeyId === keyId;

              return (
                <button
                  key={keyId}
                  type="button"
                  data-tv-focus="true"
                  data-focus-id={keyId}
                  onFocus={() => setFocusedKeyId(keyId)}
                  onClick={() => safePress(() => onKeyPress(char))}
                  className={`tv-kb-key w-[66px] h-[54px] rounded-xl text-xl font-extrabold flex items-center justify-center cursor-pointer transition-all duration-150 select-none ${
                    isFocused
                      ? 'tv-focused bg-gradient-to-br from-amber-300 via-cinema-gold to-amber-500 text-slate-950 font-black scale-115 ring-4 ring-white shadow-gold-glow-lg z-30 border-2 border-white'
                      : 'bg-cinema-850 text-slate-100 hover:bg-cinema-800 border border-slate-700/80'
                  }`}
                >
                  {char}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Control row (Space, Backspace, Lang switch, Submit) */}
      <div className="flex justify-center items-center gap-3 mt-3 pt-3 border-t-2 border-slate-800">
        {/* Language Switch */}
        <button
          type="button"
          data-tv-focus="true"
          data-focus-id="kb-lang"
          onFocus={() => setFocusedKeyId('kb-lang')}
          onClick={handleToggleLang}
          className={`tv-kb-key px-5 h-14 rounded-xl font-extrabold text-sm flex items-center gap-2 cursor-pointer transition-all duration-150 ${
            focusedKeyId === 'kb-lang'
              ? 'tv-focused bg-gradient-to-br from-amber-300 via-cinema-gold to-amber-500 text-slate-950 scale-110 ring-4 ring-white shadow-gold-glow-lg z-30 border-2 border-white'
              : 'bg-cinema-800 text-cinema-gold border border-cinema-gold/40 hover:bg-cinema-700'
          }`}
        >
          <Globe className="w-5 h-5" />
          <span>Язык: {lang}</span>
        </button>

        {/* Space Bar */}
        <button
          type="button"
          data-tv-focus="true"
          data-focus-id="kb-space"
          onFocus={() => setFocusedKeyId('kb-space')}
          onClick={() => safePress(() => onKeyPress(' '))}
          className={`tv-kb-key flex-1 max-w-sm h-14 rounded-xl font-bold text-base flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ${
            focusedKeyId === 'kb-space'
              ? 'tv-focused bg-gradient-to-br from-amber-300 via-cinema-gold to-amber-500 text-slate-950 scale-110 ring-4 ring-white shadow-gold-glow-lg z-30 border-2 border-white'
              : 'bg-cinema-850 text-slate-200 border border-slate-700/80 hover:bg-cinema-800'
          }`}
        >
          <Space className="w-5 h-5" />
          <span>Пробел</span>
        </button>

        {/* Backspace */}
        <button
          type="button"
          data-tv-focus="true"
          data-focus-id="kb-backspace"
          onFocus={() => setFocusedKeyId('kb-backspace')}
          onClick={() => safePress(onBackspace)}
          className={`tv-kb-key px-5 h-14 rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer transition-all duration-150 ${
            focusedKeyId === 'kb-backspace'
              ? 'tv-focused bg-gradient-to-br from-amber-300 via-cinema-gold to-amber-500 text-slate-950 scale-110 ring-4 ring-white shadow-gold-glow-lg z-30 border-2 border-white'
              : 'bg-cinema-800 text-red-400 border border-red-500/40 hover:bg-cinema-700'
          }`}
        >
          <Delete className="w-5 h-5" />
          <span>Стереть</span>
        </button>

        {/* Clear */}
        <button
          type="button"
          data-tv-focus="true"
          data-focus-id="kb-clear"
          onFocus={() => setFocusedKeyId('kb-clear')}
          onClick={() => safePress(onClear)}
          className={`tv-kb-key px-4 h-14 rounded-xl font-bold text-xs flex items-center justify-center cursor-pointer transition-all duration-150 ${
            focusedKeyId === 'kb-clear'
              ? 'tv-focused bg-gradient-to-br from-amber-300 via-cinema-gold to-amber-500 text-slate-950 scale-110 ring-4 ring-white shadow-gold-glow-lg z-30 border-2 border-white'
              : 'bg-cinema-850 text-slate-300 border border-slate-700/80 hover:bg-cinema-800'
          }`}
        >
          Очистить
        </button>

        {/* Submit */}
        <button
          type="button"
          data-tv-focus="true"
          data-focus-id="kb-submit"
          onFocus={() => setFocusedKeyId('kb-submit')}
          onClick={() => safePress(onSubmit)}
          className={`tv-kb-key px-7 h-14 rounded-xl font-black text-base flex items-center gap-2 shadow-gold-glow cursor-pointer transition-all duration-150 ${
            focusedKeyId === 'kb-submit'
              ? 'tv-focused bg-white text-slate-950 scale-110 ring-4 ring-cinema-gold shadow-gold-glow-lg z-30 border-2 border-cinema-gold'
              : 'bg-cinema-gold text-slate-950 hover:bg-cinema-gold-bright border border-cinema-gold'
          }`}
        >
          <CornerDownLeft className="w-5 h-5" />
          <span>{submitLabel}</span>
        </button>
      </div>
    </div>
  );
};
