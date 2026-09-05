import React, { useState, useEffect } from 'react';
import { NavScreen, MediaItem, Episode } from './types';
import { Preferences } from './storage/preferences';
import { registerTizenKeys } from './tizen/tizenKeys';
import { spatialNav } from './tizen/spatialNavigation';
import { TVNavRail } from './components/layout/TVNavRail';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { SearchPage } from './pages/SearchPage';
import { RoomsPage } from './pages/RoomsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthPage } from './pages/AuthPage';
import { DetailModal } from './pages/DetailModal';
import { TizenPlayer } from './components/player/TizenPlayer';
import { RemoteSimulator } from './components/layout/RemoteSimulator';
import { SkyCineApi } from './api/client';

export const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<NavScreen>('home');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Preferences.isLoggedIn());

  // Modals & Player state
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  const [playingItem, setPlayingItem] = useState<{
    media: MediaItem;
    episode?: Episode;
    episodesList?: Episode[];
    roomId?: string;
  } | null>(null);

  useEffect(() => {
    // 1. Initialize Tizen hardware remote keys
    registerTizenKeys();

    // 2. Initialize Spatial D-Pad navigation
    spatialNav.init();

    // Initial focus after mount
    setTimeout(() => {
      spatialNav.focusFirst();
    }, 250);
  }, []);

  // Back handler for sub-screens: if on 'movies', 'shows', etc., pressing Back returns to 'home'
  useEffect(() => {
    if (currentScreen !== 'home') {
      const handleBackToHome = () => {
        setCurrentScreen('home');
        return true;
      };
      spatialNav.pushBackHandler(handleBackToHome);
      return () => {
        spatialNav.popBackHandler(handleBackToHome);
      };
    }
  }, [currentScreen]);

  // When changing screen, auto-focus first item inside content
  useEffect(() => {
    const timer = setTimeout(() => {
      const firstContent = document.querySelector('main [data-tv-focus="true"]:not([disabled])') as HTMLElement;
      if (firstContent) {
        spatialNav.setFocus(firstContent.getAttribute('data-focus-id') || '');
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [currentScreen]);

  const handleLogout = () => {
    Preferences.clearAuth();
    setIsAuthenticated(false);
    setCurrentScreen('auth');
  };

  const handleJoinRoom = async (roomCode: string) => {
    try {
      const rooms = await SkyCineApi.getRooms();
      const targetRoom = rooms.find((r: any) => r.code === roomCode);
      if (targetRoom && targetRoom.mediaId) {
        const media = await SkyCineApi.getMediaItem(targetRoom.mediaId);
        setPlayingItem({ media, roomId: roomCode });
      } else {
        alert(`Комната ${roomCode} не найдена на сервере`);
      }
    } catch (e) {
      alert(`Ошибка подключения к комнате: ${e}`);
    }
  };

  // If not logged in, show Auth Screen
  if (!isAuthenticated) {
    return (
      <div className="w-screen h-screen bg-cinema-950 flex flex-col">
        <AuthPage
          onSuccess={() => {
            setIsAuthenticated(true);
            setCurrentScreen('home');
          }}
        />
        <RemoteSimulator />
      </div>
    );
  }

  // If player is active, render full-screen Tizen Player
  if (playingItem) {
    return (
      <div className="w-screen h-screen bg-transparent">
        <TizenPlayer
          media={playingItem.media}
          episode={playingItem.episode}
          episodesList={playingItem.episodesList}
          roomId={playingItem.roomId}
          onBack={() => setPlayingItem(null)}
          onPlayNext={(nextEp) => {
            setPlayingItem({
              media: playingItem.media,
              episode: nextEp,
              episodesList: playingItem.episodesList,
              roomId: playingItem.roomId
            });
          }}
        />
        <RemoteSimulator />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-cinema-950 flex overflow-hidden">
      {/* Sidebar Navigation Rail */}
      <TVNavRail
        currentScreen={currentScreen}
        onSelectScreen={(screen) => setCurrentScreen(screen)}
        onLogout={handleLogout}
      />

      {/* Main Content View */}
      <main className="flex-1 h-screen overflow-hidden flex flex-col">
        {currentScreen === 'home' && (
          <HomePage
            onPlayMedia={(item) => setPlayingItem({ media: item })}
            onOpenDetail={(item) => setDetailItem(item)}
          />
        )}

        {currentScreen === 'movies' && (
          <CatalogPage
            type="movies"
            onOpenDetail={(item) => setDetailItem(item)}
          />
        )}

        {currentScreen === 'shows' && (
          <CatalogPage
            type="shows"
            onOpenDetail={(item) => setDetailItem(item)}
          />
        )}

        {currentScreen === 'search' && (
          <SearchPage
            onOpenDetail={(item) => setDetailItem(item)}
          />
        )}

        {currentScreen === 'rooms' && (
          <RoomsPage
            onJoinRoom={handleJoinRoom}
          />
        )}

        {currentScreen === 'settings' && (
          <SettingsPage
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Media Detail Modal */}
      {detailItem && (
        <DetailModal
          media={detailItem}
          onClose={() => setDetailItem(null)}
          onPlay={(media, episode, episodesList) => {
            setDetailItem(null);
            setPlayingItem({ media, episode, episodesList });
          }}
        />
      )}

      {/* Remote Simulator (for testing on PC without real TV remote) */}
      <RemoteSimulator />
    </div>
  );
};

export default App;
