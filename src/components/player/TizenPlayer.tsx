import React, { useState, useEffect, useRef } from 'react';
import { MediaItem, Episode, AudioTrackOption } from '../../types';
import { SkyCineApi } from '../../api/client';
import { avplayService } from '../../tizen/avplayService';
import { TIZEN_KEYS } from '../../tizen/tizenKeys';
import { spatialNav } from '../../tizen/spatialNavigation';
import { AudioDialog } from './AudioDialog';
import { TVButton } from '../common/TVButton';
import { ArrowLeft, Play, Pause, RotateCcw, FastForward, Volume2, SkipForward } from 'lucide-react';
import { Preferences } from '../../storage/preferences';
import { io, Socket } from 'socket.io-client';

interface TizenPlayerProps {
  media: MediaItem;
  episode?: Episode;
  episodesList?: Episode[];
  roomId?: string;
  onBack: () => void;
  onPlayNext?: (nextEp: Episode) => void;
}

export const TizenPlayer: React.FC<TizenPlayerProps> = ({
  media,
  episode,
  episodesList = [],
  roomId,
  onBack,
  onPlayNext
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showOSD, setShowOSD] = useState(true);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  // Countdown for next episode
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownSecs, setCountdownSecs] = useState(5);

  const osdTimerRef = useRef<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeEpisode = episode;

  const nextEpisode = React.useMemo(() => {
    if (activeEpisode && episodesList.length > 0) {
      const idx = episodesList.findIndex(e => e.id === activeEpisode.id);
      if (idx !== -1 && idx < episodesList.length - 1) {
        return episodesList[idx + 1];
      }
    }
    return null;
  }, [activeEpisode, episodesList]);

  const streamUrl = SkyCineApi.getStreamUrl(activeEpisode?.id || media.effectiveId || media.id);

  // Safe initial position: don't resume if already completed (>duration - 15)
  const rawInitialPos = activeEpisode?.progressSeconds || media.userProgress || 0;
  const safeInitialPos = (rawInitialPos > 5 && (!media.durationSeconds || rawInitialPos < media.durationSeconds - 20))
    ? rawInitialPos
    : 0;

  const formatTime = (secs: number) => {
    const total = Math.max(0, Math.floor(secs));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : n);
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const resetOSDTimer = () => {
    setShowOSD(true);
    spatialNav.setEnabled(true);
    clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => {
      setShowOSD(false);
      spatialNav.setEnabled(false); // Disable spatial arrows so Left/Right only seek
    }, 4000);
  };

  // 1. Tizen AVPlay Video Transparency Hole-Punching Lifecycle
  useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    const rootEl = document.getElementById('root');
    if (rootEl) rootEl.style.backgroundColor = 'transparent';

    return () => {
      document.documentElement.style.backgroundColor = '#07090e';
      document.body.style.backgroundColor = '#07090e';
      if (rootEl) rootEl.style.backgroundColor = '#07090e';
    };
  }, []);

  // 2. Spatial Navigation Back Handler
  useEffect(() => {
    const handleBack = () => {
      if (showAudioModal) {
        setShowAudioModal(false);
        return true;
      }
      onBack();
      return true;
    };

    spatialNav.pushBackHandler(handleBack);
    return () => {
      spatialNav.popBackHandler(handleBack);
    };
  }, [showAudioModal, onBack]);

  // 3. Socket.IO Watch Together Sync
  useEffect(() => {
    if (!roomId) return;

    const serverUrl = Preferences.getServerUrl();
    const socket = io(serverUrl, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.emit('JOIN_ROOM', { roomId, username: Preferences.getUser()?.username || 'Samsung TV' });

    socket.on('ROOM_SYNC', (data: { action: 'PLAY' | 'PAUSE' | 'SEEK'; pos: number }) => {
      if (data.action === 'SEEK') {
        avplayService.seekTo(data.pos);
      } else if (data.action === 'PLAY') {
        avplayService.play();
      } else if (data.action === 'PAUSE') {
        avplayService.pause();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  // 4. Player Startup & Callback Registration
  useEffect(() => {
    resetOSDTimer();

    avplayService.setCallbacks({
      onTimeUpdate: (cur, dur) => {
        setCurrentTime(cur);
        setDuration(dur);

        // Auto next episode countdown when nearing end (>95% and >60s long)
        if (nextEpisode && dur > 60 && cur >= (dur - 15) && !showCountdown) {
          setShowCountdown(true);
        }
      },
      onStateChange: (playing, buffering) => {
        setIsPlaying(playing);
        setIsBuffering(buffering);
      },
      onError: (msg) => {
        setErrorMessage(msg);
      },
      onEnded: () => {
        if (nextEpisode && onPlayNext) {
          onPlayNext(nextEpisode);
        } else {
          onBack();
        }
      },
      onTracksChanged: (tracks) => {
        setAudioTracks(tracks);
      }
    });

    avplayService.open(streamUrl, safeInitialPos);

    // Progress updates to server every 15s
    const progressInterval = setInterval(() => {
      const targetId = activeEpisode?.id || media.effectiveId || media.id;
      if (targetId && currentTime > 5 && duration > 0) {
        SkyCineApi.updateProgress(targetId, currentTime, duration).catch(() => {});
      }
    }, 15000);

    return () => {
      clearTimeout(osdTimerRef.current);
      clearInterval(progressInterval);
      avplayService.close();
    };
  }, [streamUrl]);

  // Countdown timer tick
  useEffect(() => {
    if (!showCountdown) return;
    const interval = setInterval(() => {
      setCountdownSecs((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (nextEpisode && onPlayNext) onPlayNext(nextEpisode);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showCountdown, nextEpisode]);

  // Remote key listener for fast seek and media keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      if (code === TIZEN_KEYS.KEY_PLAY_PAUSE || code === 32 /* Space */) {
        e.preventDefault();
        avplayService.togglePlay();
        if (socketRef.current && roomId) {
          socketRef.current.emit('ROOM_ACTION', { roomId, action: isPlaying ? 'PAUSE' : 'PLAY', pos: currentTime });
        }
        resetOSDTimer();
        return;
      }

      if (code === TIZEN_KEYS.KEY_LEFT || code === TIZEN_KEYS.KEY_REWIND) {
        e.preventDefault();
        const target = Math.max(0, currentTime - 10);
        avplayService.seekRelative(-10);
        if (socketRef.current && roomId) {
          socketRef.current.emit('ROOM_ACTION', { roomId, action: 'SEEK', pos: target });
        }
        resetOSDTimer();
        return;
      }

      if (code === TIZEN_KEYS.KEY_RIGHT || code === TIZEN_KEYS.KEY_FAST_FORWARD) {
        e.preventDefault();
        const target = currentTime + 10;
        avplayService.seekRelative(10);
        if (socketRef.current && roomId) {
          socketRef.current.emit('ROOM_ACTION', { roomId, action: 'SEEK', pos: target });
        }
        resetOSDTimer();
        return;
      }

      if (code === TIZEN_KEYS.KEY_UP || code === TIZEN_KEYS.KEY_DOWN || code === TIZEN_KEYS.KEY_ENTER) {
        resetOSDTimer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAudioModal, isPlaying, currentTime, roomId]);

  const title = activeEpisode
    ? `${media.title} — Серия ${activeEpisode.episodeNumber}${activeEpisode.title ? `: ${activeEpisode.title}` : ''}`
    : media.title;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      data-tizen-player="true"
      className="fixed inset-0 w-full h-full bg-transparent select-none z-50 overflow-hidden"
    >
      {/* Loading / Buffering Spinner */}
      {isBuffering && !errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="bg-black/75 backdrop-blur-md p-6 rounded-2xl flex flex-col items-center gap-3 border border-cinema-gold/30">
            <div className="w-12 h-12 border-4 border-cinema-gold/20 border-t-cinema-gold rounded-full animate-spin"></div>
            <span className="text-xs font-bold text-cinema-gold">Загрузка видео...</span>
          </div>
        </div>
      )}

      {/* Error View */}
      {errorMessage && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-8 z-40 text-center">
          <h2 className="text-2xl font-bold text-red-500 mb-2">Ошибка воспроизведения</h2>
          <p className="text-slate-300 max-w-md mb-6">{errorMessage}</p>
          <TVButton variant="primary" onClick={onBack}>
            Вернуться назад
          </TVButton>
        </div>
      )}

      {/* Next Episode Countdown Overlay */}
      {showCountdown && nextEpisode && (
        <div className="absolute bottom-28 right-12 z-40 bg-cinema-900/95 border-2 border-cinema-gold rounded-2xl p-6 shadow-gold-glow max-w-sm">
          <h4 className="text-xs font-bold text-cinema-gold uppercase tracking-wider mb-1">
            Следующая серия через {countdownSecs} сек...
          </h4>
          <p className="text-base font-bold text-white truncate mb-4">
            {nextEpisode.episodeNumber} серия: {nextEpisode.title || 'Новая серия'}
          </p>
          <div className="flex gap-2">
            <TVButton
              variant="primary"
              className="flex-1 py-2 text-xs"
              onClick={() => onPlayNext && onPlayNext(nextEpisode)}
            >
              Смотреть сейчас
            </TVButton>
            <TVButton
              variant="ghost"
              className="py-2 text-xs"
              onClick={() => setShowCountdown(false)}
            >
              Отмена
            </TVButton>
          </div>
        </div>
      )}

      {/* OSD Overlay Controls */}
      <div
        className={`absolute inset-0 flex flex-col justify-between p-12 transition-opacity duration-300 pointer-events-auto z-20 ${
          showOSD ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between bg-gradient-to-b from-black/95 via-black/70 to-transparent p-6 -m-12 pb-16">
          <div className="flex items-center gap-4">
            <TVButton
              id="player-back-btn"
              variant="secondary"
              onClick={onBack}
              icon={<ArrowLeft className="w-5 h-5" />}
            >
              Назад
            </TVButton>
            <div>
              <h2 className="text-xl font-bold text-white truncate max-w-2xl">{title}</h2>
              <p className="text-xs text-cinema-gold font-semibold">
                {avplayService.isTizenAVPlay()
                  ? 'Samsung Tizen AVPlay Hardware Engine • Zero-Copy Direct'
                  : 'HTML5 Video Engine'}
                {roomId && ' • Комната совместного просмотра'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {audioTracks.length > 0 && (
              <TVButton
                id="player-audio-btn"
                variant="secondary"
                onClick={() => setShowAudioModal(true)}
                icon={<Volume2 className="w-5 h-5" />}
              >
                Аудиодорожки
              </TVButton>
            )}
          </div>
        </div>

        {/* Bottom Timeline & Controls */}
        <div className="flex flex-col gap-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-8 -m-12 pt-16">
          {/* Progress Bar Slider */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono font-bold text-slate-200">
              {formatTime(currentTime)}
            </span>
            <div className="flex-1 h-2.5 bg-slate-800/80 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-cinema-gold shadow-gold-glow"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-slate-400">
              {formatTime(duration)}
            </span>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-3 justify-center">
            <TVButton
              id="player-rewind-btn"
              variant="secondary"
              onClick={() => {
                avplayService.seekRelative(-10);
                if (socketRef.current && roomId) {
                  socketRef.current.emit('ROOM_ACTION', { roomId, action: 'SEEK', pos: Math.max(0, currentTime - 10) });
                }
              }}
              icon={<RotateCcw className="w-4 h-4" />}
            >
              -10 сек
            </TVButton>

            <TVButton
              id="player-play-btn"
              variant="primary"
              onClick={() => {
                avplayService.togglePlay();
                if (socketRef.current && roomId) {
                  socketRef.current.emit('ROOM_ACTION', { roomId, action: isPlaying ? 'PAUSE' : 'PLAY', pos: currentTime });
                }
              }}
              icon={isPlaying ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950" />}
              className="px-8"
            >
              {isPlaying ? 'Пауза' : 'Воспроизведение'}
            </TVButton>

            <TVButton
              id="player-forward-btn"
              variant="secondary"
              onClick={() => {
                avplayService.seekRelative(10);
                if (socketRef.current && roomId) {
                  socketRef.current.emit('ROOM_ACTION', { roomId, action: 'SEEK', pos: currentTime + 10 });
                }
              }}
              icon={<FastForward className="w-4 h-4" />}
            >
              +10 сек
            </TVButton>

            {nextEpisode && (
              <TVButton
                id="player-next-btn"
                variant="secondary"
                onClick={() => onPlayNext && onPlayNext(nextEpisode)}
                icon={<SkipForward className="w-4 h-4" />}
              >
                След. серия
              </TVButton>
            )}
          </div>
        </div>
      </div>

      {/* Audio Track Selector Modal */}
      {showAudioModal && (
        <AudioDialog
          tracks={audioTracks}
          onSelectTrack={(track) => {
            avplayService.selectAudioTrack(track);
            setShowAudioModal(false);
          }}
          onClose={() => setShowAudioModal(false)}
        />
      )}
    </div>
  );
};
