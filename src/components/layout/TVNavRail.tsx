import React, { useState } from 'react';
import { NavScreen } from '../../types';
import { Home, Film, Tv, Search, Users, Settings, LogOut, Clapperboard } from 'lucide-react';
import { Preferences } from '../../storage/preferences';

interface TVNavRailProps {
  currentScreen: NavScreen;
  onSelectScreen: (screen: NavScreen) => void;
  onLogout: () => void;
}

export const TVNavRail: React.FC<TVNavRailProps> = ({
  currentScreen,
  onSelectScreen,
  onLogout
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const user = Preferences.getUser();

  const navItems = [
    { id: 'home', label: 'Главная', icon: <Home className="w-6 h-6" /> },
    { id: 'movies', label: 'Фильмы', icon: <Film className="w-6 h-6" /> },
    { id: 'shows', label: 'Сериалы', icon: <Tv className="w-6 h-6" /> },
    { id: 'search', label: 'Поиск', icon: <Search className="w-6 h-6" /> },
    { id: 'rooms', label: 'Смотреть вместе', icon: <Users className="w-6 h-6" /> },
    { id: 'settings', label: 'Настройки', icon: <Settings className="w-6 h-6" /> }
  ];

  return (
    <aside
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onFocusCapture={() => setIsExpanded(true)}
      onBlurCapture={() => setIsExpanded(false)}
      className={`h-screen z-40 bg-cinema-950/95 backdrop-blur-xl border-r border-slate-800/80 flex flex-col justify-between py-6 px-3 transition-all duration-300 ${
        isExpanded ? 'w-64 shadow-2xl' : 'w-24'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cinema-gold to-cinema-gold-hover flex items-center justify-center shadow-gold-glow flex-shrink-0">
          <Clapperboard className="w-6 h-6 text-slate-950 fill-slate-950" />
        </div>
        {isExpanded && (
          <div className="overflow-hidden whitespace-nowrap">
            <h1 className="font-black text-xl tracking-wider text-white">
              SKY<span className="text-cinema-gold">CINE</span>
            </h1>
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Samsung Tizen TV
            </span>
          </div>
        )}
      </div>

      {/* Main Nav items */}
      <nav className="flex flex-col gap-2 my-auto">
        {navItems.map((item) => {
          const isActive = currentScreen === item.id;
          return (
            <button
              key={item.id}
              data-tv-focus="true"
              data-focus-id={`nav-${item.id}`}
              onClick={() => onSelectScreen(item.id as NavScreen)}
              className={`flex items-center gap-4 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-200 select-none ${
                isActive
                  ? 'bg-cinema-gold/15 text-cinema-gold border border-cinema-gold/30 font-bold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-cinema-850/60 border border-transparent'
              }`}
            >
              <div className="flex-shrink-0">{item.icon}</div>
              {isExpanded && (
                <span className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Profile & Logout */}
      <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-4">
        {user && isExpanded && (
          <div className="px-3 py-1">
            <p className="text-xs text-slate-400">Профиль</p>
            <p className="text-sm font-bold text-white truncate">{user.username}</p>
          </div>
        )}
        <button
          data-tv-focus="true"
          data-focus-id="nav-logout"
          onClick={onLogout}
          className="flex items-center gap-4 px-3.5 py-3 rounded-xl text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 cursor-pointer select-none transition-all"
        >
          <LogOut className="w-6 h-6 flex-shrink-0" />
          {isExpanded && <span className="text-sm font-semibold">Выйти</span>}
        </button>
      </div>
    </aside>
  );
};
