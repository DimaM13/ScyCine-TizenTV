import { AudioTrackOption } from '../types';
import { Preferences } from '../storage/preferences';
import { SkyCineApi } from '../api/client';
import { RemoteLogger } from '../logger';

export interface AVPlayCallbacks {
  onTimeUpdate?: (currentTimeSecs: number, durationSecs: number) => void;
  onStateChange?: (isPlaying: boolean, isBuffering: boolean) => void;
  onError?: (message: string) => void;
  onEnded?: () => void;
  onTracksChanged?: (tracks: AudioTrackOption[]) => void;
  onSeekFailed?: (targetSecs: number) => void;
  onEngineChange?: (engine: 'html5' | 'avplay') => void;
}

export class AVPlayService {
  private isPrepared: boolean = false;
  private isPlayingState: boolean = false;
  private isSeeking: boolean = false;
  private isHardwareBusy: boolean = false;
  private queuedSeek: { target: number } | null = null;
  private queueRetryTimer: any = null;
  private queueAttempts: number = 0;
  private static readonly QUEUE_MAX_ATTEMPTS = 16; // ~8s at 500ms
  private seekFailRetries: number = 0;
  private static readonly SEEK_FAIL_MAX_RETRIES = 3;
  private seekFailedOnce: boolean = false; // current seek cycle already failed HW-side
  private seekGen: number = 0; // guards against stale async callbacks
  private jumpTried: boolean = false; // jumpForward/Backward fallback attempted this cycle
  private jumpWatch: { target: number; deadline: number } | null = null;
  // Play/pause intent received mid-seek (docs: no API calls during async seek).
  // Applied when the seek settles instead of throwing InvalidStateError.
  private pendingPlayState: boolean | null = null;
  private trackRetryTimer: any = null;
  private trackRetryCount: number = 0;
  private visibilityHandler: any = null;
  private isBufferingState: boolean = false;
  private seekSafetyTimer: any = null;
  private durationSecs: number = 0;
  private lastTogglePlayTime: number = 0;
  private currentPosSecs: number = 0;
  private lastHardwarePosSecs: number = 0; // truth from oncurrentplaytime, never optimistic
  private callbacks: AVPlayCallbacks = {};
  private timerInterval: any = null;
  private html5Video: HTMLVideoElement | null = null;
  private avPlayerContainer: HTMLElement | null = null;
  // Движок прямого потока: 'html5' (браузер, мотает Range) или 'avplay' (железо)
  private activeEngine: 'html5' | 'avplay' = 'avplay';
  private directUrl: string = '';
  private directStartSecs: number = 0;
  private directStartSeekSecs: number = 0;
  private directTriedHtml5: boolean = false;
  private directTriedAvplay: boolean = false;
  private avplayAutoPlay: boolean = true;
  // HLS-режим (единственный прод-путь): AVPlay открывает master.m3u8 сервера.
  // Длительность берём только из knownDuration (метаданные), прошивка для HLS
  // отдаёт окно плейлиста, а не фильм. Перемотка — штатный seekTo, reopen не нужен.
  private isHlsMode: boolean = false;
  private hlsAudioIndex: number = 0;

  public isTizenAVPlay(): boolean {
    // AVPlay доступен как движок (выбор HTML5/AVPlay решает openDirect).
    return typeof window !== 'undefined' && Boolean((window as any).webapis?.avplay);
  }

  public getCurrentPos(): number {
    return this.currentPosSecs;
  }

  public isPlayingNow(): boolean {
    return this.isPlayingState;
  }

  public isBufferingNow(): boolean {
    return this.isBufferingState;
  }

  public getActiveEngine(): 'html5' | 'avplay' {
    return this.activeEngine;
  }

  public setKnownDuration(dur: number) {
    if (dur > 0) this.durationSecs = dur;
  }

  public setAspectRatio(aspect: 'FIT' | 'ZOOM' | 'STRETCH') {
    RemoteLogger.info('AVPLAY', `setAspectRatio called: ${aspect}`);
    if (this.isTizenAVPlay() && this.isPrepared) {
      try {
        const avplay = (window as any).webapis.avplay;
        if (aspect === 'STRETCH') {
          avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
        } else if (aspect === 'ZOOM') {
          avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO');
        } else {
          avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        }
      } catch (e: any) {
        RemoteLogger.warn('AVPLAY', `setAspectRatio warning: ${e.message}`);
      }
    }
  }

  public setCallbacks(callbacks: AVPlayCallbacks) {
    this.callbacks = callbacks;
  }

  public open(url: string, startPositionSeconds: number = 0) {
    // m3u8 всегда идёт нативным HLS-путём; остальное — легаси direct (не используется продом).
    if (url.includes('m3u8')) {
      this.openHls({ url, startSecs: startPositionSeconds });
      return;
    }
    this.openDirect({ url, startSecs: startPositionSeconds });
  }

  /**
   * ЕДИНСТВЕННЫЙ прод-путь Tizen: нативный AVPlay HLS.
   * AVPlay.open(master.m3u8) -> prepareAsync -> play -> seekTo(resume).
   * fMP4-сегменты поддерживаются с Tizen 3.0, seek/duration штатные для HLS.
   */
  public openHls(opts: {
    url: string; startSecs?: number; audioIndex?: number;
  }) {
    const startSecs = Math.max(0, opts.startSecs || 0);
    this.directUrl = opts.url;
    this.directStartSecs = startSecs;
    this.directTriedHtml5 = false;
    this.directTriedAvplay = false;
    this.isHlsMode = true;
    this.hlsAudioIndex = opts.audioIndex !== undefined && opts.audioIndex !== null ? opts.audioIndex : 0;
    RemoteLogger.info('AVPLAY', `openHls at ${startSecs}s (audioIndex=${this.hlsAudioIndex})`);
    this.close();
    // close() сбрасывает флаги — восстанавливаем HLS-режим после него.
    this.isHlsMode = true;
    this.hlsAudioIndex = opts.audioIndex !== undefined && opts.audioIndex !== null ? opts.audioIndex : 0;
    this.directUrl = opts.url;
    this.directStartSecs = startSecs;
    this.openAvplayHls(opts.url, startSecs, true);
  }

  /**
   * Переоткрытие HLS (смена аудиодорожки: сервер собирает плейлист с другим
   * audioIndex). Позиция и play/pause сохраняются.
   */
  public reopenHls(url: string, posSecs: number, autoPlay: boolean = true) {
    const pos = Math.max(0, posSecs);
    RemoteLogger.info('AVPLAY', `reopenHls at ${pos}s (audio switch)`);
    const audioIndex = this.hlsAudioIndex;
    this.close();
    this.isHlsMode = true;
    this.hlsAudioIndex = audioIndex;
    this.directUrl = url;
    this.directStartSecs = pos;
    this.openAvplayHls(url, pos, autoPlay);
  }

  /**
   * Единственная точка входа: прямой прогрессивный поток.
   * Всегда сначала HTML5 <video> (перемотка штатными Range-запросами браузера,
   * canPlayProbe при этом врёт — игнорируем его, решает только факт ошибки).
   * Ошибка HTML5 (контейнер/кодек реально не пошёл) — автопереход на
   * аппаратный AVPlay с той же позиции.
   */
  public openDirect(opts: {
    url: string; startSecs?: number; videoCodec?: string; audioCodec?: string; filePath?: string;
  }) {
    const startSecs = Math.max(0, opts.startSecs || 0);
    this.directUrl = opts.url;
    this.directStartSecs = startSecs;
    this.directTriedHtml5 = false;
    this.directTriedAvplay = false;
    this.isHlsMode = false;
    RemoteLogger.info('AVPLAY', `openDirect at ${startSecs}s (v=${opts.videoCodec || '?'}, a=${opts.audioCodec || '?'})`);
    this.close();

    // Всегда HTML5 первым — для любых кодеков. AVPlay только по факту ошибки.
    this.logCanPlayProbe(opts.filePath, opts.videoCodec, opts.audioCodec);
    RemoteLogger.info('AVPLAY', 'Direct engine: HTML5 first');
    this.openHtml5Direct(opts.url, startSecs);
  }

  /** canPlayType-зонд для форензики (решение принимает фолбэк по ошибке, не зонд). */
  private logCanPlayProbe(filePath?: string, vc?: string, ac?: string) {
    try {
      const v = document.createElement('video');
      const ext = (filePath || '').toLowerCase().split('.').pop() || '';
      const probes: Array<[string, string]> = [
        ['mp4/avc1', 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'],
        ['matroska', 'video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"'],
        ['webm/vp9', 'video/webm; codecs="vp9, opus"'],
        ['mp4/hev1', 'video/mp4; codecs="hev1.1.6.L93.B0"'],
      ];
      const out = probes.map(([n, m]) => `${n}=${v.canPlayType(m) || '∅'}`).join(' ');
      RemoteLogger.info('AVPLAY', `canPlayProbe ext=${ext} v=${vc} a=${ac}: ${out}`);
    } catch (e: any) {
      RemoteLogger.warn('AVPLAY', `canPlayProbe failed: ${e?.message || e}`);
    }
  }

  // --- HTML5 <video> ENGINE (primary for browser-safe codecs) ---
  private openHtml5Direct(url: string, startSecs: number) {
    this.activeEngine = 'html5';
    this.directTriedHtml5 = true;
    this.callbacks.onEngineChange?.('html5');
    let videoEl = document.getElementById('skycine-html5-video') as HTMLVideoElement;
    if (!videoEl) {
      videoEl = document.createElement('video');
      videoEl.id = 'skycine-html5-video';
      videoEl.style.position = 'fixed';
      videoEl.style.top = '0';
      videoEl.style.left = '0';
      videoEl.style.width = '1920px';
      videoEl.style.height = '1080px';
      videoEl.style.zIndex = '0';
      videoEl.style.backgroundColor = '#000000';
      videoEl.setAttribute('playsinline', '');
      document.body.prepend(videoEl);
    }
    videoEl.style.display = 'block';
    this.html5Video = videoEl;

    const aspect = Preferences.getAspectRatio();
    videoEl.style.objectFit = aspect === 'STRETCH' ? 'fill' : aspect === 'ZOOM' ? 'cover' : 'contain';

    videoEl.onwaiting = () => {
      this.isBufferingState = true;
      this.callbacks.onStateChange?.(this.isPlayingState, true);
    };
    videoEl.onplaying = () => {
      this.isPlayingState = true;
      this.isBufferingState = false;
      this.callbacks.onStateChange?.(true, false);
    };
    videoEl.onpause = () => {
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, false);
    };
    videoEl.onseeking = () => {
      this.isBufferingState = true;
      this.callbacks.onStateChange?.(this.isPlayingState, true);
    };
    videoEl.onseeked = () => {
      this.isBufferingState = false;
      this.isSeeking = false;
      this.isHardwareBusy = false;
      this.currentPosSecs = videoEl.currentTime;
      this.lastHardwarePosSecs = videoEl.currentTime;
      this.callbacks.onStateChange?.(this.isPlayingState, false);
      this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
      this.processQueuedSeek();
    };
    videoEl.ontimeupdate = () => {
      this.lastHardwarePosSecs = videoEl.currentTime;
      if (!this.isSeeking) {
        this.currentPosSecs = videoEl.currentTime;
        if (videoEl.duration && !isNaN(videoEl.duration) && videoEl.duration > 0) {
          this.durationSecs = videoEl.duration;
        }
        this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
      }
    };
    videoEl.onended = () => {
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, false);
      this.callbacks.onEnded?.();
    };
    videoEl.onloadedmetadata = () => {
      if (videoEl.duration && !isNaN(videoEl.duration) && videoEl.duration > 0) {
        this.durationSecs = videoEl.duration;
      }
      this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
      this.notifyAudioTracks();
    };
    videoEl.onerror = () => {
      const code = videoEl.error ? videoEl.error.code : 0;
      RemoteLogger.error('HTML5', `HTML5 video error (code ${code}), falling back to AVPlay`);
      this.fallbackToAvplay();
    };

    try {
      videoEl.src = url;
      videoEl.load();
      if (startSecs > 1) {
        const applyStart = () => {
          try { videoEl.currentTime = startSecs; } catch {}
          this.currentPosSecs = startSecs;
          this.lastHardwarePosSecs = startSecs;
        };
        if (videoEl.readyState >= 1) applyStart();
        else videoEl.onloadedmetadata = ((prev: any) => () => {
          try { if (typeof prev === 'function') prev(); } catch {}
          if (videoEl.duration && !isNaN(videoEl.duration) && videoEl.duration > 0) {
            this.durationSecs = videoEl.duration;
          }
          this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
          this.notifyAudioTracks();
          applyStart();
        })(videoEl.onloadedmetadata);
      }
      videoEl.play().then(() => {
        this.isPlayingState = true;
        this.callbacks.onStateChange?.(true, false);
      }).catch((err: any) => {
        RemoteLogger.warn('HTML5', 'Auto-play blocked: ' + (err?.message || err));
      });
    } catch (e: any) {
      RemoteLogger.error('HTML5', `openHtml5Direct exception: ${e.message}, falling back to AVPlay`);
      this.fallbackToAvplay();
    }
  }

  /** HTML5 не взял контейнер/кодек — уходим на аппаратный AVPlay с той же позиции. */
  private fallbackToAvplay() {
    if (this.directTriedAvplay) {
      this.callbacks.onError?.('Видео не поддерживается телевизором');
      return;
    }
    RemoteLogger.info('AVPLAY', 'HTML5 fallback -> AVPlay direct');
    this.callbacks.onEngineChange?.('avplay');
    const pos = Math.max(0, this.currentPosSecs);
    const wasPlaying = this.isPlayingState;
    this.teardownHtml5();
    this.openAvplayDirect(this.directUrl, pos, wasPlaying);
  }

  private teardownHtml5() {
    if (this.html5Video) {
      try {
        this.html5Video.pause();
        this.html5Video.removeAttribute('src');
        this.html5Video.load();
      } catch {}
      this.html5Video.style.display = 'none';
      this.html5Video.onwaiting = null;
      this.html5Video.onplaying = null;
      this.html5Video.onpause = null;
      this.html5Video.onseeking = null;
      this.html5Video.onseeked = null;
      this.html5Video.ontimeupdate = null;
      this.html5Video.onended = null;
      this.html5Video.onerror = null;
      this.html5Video.onloadedmetadata = null;
    }
    this.html5Video = null;
  }

  // --- NATIVE SAMSUNG TIZEN AVPLAY: HLS (прод-путь) ---
  private openAvplayHls(url: string, startSecs: number, autoPlay: boolean = true) {
    const avplay = (window as any).webapis?.avplay;
    if (!avplay) {
      RemoteLogger.error('AVPLAY', 'webapis.avplay not available on this device');
      this.callbacks.onError?.('Samsung AVPlay недоступен на этом устройстве');
      return;
    }
    this.activeEngine = 'avplay';
    this.directTriedAvplay = true;
    this.callbacks.onEngineChange?.('avplay');

    this.avPlayerContainer = document.getElementById('av-player-container');
    if (this.avPlayerContainer) {
      this.avPlayerContainer.style.display = 'block';
    }

    try {
      RemoteLogger.info('AVPLAY', 'Calling avplay.open(hls m3u8)...');
      avplay.open(url);

      try {
        avplay.setDisplayRect(0, 0, 1920, 1080);
      } catch (e: any) {
        RemoteLogger.warn('AVPLAY', `setDisplayRect warning: ${e.message}`);
      }

      this.registerAvplayListener();
      this.initVisibilityHandling();

      // Resume: сервер уже подложил EXT-X-START через startTime в URL мастера,
      // seekTo после prepare дублирует для точности (HLS-seek штатный, reopen не нужен).
      this.directStartSeekSecs = startSecs > 5 ? startSecs : 0;
      this.avplayAutoPlay = autoPlay;
      this.currentPosSecs = Math.max(0, startSecs);
      this.lastHardwarePosSecs = this.currentPosSecs;
      this.prepareAvplay();

    } catch (e: any) {
      RemoteLogger.error('AVPLAY', `Exception in openHls(): ${e.message}`);
      this.callbacks.onError?.(`Сбой инициализации Samsung AVPlay HLS: ${e.message}`);
    }
  }

  // --- NATIVE SAMSUNG TIZEN AVPLAY IMPLEMENTATION (direct progressive) ---
  private openAvplayDirect(url: string, startSecs: number, autoPlay: boolean = true) {
    const avplay = (window as any).webapis?.avplay;
    if (!avplay) {
      RemoteLogger.error('AVPLAY', 'webapis.avplay not available on this device');
      this.callbacks.onError?.('Samsung AVPlay недоступен на этом устройстве');
      return;
    }
    this.activeEngine = 'avplay';
    this.directTriedAvplay = true;
    this.callbacks.onEngineChange?.('avplay');

    this.avPlayerContainer = document.getElementById('av-player-container');
    if (this.avPlayerContainer) {
      this.avPlayerContainer.style.display = 'block';
    }

    try {
      // 1. Open direct progressive stream
      RemoteLogger.info('AVPLAY', `Calling avplay.open(direct)...`);
      avplay.open(url);

      // 2. Set 1080p display rect (valid in IDLE)
      try {
        avplay.setDisplayRect(0, 0, 1920, 1080);
      } catch (e: any) {
        RemoteLogger.warn('AVPLAY', `setDisplayRect warning: ${e.message}`);
      }

      // 3. Register state and event listeners (MUST be done before prepareAsync)
      this.registerAvplayListener();
      this.initVisibilityHandling();

      // 4. Prepare: resume via explicit seekTo after prepare (URL has no startTime)
      this.directStartSeekSecs = startSecs > 5 ? startSecs : 0;
      this.avplayAutoPlay = autoPlay;
      this.currentPosSecs = Math.max(0, startSecs);
      this.lastHardwarePosSecs = this.currentPosSecs;
      this.prepareAvplay();

    } catch (e: any) {
      RemoteLogger.error('AVPLAY', `Exception in open(): ${e.message}`);
      this.callbacks.onError?.(`Сбой инициализации Samsung AVPlay: ${e.message}`);
    }
  }

  /** Listener registration shared by initial open and remux reopens. */
  private registerAvplayListener() {
    const avplay = (window as any).webapis?.avplay;
    if (!avplay) return;
    avplay.setListener({
        onbufferingstart: () => {
          RemoteLogger.info('AVPLAY', 'Buffering started');
          this.isBufferingState = true;
          this.callbacks.onStateChange?.(this.isPlayingState, true);
        },
        onbufferingprogress: (percent: number) => {
          RemoteLogger.info('AVPLAY', `Buffering progress: ${percent}%`);
        },
        onbufferingcomplete: () => {
          RemoteLogger.info('AVPLAY', 'Buffering completed');
          this.isBufferingState = false;
          this.callbacks.onStateChange?.(this.isPlayingState, false);
          // Tracks often readable only after playback really starts (async prepare
          // reports none in READY) — refresh once playback flows.
          this.notifyAudioTracks();
          // If a seek was queued during buffering, execute it after brief delay!
          if (this.queuedSeek) {
            setTimeout(() => this.processQueuedSeek(), 200);
          }
        },
        oncurrentplaytime: (timeMs: number) => {
          // Hardware truth first — always, even mid-seek
          this.lastHardwarePosSecs = timeMs / 1000.0;
          if (this.jumpWatch) this.checkJumpWatch();
          if (!this.isSeeking) {
            this.currentPosSecs = this.lastHardwarePosSecs;
            this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
          }
        },
        onevent: (eventType: string, eventData: any) => {
          RemoteLogger.info('AVPLAY', `Event: ${eventType}`, eventData);
        },
        onerror: (errorData: any) => {
          RemoteLogger.error('AVPLAY', 'Error event received:', errorData);
          const errStr = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);
          this.callbacks.onError?.(`Ошибка воспроизведения: ${errStr}`);
        },
        onsubtitlechange: () => {},
        onstreamcompleted: () => {
          RemoteLogger.info('AVPLAY', 'Stream playback completed');
          this.isPlayingState = false;
          this.callbacks.onStateChange?.(false, false);
          this.callbacks.onEnded?.();
        }
      });
  }

  /** Samsung FAQ: on app hide use suspend(), on show use restore() — never pause/play. */
  private initVisibilityHandling() {
    this.teardownVisibilityHandling();
    this.visibilityHandler = () => {
      try {
        const avplay = (window as any).webapis?.avplay;
        if (!avplay) return;
        if (document.hidden) {
          let st = '';
          try { st = avplay.getState(); } catch {}
          if (st === 'PLAYING' || st === 'PAUSED' || st === 'READY') {
            try { avplay.suspend(); } catch (e: any) {
              RemoteLogger.warn('AVPLAY', `suspend() failed: ${e.message}`);
            }
          }
        } else {
          try { avplay.restore(); } catch (e: any) {
            RemoteLogger.warn('AVPLAY', `restore() failed: ${e.message}`);
          }
        }
      } catch {}
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private teardownVisibilityHandling() {
    if (this.visibilityHandler) {
      try { document.removeEventListener('visibilitychange', this.visibilityHandler); } catch {}
      this.visibilityHandler = null;
    }
  }

  /** Shared prepare flow: duration, display mode, initial seek (direct only), autoplay. */
  private prepareAvplay() {
    const avplay = (window as any).webapis?.avplay;
    if (!avplay) return;
    RemoteLogger.info('AVPLAY', 'Calling avplay.prepareAsync()...');
    avplay.prepareAsync(
        () => {
          RemoteLogger.info('AVPLAY', 'prepareAsync completed (State: READY)');
          this.isPrepared = true;

          try {
            const rawDur = avplay.getDuration();
            // HLS: прошивка отдаёт окно плейлиста, а не фильм — длительность только
            // из knownDuration (метаданные сервера). Direct: как раньше.
            if (!this.isHlsMode && rawDur && rawDur > 0) {
              this.durationSecs = rawDur / 1000.0;
              RemoteLogger.info('AVPLAY', `Stream duration: ${this.durationSecs}s`);
            } else if (this.isHlsMode) {
              RemoteLogger.info('AVPLAY', `HLS duration kept from metadata: ${this.durationSecs}s (hw reports window)`);
            }
          } catch (e) {}
          // Display mode in READY state
          try {
            const aspect = Preferences.getAspectRatio();
            if (aspect === 'STRETCH') {
              avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
            } else if (aspect === 'ZOOM') {
              avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO');
            } else {
              avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
            }
          } catch (e: any) {
            RemoteLogger.warn('AVPLAY', `setDisplayMethod error: ${e.message}`);
          }

          if (this.avplayAutoPlay) {
            try {
              avplay.play();
              this.isPlayingState = true;
              RemoteLogger.info('AVPLAY', 'avplay.play() successful');
            } catch (e: any) {
              RemoteLogger.error('AVPLAY', `avplay.play() failed: ${e.message}`);
            }
          } else {
            this.isPlayingState = false;
          }

          // Initial resume seek (direct progressive URL has no startTime)
          if (this.directStartSeekSecs > 5) {
            const startSecs = this.directStartSeekSecs;
            this.directStartSeekSecs = 0;
            RemoteLogger.info('AVPLAY', `Initial seek to ${startSecs}s after prepare...`);
            try {
              avplay.seekTo(
                Math.floor(startSecs * 1000),
                () => {
                  RemoteLogger.info('AVPLAY', `Initial seekTo SUCCESS at ${startSecs}s`);
                  this.currentPosSecs = startSecs;
                  this.lastHardwarePosSecs = startSecs;
                  if (this.avplayAutoPlay && !this.isPlayingState) {
                    try { avplay.play(); this.isPlayingState = true; } catch {}
                  }
                },
                () => {
                  RemoteLogger.warn('AVPLAY', 'Initial seekTo FAILED, continuing from current pos');
                  this.callbacks.onSeekFailed?.(startSecs);
                }
              );
            } catch {
              this.callbacks.onSeekFailed?.(startSecs);
            }
          }

          this.callbacks.onStateChange?.(this.isPlayingState, false);
          this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
          this.notifyAudioTracks();
        },
        (err: any) => {
          RemoteLogger.error('AVPLAY', 'prepareAsync error callback:', err);
          const errStr = typeof err === 'object' ? JSON.stringify(err) : String(err);
          // If this prepare belonged to a seek-reopen, restore truth and report
          if (this.isSeeking) {
            this.isSeeking = false;
            this.isHardwareBusy = false;
            this.currentPosSecs = this.lastHardwarePosSecs;
            this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
            this.callbacks.onSeekFailed?.(this.currentPosSecs);
          }
          this.callbacks.onError?.(`Не удалось загрузить видео: ${errStr}`);
        }
      );
  }

  public play() {
    RemoteLogger.info('AVPLAY', 'play() called');
    // Docs: no other API calls while a seek is in flight — defer intent.
    // Except when the seek is already failing: user intent wins, abandon it now.
    if (this.isSeeking || this.isHardwareBusy) {
      if (this.seekFailedOnce) {
        this.abortStuckSeek('play-intent');
      } else {
        this.pendingPlayState = true;
        return;
      }
    }
    if (this.activeEngine === 'avplay' && this.isTizenAVPlay()) {
      try {
        const avplay = (window as any).webapis?.avplay;
        if (avplay) {
          avplay.play();
          this.isPlayingState = true;
          this.callbacks.onStateChange?.(true, false);
          RemoteLogger.info('AVPLAY', 'avplay.play() successful');
        }
      } catch (e: any) {
        RemoteLogger.error('AVPLAY', `play() failed: ${e.message}`);
      }
    } else if (this.activeEngine === 'html5' && this.html5Video) {
      this.html5Video.play().catch(() => {});
      this.isPlayingState = true;
      this.callbacks.onStateChange?.(true, false);
    } else {
      RemoteLogger.warn('AVPLAY', 'play() ignored: no active engine');
    }
  }

  public pause() {
    RemoteLogger.info('AVPLAY', 'pause() called');
    // Docs: no other API calls while a seek is in flight — defer intent.
    // Except when the seek is already failing: user intent wins, abandon it now.
    if (this.isSeeking || this.isHardwareBusy) {
      if (this.seekFailedOnce) {
        this.abortStuckSeek('pause-intent');
      } else {
        this.pendingPlayState = false;
        return;
      }
    }
    // Route by ACTIVE engine: webapis exists on TV even when HTML5 element plays.
    if (this.activeEngine === 'avplay' && this.isTizenAVPlay()) {
      try {
        const avplay = (window as any).webapis?.avplay;
        if (avplay) {
          avplay.pause();
          this.isPlayingState = false;
          this.callbacks.onStateChange?.(false, false);
          RemoteLogger.info('AVPLAY', 'avplay.pause() successful');
        }
      } catch (e: any) {
        RemoteLogger.error('AVPLAY', `pause() failed: ${e.message}`);
      }
    } else if (this.activeEngine === 'html5' && this.html5Video) {
      this.html5Video.pause();
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, false);
    } else {
      RemoteLogger.warn('AVPLAY', 'pause() ignored: no active engine');
    }
  }

  public togglePlay() {
    const now = Date.now();
    if (now - this.lastTogglePlayTime < 450) {
      RemoteLogger.info('AVPLAY', 'togglePlay ignored (debounced 450ms)');
      return;
    }
    this.lastTogglePlayTime = now;

    // Defer toggle intent while a seek is in flight (docs rule).
    // Failing seek loop + fresh user intent = abandon the seek, act now.
    if (this.isSeeking || this.isHardwareBusy) {
      if (this.seekFailedOnce) {
        this.abortStuckSeek('toggle-intent');
      } else {
        this.pendingPlayState = !this.isPlayingState;
        RemoteLogger.info('AVPLAY', `togglePlay deferred (seek in flight), intent=${this.pendingPlayState}`);
        return;
      }
    }

    // Route by ACTIVE engine (never ask idle AVPlay while HTML5 plays).
    if (this.activeEngine === 'avplay' && this.isTizenAVPlay()) {
      try {
        const avplay = (window as any).webapis?.avplay;
        if (avplay) {
          const state = avplay.getState();
          RemoteLogger.info('AVPLAY', `togglePlay() called. Hardware AVPlay state: ${state}`);
          if (state === 'PLAYING') {
            this.pause();
          } else {
            this.play();
          }
          return;
        }
      } catch (e: any) {
        RemoteLogger.error('AVPLAY', `togglePlay exception: ${e.message}`);
      }
    }

    if (this.isPlayingState) {
      this.pause();
    } else {
      this.play();
    }
  }

  public seekRelative(seconds: number) {
    const target = Math.max(1, this.currentPosSecs + seconds);
    this.seekTo(target);
  }

  public seekTo(seconds: number, forcePlay?: boolean, isRetry: boolean = false) {
    let target = Math.max(1, seconds);
    if (this.durationSecs > 0 && target > this.durationSecs - 2) {
      target = Math.max(1, this.durationSecs - 2);
    }

    RemoteLogger.info('AVPLAY', `seekTo requested: ${target.toFixed(2)}s (current: ${this.currentPosSecs.toFixed(2)}s)`);
    if (!isRetry) {
      // Fresh user seek: new generation, reset fail budget + jump fallback
      this.seekGen += 1;
      this.seekFailRetries = 0;
      this.seekFailedOnce = false;
      this.jumpTried = false;
      this.jumpWatch = null;
    }
    const gen = this.seekGen;

    this.isSeeking = true;
    this.currentPosSecs = target;
    this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);

    clearTimeout(this.seekSafetyTimer);
    this.seekSafetyTimer = setTimeout(() => {
      // Safety net: if a queued seek is still stuck (busy/buffering never cleared),
      // drop it loudly and restore hardware truth instead of lying in UI.
      if (this.queuedSeek) {
        const stuck = this.queuedSeek.target;
        this.queuedSeek = null;
        clearTimeout(this.queueRetryTimer);
        this.queueAttempts = 0;
        this.isSeeking = false;
        this.isHardwareBusy = false;
        this.currentPosSecs = this.lastHardwarePosSecs;
        this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
        this.callbacks.onSeekFailed?.(stuck);
        this.applyPendingPlayIntent();
        RemoteLogger.warn('AVPLAY', `Seek safety timeout: dropped stuck seek to ${stuck.toFixed(2)}s`);
        return;
      }
      this.isSeeking = false;
      this.isHardwareBusy = false;
    }, 4000);

    // A Samsung TV exposes AVPlay even while the HTML5 element is active.
    // Route that engine first or seeks end up hitting an idle AVPlay instance.
    if (this.activeEngine === 'html5' && this.html5Video) {
      this.html5Video.currentTime = target;
      this.currentPosSecs = target;
      this.lastHardwarePosSecs = target;
      this.isSeeking = false;
      if (forcePlay === true) {
        this.html5Video.play().catch(() => {});
        this.isPlayingState = true;
      } else if (forcePlay === false) {
        this.html5Video.pause();
        this.isPlayingState = false;
      }
      this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
    } else if (this.activeEngine === 'avplay' && this.isTizenAVPlay()) {
      const avplay = (window as any).webapis?.avplay;
      if (!avplay) return;

      let state = 'UNKNOWN';
      try {
        state = avplay.getState();
      } catch (e) {}

      RemoteLogger.info('AVPLAY', `seekTo: state="${state}", busy=${this.isHardwareBusy}, buffering=${this.isBufferingState}`);

      // If hardware is currently busy or buffering, queue the seek with retries!
      if (this.isHardwareBusy || this.isBufferingState) {
        this.queueSeek(target, 'busy/buffering');
        return;
      }

      // Check if state permits seeking (READY, PLAYING, PAUSED)
      if (state !== 'PLAYING' && state !== 'PAUSED' && state !== 'READY') {
        RemoteLogger.warn('AVPLAY', `Cannot seek in state "${state}", queuing seek with retries`);
        this.queueSeek(target, `bad-state:${state}`);
        return;
      }

      this.isHardwareBusy = true;
      const targetMs = Math.max(1000, Math.floor(target * 1000));
      const wasPlaying = (state === 'PLAYING');
      // Explicit direction wins (remote SYNC seek); otherwise keep current state
      const wantPlay = forcePlay !== undefined ? forcePlay : wasPlaying;

      // Deferred play/pause intent (user pressed key mid-seek) overrides stale wantPlay
      const takeIntent = (): boolean => {
        if (this.pendingPlayState !== null) {
          const intent = this.pendingPlayState;
          this.pendingPlayState = null;
          return intent;
        }
        return wantPlay;
      };

      const applyPlayState = (effectiveWant: boolean) => {
        // Emit only on real transitions: no redundant badges/callbacks
        if (effectiveWant && !this.isPlayingState) {
          try {
            avplay.play();
            this.isPlayingState = true;
            this.callbacks.onStateChange?.(true, false);
          } catch (e: any) {
            RemoteLogger.warn('AVPLAY', `Resume play after seek warning: ${e.message}`);
          }
        } else if (!effectiveWant && this.isPlayingState) {
          try { avplay.pause(); } catch (e) {}
          this.isPlayingState = false;
          this.callbacks.onStateChange?.(false, false);
        }
      };

      const restoreToTruth = () => {
        this.currentPosSecs = this.lastHardwarePosSecs;
        this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
      };

      const describeHw = (): string => {
        let st = '?';
        let dur = '?';
        let seekable = '?';
        try {
          const a = (window as any).webapis?.avplay;
          if (a) {
            try { st = a.getState(); } catch {}
            try { dur = String(a.getDuration()); } catch {}
            try {
              const r = a.getSeekableRange ? a.getSeekableRange() : null;
              seekable = r ? JSON.stringify(r).slice(0, 160) : 'n/a';
            } catch (e: any) { seekable = 'err:' + (e?.message || e); }
          }
        } catch {}
        return `state=${st} dur=${dur} seekable=${seekable} truth=${this.lastHardwarePosSecs.toFixed(1)}`;
      };

      const performSeek = () => {
        RemoteLogger.info('AVPLAY', `Calling avplay.seekTo(${targetMs}ms)... [${describeHw()}]`);
        try {
          avplay.seekTo(
            targetMs,
            () => {
              if (gen !== this.seekGen) {
                RemoteLogger.info('AVPLAY', 'Ignoring stale seek SUCCESS (newer seek started)');
                return;
              }
              RemoteLogger.info('AVPLAY', `Hardware seekTo SUCCESS at ${target.toFixed(2)}s`);
              this.isHardwareBusy = false;
              this.seekFailRetries = 0;
              this.seekFailedOnce = false;
              this.jumpWatch = null;
              this.currentPosSecs = target;
              this.lastHardwarePosSecs = target;
              this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);

              applyPlayState(takeIntent());

              // Allow buffer to stabilize then process any pending queued seeks
              setTimeout(() => {
                this.isSeeking = false;
                this.processQueuedSeek();
              }, 400);
            },
            (err: any) => {
              if (gen !== this.seekGen) {
                RemoteLogger.info('AVPLAY', 'Ignoring stale seek FAIL (newer seek started)');
                return;
              }
              const msg = String((err && (err.message || err.name || err.code)) || err || '');
              RemoteLogger.error('AVPLAY', `Hardware seekTo FAILED at ${target.toFixed(2)}s: ${msg} [${describeHw()}]`);
              // InvalidState/SEEK_FAILED right after a transition: state may settle —
              // re-queue with retries instead of giving up instantly (bounded).
              if (/INVALID_STATE|SEEK_FAILED/i.test(msg) && this.seekFailRetries < AVPlayService.SEEK_FAIL_MAX_RETRIES) {
                this.seekFailRetries += 1;
                this.seekFailedOnce = true;
                this.isHardwareBusy = false;
                RemoteLogger.info('AVPLAY', `Seek fail retry ${this.seekFailRetries}/${AVPlayService.SEEK_FAIL_MAX_RETRIES}`);
                this.queueSeek(target, 'hw-fail-retry');
                return;
              }
              // seekTo exhausted: try relative jump API (different firmware path)
              if (/INVALID_STATE|SEEK_FAILED/i.test(msg) && this.tryJumpFallback(target)) {
                return;
              }
              this.isHardwareBusy = false;
              this.isSeeking = false;
              // Restore hardware truth so UI stops lying, report failure loudly
              restoreToTruth();
              this.callbacks.onSeekFailed?.(target);

              applyPlayState(takeIntent());
            }
          );
        } catch (e: any) {
          const msg = String(e?.message || e || '');
          // Synchronous InvalidStateError (e.g. transient state): retry via queue
          if (/INVALID_STATE/i.test(msg)) {
            RemoteLogger.warn('AVPLAY', `seekTo sync InvalidState, queuing with retries: ${msg} [${describeHw()}]`);
            this.isHardwareBusy = false;
            this.seekFailedOnce = true;
            this.queueSeek(target, 'sync-invalid-state');
            return;
          }
          RemoteLogger.error('AVPLAY', `Hardware seekTo exception: ${msg}`);
          this.isHardwareBusy = false;
          this.isSeeking = false;
          restoreToTruth();
          this.callbacks.onSeekFailed?.(target);
          applyPlayState(takeIntent());
        }
      };

      // Samsung docs: seekTo() is legal in PLAYING/PAUSED/READY directly —
      // no pre-pause dance (it adds an extra state transition that can race).
      performSeek();
    } else {
      RemoteLogger.warn('AVPLAY', 'seekTo ignored: no active engine');
      this.isSeeking = false;
      this.isHardwareBusy = false;
      this.currentPosSecs = this.lastHardwarePosSecs;
      this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
      this.callbacks.onSeekFailed?.(target);
    }
  }

  /** Queue a seek with a bounded retry chain (500ms x up to ~8s), then fail loudly. */
  private queueSeek(target: number, reason: string) {
    RemoteLogger.info('AVPLAY', `Queuing seek to ${target.toFixed(2)}s (${reason})`);
    this.queuedSeek = { target };
    this.queueAttempts = 0;
    this.scheduleQueueRetry();
  }

  private scheduleQueueRetry() {
    clearTimeout(this.queueRetryTimer);
    this.queueRetryTimer = setTimeout(() => this.processQueuedSeek(), 500);
  }

  private processQueuedSeek() {
    if (!this.queuedSeek) return;
    if (this.isHardwareBusy || this.isBufferingState || !this.isStateSeekable()) {
      this.queueAttempts += 1;
      if (this.queueAttempts >= AVPlayService.QUEUE_MAX_ATTEMPTS) {
        const t = this.queuedSeek.target;
        this.queuedSeek = null;
        this.queueAttempts = 0;
        this.isSeeking = false;
        this.isHardwareBusy = false;
        this.currentPosSecs = this.lastHardwarePosSecs;
        this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
        this.callbacks.onSeekFailed?.(t);
        this.applyPendingPlayIntent();
        RemoteLogger.warn('AVPLAY', `Queued seek to ${t.toFixed(2)}s gave up after retries`);
        return;
      }
      this.scheduleQueueRetry();
      return;
    }

    const next = this.queuedSeek;
    this.queuedSeek = null;
    this.queueAttempts = 0;
    RemoteLogger.info('AVPLAY', `Processing queued seek to ${next.target.toFixed(2)}s`);
    this.seekTo(next.target, undefined, true);
  }

  private isStateSeekable(): boolean {
    if (!this.isTizenAVPlay()) return true;
    try {
      const s = (window as any).webapis.avplay.getState();
      return s === 'PLAYING' || s === 'PAUSED' || s === 'READY';
    } catch {
      return false;
    }
  }

  /**
   * Last resort when absolute seekTo is rejected by firmware: relative
   * jumpForward/jumpBackward go through a different firmware path.
   * No callbacks — convergence watched via oncurrentplaytime polling.
   */
  private tryJumpFallback(target: number): boolean {
    if (this.jumpTried) return false;
    try {
      const avplay = (window as any).webapis?.avplay;
      if (!avplay) return false;
      const forward = typeof avplay.jumpForward === 'function';
      const backward = typeof avplay.jumpBackward === 'function';
      if (!forward && !backward) return false;
      const deltaMs = Math.round((target - this.lastHardwarePosSecs) * 1000);
      if (Math.abs(deltaMs) < 1000) return false;
      let st = '';
      try { st = avplay.getState(); } catch {}
      if (st !== 'PLAYING' && st !== 'PAUSED' && st !== 'READY') return false;
      this.jumpTried = true;
      this.jumpWatch = { target, deadline: Date.now() + 5000 };
      RemoteLogger.info('AVPLAY', `Jump fallback: ${deltaMs > 0 ? 'jumpForward' : 'jumpBackward'}(${Math.abs(deltaMs)}ms) -> ${target.toFixed(1)}s`);
      if (deltaMs > 0) avplay.jumpForward(deltaMs);
      else avplay.jumpBackward(-deltaMs);
      return true;
    } catch (e: any) {
      RemoteLogger.warn('AVPLAY', `Jump fallback unavailable: ${e?.message || e}`);
      return false;
    }
  }

  /** Called from oncurrentplaytime: did a jump fallback converge? */
  private checkJumpWatch() {
    if (!this.jumpWatch) return;
    if (Math.abs(this.lastHardwarePosSecs - this.jumpWatch.target) <= 2.0) {
      const t = this.jumpWatch.target;
      this.jumpWatch = null;
      this.jumpTried = false;
      this.isSeeking = false;
      this.isHardwareBusy = false;
      this.seekFailRetries = 0;
      this.seekFailedOnce = false;
      clearTimeout(this.seekSafetyTimer);
      this.currentPosSecs = this.lastHardwarePosSecs;
      this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
      RemoteLogger.info('AVPLAY', `Jump fallback CONVERGED near ${t.toFixed(1)}s`);
      setTimeout(() => this.processQueuedSeek(), 400);
    } else if (Date.now() > this.jumpWatch.deadline) {
      const t = this.jumpWatch.target;
      this.jumpWatch = null;
      this.isSeeking = false;
      this.isHardwareBusy = false;
      this.currentPosSecs = this.lastHardwarePosSecs;
      this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
      this.callbacks.onSeekFailed?.(t);
      this.applyPendingPlayIntent();
      RemoteLogger.warn('AVPLAY', `Jump fallback timed out at ${this.currentPosSecs.toFixed(1)}s`);
    }
  }

  /** Abandon a failing seek immediately so a fresh user intent executes now. */
  private abortStuckSeek(reason: string) {
    this.seekGen += 1; // invalidate all pending async seek callbacks
    clearTimeout(this.queueRetryTimer);
    clearTimeout(this.seekSafetyTimer);
    this.queuedSeek = null;
    this.queueAttempts = 0;
    this.seekFailRetries = 0;
    this.jumpWatch = null;
    this.isSeeking = false;
    this.isHardwareBusy = false;
    this.currentPosSecs = this.lastHardwarePosSecs;
    this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
    RemoteLogger.info('AVPLAY', `Abandoned stuck seek (${reason}), truth=${this.currentPosSecs.toFixed(1)}s`);
  }

  /** Apply a play/pause intent deferred during a seek (docs rule). */
  private applyPendingPlayIntent() {
    if (this.pendingPlayState === null) return;
    const want = this.pendingPlayState;
    this.pendingPlayState = null;
    try {
      const avplay = (window as any).webapis?.avplay;
      if (!avplay) return;
      if (want && !this.isPlayingState) {
        avplay.play();
        this.isPlayingState = true;
        this.callbacks.onStateChange?.(true, false);
      } else if (!want && this.isPlayingState) {
        avplay.pause();
        this.isPlayingState = false;
        this.callbacks.onStateChange?.(false, false);
      }
    } catch (e: any) {
      RemoteLogger.warn('AVPLAY', `Deferred play intent failed: ${e.message}`);
    }
  }

  public getAudioTracks(): AudioTrackOption[] {
    // HTML5: browser audio track list (switchable via enabled flag)
    if (this.activeEngine === 'html5' && this.html5Video) {
      try {
        const tracks = (this.html5Video as any).audioTracks;
        if (!tracks || tracks.length === 0) return [];
        const result: AudioTrackOption[] = [];
        for (let i = 0; i < tracks.length; i++) {
          const t = tracks[i];
          result.push({
            index: i,
            id: t.id || String(i),
            label: t.label || t.language || `Дорожка ${i + 1}`,
            language: t.language || 'ru',
            channels: 2,
            codec: 'AAC',
            isSelected: Boolean(t.enabled)
          });
        }
        return result;
      } catch {
        return [];
      }
    }
    if (this.isTizenAVPlay() && this.isPrepared) {
      try {
        const avplay = (window as any).webapis.avplay;
        const tracks = avplay.getTotalTrackInfo();
        const result: AudioTrackOption[] = [];
        tracks.forEach((track: any, idx: number) => {
          if (track.type === 'AUDIO') {
            let extra: any = {};
            if (typeof track.extra_info === 'string') {
              try { extra = JSON.parse(track.extra_info); } catch {}
            } else if (typeof track.extra_info === 'object' && track.extra_info !== null) {
              extra = track.extra_info;
            }
            result.push({
              index: idx,
              id: track.index,
              label: extra.track_name || extra.language || `Дорожка ${idx + 1}`,
              language: extra.language || 'ru',
              channels: extra.channel_count || 2,
              codec: extra.four_cc || 'AAC',
              isSelected: track.index === avplay.getCurrentStreamInfo()?.audio_track_index
            });
          }
        });
        return result;
      } catch {
        return [];
      }
    }
    return [];
  }

  public selectAudioTrack(track: AudioTrackOption) {
    // HTML5: switch via enabled flag
    if (this.activeEngine === 'html5' && this.html5Video) {
      try {
        const tracks = (this.html5Video as any).audioTracks;
        if (tracks) {
          for (let i = 0; i < tracks.length; i++) {
            tracks[i].enabled = (i === track.index);
          }
          RemoteLogger.info('AVPLAY', `Switched HTML5 audio track to: ${track.label}`);
          this.notifyAudioTracks();
        }
      } catch (e: any) {
        RemoteLogger.error('AVPLAY', `Failed to select HTML5 audio track: ${e.message}`);
      }
      return;
    }
    if (this.isTizenAVPlay() && this.isPrepared) {
      try {
        const avplay = (window as any).webapis.avplay;
        // Docs: setSelectTrack needs PLAYING/PAUSED (READY only for Smooth Streaming).
        let st = '';
        try { st = avplay.getState(); } catch {}
        if (st !== 'PLAYING' && st !== 'PAUSED') {
          RemoteLogger.info('AVPLAY', `Track switch deferred (state ${st}), will retry when playing`);
          clearTimeout(this.trackRetryTimer);
          this.trackRetryCount = 0;
          const tryLater = () => {
            try {
              const s2 = avplay.getState();
              if (s2 === 'PLAYING' || s2 === 'PAUSED') {
                avplay.setSelectTrack('AUDIO', track.id);
                RemoteLogger.info('AVPLAY', `Switched audio track to: ${track.label}`);
                this.notifyAudioTracks();
                return;
              }
            } catch (e: any) {}
            this.trackRetryCount += 1;
            if (this.trackRetryCount < 6) {
              clearTimeout(this.trackRetryTimer);
              this.trackRetryTimer = setTimeout(tryLater, 500);
            } else {
              RemoteLogger.warn('AVPLAY', 'Track switch gave up waiting for PLAYING state');
            }
          };
          this.trackRetryTimer = setTimeout(tryLater, 500);
          return;
        }
        avplay.setSelectTrack('AUDIO', track.id);
        RemoteLogger.info('AVPLAY', `Switched audio track to: ${track.label}`);
        this.notifyAudioTracks();
      } catch (e: any) {
        RemoteLogger.error('AVPLAY', `Failed to select audio track: ${e.message}`);
      }
    }
  }

  private notifyAudioTracks() {
    const tracks = this.getAudioTracks();
    if (tracks.length > 0) {
      this.callbacks.onTracksChanged?.(tracks);
    }
  }

  public close() {
    RemoteLogger.info('AVPLAY', 'close() called');
    this.teardownVisibilityHandling();
    clearInterval(this.timerInterval);
    clearTimeout(this.seekSafetyTimer);
    clearTimeout(this.queueRetryTimer);
    clearTimeout(this.trackRetryTimer);
    this.trackRetryCount = 0;
    this.pendingPlayState = null;
    this.isSeeking = false;
    this.isHardwareBusy = false;
    this.queuedSeek = null;
    this.queueAttempts = 0;
    this.seekFailRetries = 0;
    this.seekFailedOnce = false;
    this.seekGen += 1;
    this.jumpTried = false;
    this.jumpWatch = null;
    this.isBufferingState = false;
    // Reset position truth so the next open() never inherits stale values
    this.currentPosSecs = 0;
    this.lastHardwarePosSecs = 0;
    this.durationSecs = 0;
    this.directUrl = '';
    this.directStartSecs = 0;
    this.directStartSeekSecs = 0;
    this.directTriedHtml5 = false;
    this.directTriedAvplay = false;
    this.avplayAutoPlay = true;
    this.isHlsMode = false;
    this.hlsAudioIndex = 0;

    if (this.isTizenAVPlay()) {
      try {
        const avplay = (window as any).webapis?.avplay;
        if (avplay) {
          try { avplay.stop(); } catch (e) {}
          try { avplay.close(); } catch (e) {}
        }
      } catch (e) {}
      this.isPrepared = false;
    }
    this.teardownHtml5();
    if (this.avPlayerContainer) {
      this.avPlayerContainer.style.display = 'none';
    }
    this.isPlayingState = false;
  }
}

export const avplayService = new AVPlayService();
