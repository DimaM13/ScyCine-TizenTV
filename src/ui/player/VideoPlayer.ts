import { RemoteLogger } from '../../logger';
// Native Samsung Smart TV Fullscreen Video Player (Direct Hardware AVPlay & Seek HUD)

import { MediaItem, Episode, AudioTrackOption } from '../../types';
import { SkyCineApi, episodeProgress, mediaProgress } from '../../api/client';
import { avplayService } from '../../tizen/avplayService';
import { TIZEN_KEYS } from '../../tizen/tizenKeys';
import { focusManager } from '../../tizen/focusManager';
import { RoomSyncClient } from '../../tizen/roomSync';
import { SeekBadge } from '../components/SeekBadge';
import { Preferences } from '../../storage/preferences';
import { Icons } from '../icons';
import { resolveTizenPlayback } from '../../tizen/playbackProfile';

export class VideoPlayer {
  private container: HTMLElement;
  private media: MediaItem;
  private episode?: Episode;
  private episodesList: Episode[] = [];
  private onBackCallback: () => void;
  private onPlayNextCallback?: (nextEp: Episode) => void;
  private roomId: string | null = null;
  private sync: RoomSyncClient | null = null;
  // Explicit start position (resume dialog choice). null/undefined = use saved progress.
  private forceStartSecs: number | null = null;

  private isPlaying: boolean = true;
  private currentTime: number = 0;
  private duration: number = 0;
  private showOSD: boolean = true;
  private osdTimer: any = null;
  private pendingSeekTime: number | null = null;
  private seekDebounceTimer: any = null;
  private seekCalmTimer: any = null;
  private isSeekingActive: boolean = false;
  private progressInterval: any = null;

  private seekBadge: SeekBadge;
  private audioTracks: AudioTrackOption[] = [];
  private activeEpisodeIndex: number = -1;
  // streamIndex выбранной аудиодорожки (параметр audioIndex мастера HLS).
  private hlsAudioIndex: number = 0;

  constructor(
    media: MediaItem,
    episode: Episode | undefined,
    episodesList: Episode[],
    onBack: () => void,
    onPlayNext?: (nextEp: Episode) => void,
    roomId?: string | null,
    forceStartSecs?: number | null
  ) {
    this.media = media;
    this.episode = episode;
    this.episodesList = episodesList;
    this.onBackCallback = onBack;
    this.onPlayNextCallback = onPlayNext;
    this.roomId = roomId || null;
    this.forceStartSecs = forceStartSecs !== undefined ? forceStartSecs : null;

    this.duration = episode?.durationSeconds || media.durationSeconds || 0;

    if (episode && episodesList.length > 0) {
      this.activeEpisodeIndex = episodesList.findIndex(e => e.id === episode.id);
    }

    this.container = document.createElement('div');
    this.container.className = 'player-view';

    this.seekBadge = new SeekBadge();
    this.container.appendChild(this.seekBadge.getElement());

    // 1. Enable Hardware Transparency Hole-Punching for Samsung AVPlay
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    const root = document.getElementById('root');
    if (root) root.style.backgroundColor = 'transparent';

    // 2. Setup Dedicated Remote Control Key Handler
    this.setupRemoteKeyHandler();

    this.render();
    this.startPlayback();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  private handleSeekStep(deltaSecs: number) {
    if (this.pendingSeekTime === null) {
      this.pendingSeekTime = this.currentTime;
    }

    const maxTime = this.duration > 0 ? Math.max(1, this.duration - 2) : Infinity;
    this.pendingSeekTime = Math.max(1, Math.min(maxTime, this.pendingSeekTime + deltaSecs));
    this.isSeekingActive = true;

    // Immediately update UI timeline bar to target position
    this.updateTimelineWithTime(this.pendingSeekTime);

    // Calculate total offset for the badge
    const totalOffset = Math.round(this.pendingSeekTime - this.currentTime);
    const sign = totalOffset > 0 ? '+' : '';
    const icon = totalOffset < 0 ? '⏪' : '⏩';
    this.seekBadge.show(
      `${icon} ${sign}${totalOffset} сек`,
      `${this.formatTime(this.pendingSeekTime)} / ${this.formatTime(this.duration)}`
    );

    // Debounce the actual hardware call so repeated remote clicks aggregate cleanly
    clearTimeout(this.seekDebounceTimer);
    this.seekDebounceTimer = setTimeout(() => {
      if (this.pendingSeekTime !== null) {
        const target = this.pendingSeekTime;
        this.pendingSeekTime = null;
        RemoteLogger.info('PLAYER', `Executing hardware seek to: ${target.toFixed(2)}s`);
        avplayService.seekTo(target);
        // Watch Together: announce aggregated seek once (shouldPlay derived inside)
        try { this.sync?.sendSeek(target); } catch {}
        // Keep isSeekingActive true for 600ms while hardware buffers new frame
        clearTimeout(this.seekCalmTimer);
        this.seekCalmTimer = setTimeout(() => {
          this.isSeekingActive = false;
        }, 600);
      }
    }, 650);
  }

  // ── Local user actions: hardware + room announce ──
  private localPlay() {
    avplayService.play();
    try { this.sync?.sendPlay(); } catch {}
  }

  private localPause() {
    avplayService.pause();
    try { this.sync?.sendPause(); } catch {}
  }

  private localToggle() {
    const willPlay = !this.isPlaying;
    avplayService.togglePlay();
    try {
      if (willPlay) this.sync?.sendPlay();
      else this.sync?.sendPause();
    } catch {}
  }

  // ── Remote-applied actions (from RoomSyncClient): hardware only, never re-emit ──
  private applySyncSeek(pos: number, shouldPlay: boolean) {
    avplayService.seekTo(pos, shouldPlay);
  }

  private applySyncPlay() {
    avplayService.play();
  }

  private applySyncPause() {
    avplayService.pause();
  }

  private setupRemoteKeyHandler() {
    focusManager.customKeyHandler = (keyCode: number) => {
      // 1. Stop / Exit Player (Return, Esc, or Stop)
      if (keyCode === TIZEN_KEYS.KEY_STOP || keyCode === TIZEN_KEYS.KEY_RETURN || keyCode === 27) {
        RemoteLogger.info('REMOTE', 'Exit player key pressed');
        this.close();
        return true;
      }

      // 2. Physical Media Keys (Always work)
      if (keyCode === TIZEN_KEYS.KEY_PLAY) {
        RemoteLogger.info('REMOTE', 'KEY_PLAY pressed');
        this.localPlay();
        return true;
      }
      if (keyCode === TIZEN_KEYS.KEY_PAUSE) {
        RemoteLogger.info('REMOTE', 'KEY_PAUSE pressed');
        this.localPause();
        return true;
      }
      if (keyCode === TIZEN_KEYS.KEY_PLAY_PAUSE || keyCode === 32 /* Space */) {
        RemoteLogger.info('REMOTE', 'KEY_PLAY_PAUSE / SPACE pressed');
        this.localToggle();
        return true;
      }
      if (keyCode === TIZEN_KEYS.KEY_REWIND) {
        RemoteLogger.info('REMOTE', 'KEY_REWIND pressed');
        this.handleSeekStep(-10);
        return true;
      }
      if (keyCode === TIZEN_KEYS.KEY_FAST_FORWARD) {
        RemoteLogger.info('REMOTE', 'KEY_FAST_FORWARD pressed');
        this.handleSeekStep(10);
        return true;
      }

      // 3. OK / Enter Key
      if (keyCode === TIZEN_KEYS.KEY_ENTER) {
        RemoteLogger.info('REMOTE', 'KEY_ENTER pressed in VideoPlayer');
        const current = focusManager.getCurrentFocusedElement();
        const focusId = current?.getAttribute('data-focus-id');
        // Clickable buttons: let focusManager click them (seek/play/pause as labeled)
        if (focusId === 'player-back-btn' || focusId === 'player-aspect-btn' || focusId === 'player-audio-btn' || focusId === 'player-next-btn' || focusId === 'player-rewind-btn' || focusId === 'player-forward-btn') {
          return false;
        }
        // Everywhere else (play button, timeline, or watching full screen): Toggle Play/Pause!
        this.localToggle();
        return true;
      }

      // 4. Directional D-pad Keys
      const current = focusManager.getCurrentFocusedElement();
      const focusId = current?.getAttribute('data-focus-id');

      if (keyCode === TIZEN_KEYS.KEY_UP) {
        this.setOSDVisible(true);
        this.resetOSDTimer();
        focusManager.focus('player-back-btn');
        return true;
      }

      if (keyCode === TIZEN_KEYS.KEY_DOWN) {
        this.setOSDVisible(true);
        this.resetOSDTimer();
        focusManager.focus('player-play-btn');
        return true;
      }

      if (keyCode === TIZEN_KEYS.KEY_LEFT) {
        // If focused on header buttons (aspect or audio), navigate left to back button
        if (focusId === 'player-aspect-btn' || focusId === 'player-audio-btn') {
          focusManager.focus('player-back-btn');
          this.resetOSDTimer();
          return true;
        }
        // Everywhere else: DIRECT SEEK -10s!
        this.handleSeekStep(-10);
        return true;
      }

      if (keyCode === TIZEN_KEYS.KEY_RIGHT) {
        // If focused on back button, navigate right to aspect or audio
        if (focusId === 'player-back-btn') {
          focusManager.focus('player-aspect-btn');
          this.resetOSDTimer();
          return true;
        }
        // Everywhere else: DIRECT SEEK +10s!
        this.handleSeekStep(10);
        return true;
      }

      return false;
    };
  }
  private resetOSDTimer() {
    this.setOSDVisible(true);
    clearTimeout(this.osdTimer);
    this.osdTimer = setTimeout(() => {
      this.setOSDVisible(false);
    }, 4500);
  }

  private toggleOSD() {
    if (this.showOSD) {
      this.setOSDVisible(false);
    } else {
      this.resetOSDTimer();
      focusManager.focus('player-play-btn');
    }
  }

  private setOSDVisible(visible: boolean) {
    this.showOSD = visible;
    const osd = this.container.querySelector('.player-osd');
    if (osd) {
      if (visible) osd.classList.remove('hidden');
      else osd.classList.add('hidden');
    }
  }

  private formatTime(secs: number): string {
    const total = Math.max(0, Math.floor(secs));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  private async startPlayback() {
    const targetItem = this.episode || this.media;
    const targetId = this.episode?.id || this.media.effectiveId || this.media.id;
    if (!targetId || targetId === 'undefined') {
      RemoteLogger.error('PLAYER', 'Cannot start playback: targetId is undefined');
      this.close();
      return;
    }

    // Fetch stream info: exact duration, codecs (для лога решения), audio tracks.
    // Non-fatal: fall back to local metadata if the request fails.
    let videoCodec = (targetItem as any).videoCodec || this.media.videoCodec || '';
    let audioCodec = (targetItem as any).audioCodec || this.media.audioCodec || '';
    try {
      const info = await SkyCineApi.getStreamInfo(targetId);
      if (info) {
        if (info.durationSeconds && info.durationSeconds > 0) {
          this.duration = info.durationSeconds;
        }
        if (info.videoCodec) videoCodec = info.videoCodec;
        if (info.audioCodec) audioCodec = info.audioCodec;
        if (Array.isArray(info.audioTracks) && info.audioTracks.length > 0) {
          this.audioTracks = info.audioTracks.map((t: any, idx: number) => ({
            index: t.streamIndex !== undefined ? t.streamIndex : idx,
            id: String(t.streamIndex !== undefined ? t.streamIndex : idx),
            label: t.title || (t.language ? `Дорожка (${t.language.toUpperCase()})` : `Дорожка ${idx + 1}`),
            language: t.language || 'ru',
            channels: t.channels || 2,
            codec: t.codec || 'AAC',
            isSelected: Boolean(t.isDefault || idx === 0)
          }));
          // Дефолтная дорожка сервера едет в audioIndex мастера HLS.
          const def = this.audioTracks.find(t => t.isSelected) || this.audioTracks[0];
          this.hlsAudioIndex = def ? def.index : 0;
          this.updateAudioBtn();
        }
      }
    } catch (e) {
      RemoteLogger.warn('PLAYER', `Stream info check failed, using local metadata: ${e}`);
    }

    // Explicit choice from resume dialog wins over saved progress (0 = restart).
    // Episode progress may arrive as userProgress (server) — helper normalizes.
    const savedPos = this.episode
      ? (episodeProgress(this.episode) || mediaProgress(this.media))
      : mediaProgress(this.media);
    const startPos = this.forceStartSecs !== null && this.forceStartSecs !== undefined
      ? Math.max(0, this.forceStartSecs)
      : savedPos;
    const safeStart = startPos > 5 && (!this.duration || startPos < this.duration - 20) ? startPos : 0;

    avplayService.setCallbacks({
      onTimeUpdate: (cur, dur) => {
        if (this.isSeekingActive || this.pendingSeekTime !== null) return;
        this.currentTime = cur;
        // Duration only from metadata: HLS firmware reports playlist window, not movie
        this.updateTimeline();
      },
      onStateChange: (playing) => {
        this.isPlaying = playing;
        this.updatePlayBtnState();
        this.seekBadge.show(playing ? '▶️ Воспроизведение' : '⏸️ Пауза', '');
      },
      onError: (msg: string) => {
        console.error('[VideoPlayer] Playback error:', msg);
        this.seekBadge.show('⚠️ Ошибка', msg);
      },
      onSeekFailed: (target: number) => {
        this.seekBadge.show('⚠️ Перемотка не удалась', `${this.formatTime(target)} — проверьте сеть`);
      },
      onEngineChange: (engine) => {
        const label = this.container.querySelector('#player-engine-label');
        if (label) {
          label.textContent = engine === 'html5' ? 'HTML5 · перемотка' : 'HLS · AVPlay';
        }
      },
      onEnded: () => {
        this.handlePlaybackEnded();
      },
      onTracksChanged: (tracks) => {
        // AVPlay-direct: refresh native track list. HTML5: browser list arrives via loadedmetadata.
        if (tracks.length > 0) {
          this.audioTracks = tracks;
          this.updateAudioBtn();
        }
      }
    });

    // Tizen = ВСЕГДА HLS: нативный AVPlay открывает master.m3u8 (fMP4).
    // Решение фиксируем в лог (профиль: server/.../tv-profiles/tizen.profile.ts).
    const decision = resolveTizenPlayback({
      videoCodec,
      audioCodec,
      filePath: (targetItem as any).filePath,
    });
    RemoteLogger.info('PLAYER', `Playback mode: HLS (fMP4). Media decision: ${decision.reasons.join('; ')}`);
    const hlsUrl = SkyCineApi.getHlsUrl(targetId, { audioIndex: this.hlsAudioIndex, startSecs: safeStart });
    RemoteLogger.info('PLAYER', `Starting HLS playback at ${safeStart}s (audioIndex=${this.hlsAudioIndex})`);
    // NOTE: setKnownDuration ПОСЛЕ openHls — внутри openHls() идёт close() (сброс
    // состояния), а prepareAsync асинхронный, поэтому установка сразу после вызова
    // успевает до колбэка. В HLS-режиме длительность из железа НЕ перезаписывается.
    avplayService.openHls({
      url: hlsUrl,
      startSecs: safeStart,
      audioIndex: this.hlsAudioIndex,
    });
    avplayService.setKnownDuration(this.duration);

    // Watch Together sync (only when opened from a room)
    if (this.roomId) {
      this.startRoomSync(this.roomId);
    }

    // Save playback progress periodically
    this.progressInterval = setInterval(() => {
      if (targetId && this.currentTime > 5 && this.duration > 0) {
        SkyCineApi.updateProgress(targetId, this.currentTime, this.duration).catch(() => {});
      }
    }, 15000);

    this.resetOSDTimer();
  }

  private startRoomSync(roomId: string) {
    try {
      const user = Preferences.getUser();
      let userId = user?.id || '';
      const username = user?.username || 'Гость ТВ';
      if (!userId) {
        userId = localStorage.getItem('skycine_guest_id') || '';
        if (!userId) {
          userId = `tizen_${Math.random().toString(36).substring(2, 10)}`;
          try { localStorage.setItem('skycine_guest_id', userId); } catch {}
        }
      }
      const serverUrl = Preferences.getServerUrl();
      this.sync = new RoomSyncClient(serverUrl, roomId, userId, username, {
        getPos: () => avplayService.getCurrentPos(),
        isPaused: () => !this.isPlaying,
        isBuffering: () => avplayService.isBufferingNow(),
        doSeek: (pos, shouldPlay) => this.applySyncSeek(pos, shouldPlay),
        doPlay: () => this.applySyncPlay(),
        doPause: () => this.applySyncPause(),
        showBadge: (title, sub) => this.seekBadge.show(title, sub),
      }, Preferences.getToken());
      RemoteLogger.info('PLAYER', `Room sync joined: ${roomId} as ${username}`);
    } catch (e: any) {
      RemoteLogger.error('PLAYER', `Room sync failed, continuing solo: ${e?.message || e}`);
      this.sync = null;
    }
  }

  private updateTimelineWithTime(time: number) {
    const curEl = this.container.querySelector('#player-current-time');
    if (curEl) curEl.textContent = this.formatTime(time);

    // Справа — остаток цифрами (сколько осталось до конца), без надписей
    const durEl = this.container.querySelector('#player-duration-time');
    if (durEl) {
      durEl.textContent = this.duration > 0 ? `-${this.formatTime(Math.max(0, this.duration - time))}` : '--:--';
    }

    const fillEl = this.container.querySelector('#player-progress-fill') as HTMLElement;
    if (fillEl && this.duration > 0) {
      const pct = Math.min(100, Math.max(0, (time / this.duration) * 100));
      fillEl.style.width = `${pct}%`;
    }
  }

  private updateTimeline() {
    this.updateTimelineWithTime(this.currentTime);
  }

  private updatePlayBtnState() {
    const btn = this.container.querySelector('[data-focus-id="player-play-btn"]');
    if (btn) {
      btn.innerHTML = `
        ${this.isPlaying ? Icons.pause(24, '#07090e') : Icons.play(24, '#07090e')}
        <span>${this.isPlaying ? 'Пауза' : 'Воспроизведение'}</span>
      `;
    }
  }

  private updateAudioBtn() {
    const btn = this.container.querySelector('[data-focus-id="player-audio-btn"]');
    if (btn) {
      (btn as HTMLElement).style.display = this.audioTracks.length > 1 ? 'inline-flex' : 'none';
      const label = btn.querySelector('span');
      if (label) label.textContent = `Дорожки (${this.audioTracks.length})`;
    }
  }

  private handlePlaybackEnded() {
    const hasNext = this.activeEpisodeIndex !== -1 && this.activeEpisodeIndex < this.episodesList.length - 1;
    if (hasNext && this.onPlayNextCallback) {
      const nextEp = this.episodesList[this.activeEpisodeIndex + 1];
      this.close();
      this.onPlayNextCallback(nextEp);
    } else {
      this.close();
    }
  }

  public onMounted() {
    this.resetOSDTimer();
    focusManager.focus('player-play-btn');
  }

  public close() {
    // Save final progress
    const targetId = this.episode?.id || this.media.effectiveId || this.media.id;
    if (targetId && this.currentTime > 5 && this.duration > 0) {
      SkyCineApi.updateProgress(targetId, this.currentTime, this.duration).catch(() => {});
    }
    // Гасим HLS-сессию сервера (client=tizen внутри endHlsSession).
    // Fire-and-forget: плеер уже закрывается, idle-свипер — страховка.
    if (targetId) {
      SkyCineApi.endHlsSession(targetId, this.hlsAudioIndex).catch(() => {});
    }

    clearTimeout(this.osdTimer);
    clearTimeout(this.seekDebounceTimer);
    clearTimeout(this.seekCalmTimer);
    clearInterval(this.progressInterval);
    this.pendingSeekTime = null;
    this.isSeekingActive = false;
    focusManager.customKeyHandler = null;

    // Leave Watch Together room (stops heartbeats + socket)
    try { this.sync?.leave(); } catch {}
    this.sync = null;

    avplayService.close();

    // Revert hole punching
    document.documentElement.style.backgroundColor = '#07090e';
    document.body.style.backgroundColor = '#07090e';
    const root = document.getElementById('root');
    if (root) root.style.backgroundColor = '#07090e';

    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.onBackCallback();
  }

  public render() {
    const title = this.episode
      ? `${this.media.title || this.media.showTitle || ''} • ${this.episode.episodeNumber} серия: ${this.episode.title || ''}`
      : this.media.title || 'Видео';

    const hasNext = this.activeEpisodeIndex !== -1 && this.activeEpisodeIndex < this.episodesList.length - 1;

    this.container.innerHTML = `
      <!-- OSD Overlay -->
      <div class="player-osd">
        <!-- Top Header -->
        <div class="player-header">
          <div style="display: flex; align-items: center; margin-right: 20px;">
            <button 
              type="button" 
              class="tv-btn tv-btn-secondary" 
              data-tv-focus="true" 
              data-focus-id="player-back-btn"
              tabindex="0"
            >
              ${Icons.arrowLeft(20, '#ffffff')}
              <span>Назад</span>
            </button>
            <div class="player-title-wrap">
              <div class="player-title">${title}</div>
              <div class="player-engine-line"><span class="player-engine-dot"></span><span id="player-engine-label">HLS · AVPlay</span></div>
            </div>
          </div>

          <div style="display: flex; align-items: center; margin-right: 14px;">
            <button 
              type="button" 
              class="tv-btn tv-btn-secondary" 
              data-tv-focus="true" 
              data-focus-id="player-aspect-btn"
              tabindex="0"
            >
              ${Icons.aspect(20, '#ffffff')}
              <span id="player-aspect-label">Кадр: Вписать</span>
            </button>

            <button 
              type="button" 
              class="tv-btn tv-btn-secondary" 
              data-tv-focus="true" 
              data-focus-id="player-audio-btn"
              tabindex="0"
              style="display: none;"
            >
              ${Icons.volume(20, '#ffffff')}
              <span>Дорожки</span>
            </button>
          </div>
        </div>

        <!-- Bottom Timeline and Controls -->
        <div class="player-controls-bottom">
          <!-- Timeline Slider -->
          <div class="player-timeline-bar">
            <span class="timeline-time" id="player-current-time">00:00</span>
            <div class="timeline-track" aria-label="Ход воспроизведения">
              <div class="timeline-fill" id="player-progress-fill"></div>
            </div>
            <span class="timeline-time timeline-remaining" id="player-duration-time">--:--</span>
          </div>

          <!-- Buttons Row -->
          <div class="player-btn-row">
            <button 
              type="button" 
              class="tv-btn tv-btn-secondary" 
              data-tv-focus="true" 
              data-focus-id="player-rewind-btn"
              tabindex="0"
            >
              ${Icons.rewind(20, '#ffffff')}
              <span>-10 сек</span>
            </button>

            <button 
              type="button" 
              class="tv-btn tv-btn-primary" 
              data-tv-focus="true" 
              data-focus-id="player-play-btn"
              tabindex="0"
              style="padding: 0 40px;"
            >
              ${Icons.pause(24, '#07090e')}
              <span>Пауза</span>
            </button>

            <button 
              type="button" 
              class="tv-btn tv-btn-secondary" 
              data-tv-focus="true" 
              data-focus-id="player-forward-btn"
              tabindex="0"
            >
              ${Icons.fastForward(20, '#ffffff')}
              <span>+10 сек</span>
            </button>

            ${
              hasNext
                ? `
              <button 
                type="button" 
                class="tv-btn tv-btn-secondary" 
                data-tv-focus="true" 
                data-focus-id="player-next-btn"
                tabindex="0"
              >
                ${Icons.next(20, '#ffffff')}
                <span>След. серия</span>
              </button>
            `
                : ''
            }
          </div>
        </div>
      </div>
    `;

    // Attach OSD Button Click Handlers
    const backBtn = this.container.querySelector('[data-focus-id="player-back-btn"]');
    if (backBtn) backBtn.addEventListener('click', () => this.close());

    const playBtn = this.container.querySelector('[data-focus-id="player-play-btn"]');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.localToggle();
        this.resetOSDTimer();
      });
    }

    const rewindBtn = this.container.querySelector('[data-focus-id="player-rewind-btn"]');
    if (rewindBtn) {
      rewindBtn.addEventListener('click', () => {
        // Single aggregated seek path (same as remote arrows)
        this.handleSeekStep(-10);
        this.resetOSDTimer();
      });
    }

    const forwardBtn = this.container.querySelector('[data-focus-id="player-forward-btn"]');
    if (forwardBtn) {
      forwardBtn.addEventListener('click', () => {
        // Single aggregated seek path (same as remote arrows)
        this.handleSeekStep(10);
        this.resetOSDTimer();
      });
    }

    const nextBtn = this.container.querySelector('[data-focus-id="player-next-btn"]');
    if (nextBtn && hasNext) {
      nextBtn.addEventListener('click', () => {
        const nextEp = this.episodesList[this.activeEpisodeIndex + 1];
        this.close();
        if (this.onPlayNextCallback) this.onPlayNextCallback(nextEp);
      });
    }

    const aspectBtn = this.container.querySelector('[data-focus-id="player-aspect-btn"]');
    if (aspectBtn) {
      aspectBtn.addEventListener('click', () => {
        const current = Preferences.getAspectRatio();
        const next = current === 'FIT' ? 'ZOOM' : current === 'ZOOM' ? 'STRETCH' : 'FIT';
        Preferences.setAspectRatio(next);
        avplayService.setAspectRatio(next);
        const label = this.container.querySelector('#player-aspect-label');
        if (label) {
          label.textContent = next === 'FIT' ? 'Кадр: Вписать' : next === 'ZOOM' ? 'Кадр: Обрезать' : 'Кадр: Растянуть';
        }
        this.resetOSDTimer();
      });
    }

    const audioBtn = this.container.querySelector('[data-focus-id="player-audio-btn"]');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        if (this.audioTracks.length > 1) {
          const curTrackIdx = this.audioTracks.findIndex(t => t.isSelected);
          const nextIdx = (curTrackIdx + 1) % this.audioTracks.length;
          const next = this.audioTracks[nextIdx];
          // HLS: смена дорожки = переоткрытие мастера с новым audioIndex
          // (в single-rendition плейлисте setSelectTrack нечего выбирать).
          // Старую сессию гасим точечно, иначе висит до idle-таймаута.
          const oldIdx = this.hlsAudioIndex;
          this.hlsAudioIndex = next.index;
          const targetId = this.episode?.id || this.media.effectiveId || this.media.id;
          if (oldIdx !== next.index) {
            SkyCineApi.endHlsSession(targetId, oldIdx).catch(() => {});
          }
          const url = SkyCineApi.getHlsUrl(targetId, { audioIndex: this.hlsAudioIndex });
          avplayService.reopenHls(url, this.currentTime, this.isPlaying);
          this.audioTracks.forEach((t, i) => t.isSelected = i === nextIdx);
          this.seekBadge.show('🔊 Аудиодорожка', `${next.label} (HLS)`);
          this.resetOSDTimer();
        }
      });
    }

    // Default focus
    setTimeout(() => {
      focusManager.focus('player-play-btn');
    }, 100);
  }
}
