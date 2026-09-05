import { AudioTrackOption } from '../types';
import { Preferences } from '../storage/preferences';
import { RemoteLogger } from '../logger';

export interface AVPlayCallbacks {
  onTimeUpdate?: (currentTimeSecs: number, durationSecs: number) => void;
  onStateChange?: (isPlaying: boolean, isBuffering: boolean) => void;
  onError?: (message: string) => void;
  onEnded?: () => void;
  onTracksChanged?: (tracks: AudioTrackOption[]) => void;
}

export class AVPlayService {
  private isPrepared: boolean = false;
  private isPlayingState: boolean = false;
  private isSeeking: boolean = false;
  private isHardwareBusy: boolean = false;
  private queuedSeek: { target: number } | null = null;
  private isBufferingState: boolean = false;
  private seekSafetyTimer: any = null;
  private durationSecs: number = 0;
  private lastTogglePlayTime: number = 0;
  private currentPosSecs: number = 0;
  private callbacks: AVPlayCallbacks = {};
  private timerInterval: any = null;
  private html5Video: HTMLVideoElement | null = null;
  private avPlayerContainer: HTMLElement | null = null;

  public isTizenAVPlay(): boolean {
    const isPreferred = Preferences.getPlayerEngine() === 'avplay';
    const hasApi = typeof window !== 'undefined' && Boolean((window as any).webapis?.avplay);
    return isPreferred && hasApi;
  }

  public getCurrentPos(): number {
    return this.currentPosSecs;
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
    } else if (this.html5Video) {
      this.html5Video.style.objectFit = aspect === 'STRETCH' ? 'fill' : aspect === 'ZOOM' ? 'cover' : 'contain';
    }
  }

  public setCallbacks(callbacks: AVPlayCallbacks) {
    this.callbacks = callbacks;
  }

  public open(url: string, startPositionSeconds: number = 0) {
    RemoteLogger.info('AVPLAY', `open() URL: ${url} at ${startPositionSeconds}s (Engine: ${this.isTizenAVPlay() ? 'Samsung AVPlay' : 'HTML5'})`);
    this.close();

    if (this.isTizenAVPlay()) {
      this.openTizenAVPlay(url, startPositionSeconds);
    } else {
      this.openHtml5Fallback(url, startPositionSeconds);
    }
  }

  // --- NATIVE SAMSUNG TIZEN AVPLAY IMPLEMENTATION ---
  private openTizenAVPlay(url: string, startPosSecs: number) {
    const avplay = (window as any).webapis?.avplay;
    if (!avplay) {
      RemoteLogger.warn('AVPLAY', 'webapis.avplay not available. Falling back to HTML5');
      this.openHtml5Fallback(url, startPosSecs);
      return;
    }

    this.avPlayerContainer = document.getElementById('av-player-container');
    if (this.avPlayerContainer) {
      this.avPlayerContainer.style.display = 'block';
    }

    try {
      // 1. Open stream
      RemoteLogger.info('AVPLAY', `Calling avplay.open("${url}")...`);
      avplay.open(url);

      // 2. Set 1080p display rect (valid in IDLE)
      try {
        avplay.setDisplayRect(0, 0, 1920, 1080);
      } catch (e: any) {
        RemoteLogger.warn('AVPLAY', `setDisplayRect warning: ${e.message}`);
      }

      // 3. Register state and event listeners (MUST be done before prepareAsync)
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
          // If a seek was queued during buffering, execute it after brief delay!
          if (this.queuedSeek) {
            setTimeout(() => this.processQueuedSeek(), 200);
          }
        },
        oncurrentplaytime: (timeMs: number) => {
          if (!this.isSeeking) {
            this.currentPosSecs = timeMs / 1000.0;
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

      // 4. Prepare stream asynchronously
      RemoteLogger.info('AVPLAY', 'Calling avplay.prepareAsync()...');
      avplay.prepareAsync(
        () => {
          RemoteLogger.info('AVPLAY', 'prepareAsync completed (State: READY)');
          this.isPrepared = true;

          try {
            const rawDur = avplay.getDuration();
            if (rawDur && rawDur > 0) {
              this.durationSecs = rawDur / 1000.0;
              RemoteLogger.info('AVPLAY', `Stream duration: ${this.durationSecs}s`);
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

          // Start playback or resume from saved position
          if (startPosSecs > 5) {
            const startMs = Math.floor(startPosSecs * 1000);
            RemoteLogger.info('AVPLAY', `Resuming playback at ${startPosSecs}s (${startMs}ms)...`);
            try {
              avplay.seekTo(
                startMs,
                () => {
                  RemoteLogger.info('AVPLAY', `Resume seekTo SUCCESS at ${startPosSecs}s`);
                  try {
                    avplay.play();
                    this.isPlayingState = true;
                  } catch (e: any) {
                    RemoteLogger.error('AVPLAY', `avplay.play() error after seek: ${e.message}`);
                  }
                },
                (err: any) => {
                  RemoteLogger.warn('AVPLAY', 'Resume seekTo FAILED, playing from start:', err);
                  try {
                    avplay.play();
                    this.isPlayingState = true;
                  } catch (e: any) {}
                }
              );
            } catch (e: any) {
              RemoteLogger.warn('AVPLAY', `Resume seekTo exception: ${e.message}`);
              try {
                avplay.play();
                this.isPlayingState = true;
              } catch (err: any) {}
            }
          } else {
            try {
              avplay.play();
              this.isPlayingState = true;
              RemoteLogger.info('AVPLAY', 'avplay.play() successful');
            } catch (e: any) {
              RemoteLogger.error('AVPLAY', `avplay.play() failed: ${e.message}`);
            }
          }

          this.callbacks.onStateChange?.(true, false);
          this.callbacks.onTimeUpdate?.(startPosSecs, this.durationSecs);
          this.notifyAudioTracks();
        },
        (err: any) => {
          RemoteLogger.error('AVPLAY', 'prepareAsync error callback:', err);
          const errStr = typeof err === 'object' ? JSON.stringify(err) : String(err);
          this.callbacks.onError?.(`Не удалось загрузить видео: ${errStr}`);
        }
      );

    } catch (e: any) {
      RemoteLogger.error('AVPLAY', `Exception in open(): ${e.message}`);
      this.callbacks.onError?.(`Сбой инициализации Samsung AVPlay: ${e.message}`);
    }
  }

  // --- HTML5 BROWSER / SIMULATOR FALLBACK ---
  private openHtml5Fallback(url: string, startPosSecs: number) {
    let videoEl = document.getElementById('skycine-fallback-video') as HTMLVideoElement;
    if (!videoEl) {
      videoEl = document.createElement('video');
      videoEl.id = 'skycine-fallback-video';
      videoEl.style.position = 'fixed';
      videoEl.style.top = '0';
      videoEl.style.left = '0';
      videoEl.style.width = '1920px';
      videoEl.style.height = '1080px';
      videoEl.style.objectFit = 'contain';
      videoEl.style.zIndex = '0';
      videoEl.style.backgroundColor = '#000000';
      document.body.prepend(videoEl);
    }
    videoEl.style.display = 'block';
    this.html5Video = videoEl;

    const aspect = Preferences.getAspectRatio();
    videoEl.style.objectFit = aspect === 'STRETCH' ? 'fill' : aspect === 'ZOOM' ? 'cover' : 'contain';

    videoEl.src = url;
    videoEl.currentTime = startPosSecs;

    videoEl.onwaiting = () => this.callbacks.onStateChange?.(this.isPlayingState, true);
    videoEl.onplaying = () => {
      this.isPlayingState = true;
      this.callbacks.onStateChange?.(true, false);
    };
    videoEl.onpause = () => {
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, false);
    };
    videoEl.ontimeupdate = () => {
      if (!this.isSeeking) {
        this.currentPosSecs = videoEl.currentTime;
        this.durationSecs = videoEl.duration || 0;
        this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
      }
    };
    videoEl.onended = () => {
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, false);
      this.callbacks.onEnded?.();
    };
    videoEl.onerror = () => {
      RemoteLogger.error('HTML5', 'HTML5 video element error event');
      this.callbacks.onError?.('Ошибка загрузки видеопотока HTML5');
    };

    videoEl.play().catch((err) => {
      RemoteLogger.warn('HTML5', 'Auto-play blocked: ' + err.message);
    });
  }

  public play() {
    RemoteLogger.info('AVPLAY', 'play() called');
    if (this.isTizenAVPlay()) {
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
    } else if (this.html5Video) {
      this.html5Video.play().catch(() => {});
      this.isPlayingState = true;
      this.callbacks.onStateChange?.(true, false);
    }
  }

  public pause() {
    RemoteLogger.info('AVPLAY', 'pause() called');
    if (this.isTizenAVPlay()) {
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
    } else if (this.html5Video) {
      this.html5Video.pause();
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, false);
    }
  }

  public togglePlay() {
    const now = Date.now();
    if (now - this.lastTogglePlayTime < 450) {
      RemoteLogger.info('AVPLAY', 'togglePlay ignored (debounced 450ms)');
      return;
    }
    this.lastTogglePlayTime = now;

    if (this.isTizenAVPlay()) {
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

  public seekTo(seconds: number) {
    let target = Math.max(1, seconds);
    if (this.durationSecs > 0 && target > this.durationSecs - 2) {
      target = Math.max(1, this.durationSecs - 2);
    }

    RemoteLogger.info('AVPLAY', `seekTo requested: ${target.toFixed(2)}s (current: ${this.currentPosSecs.toFixed(2)}s)`);

    this.isSeeking = true;
    this.currentPosSecs = target;
    this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);

    clearTimeout(this.seekSafetyTimer);
    this.seekSafetyTimer = setTimeout(() => {
      this.isSeeking = false;
      this.isHardwareBusy = false;
    }, 4000);

    if (this.isTizenAVPlay()) {
      const avplay = (window as any).webapis?.avplay;
      if (!avplay) return;

      let state = 'UNKNOWN';
      try {
        state = avplay.getState();
      } catch (e) {}

      RemoteLogger.info('AVPLAY', `seekTo: state="${state}", busy=${this.isHardwareBusy}, buffering=${this.isBufferingState}`);

      // If hardware is currently busy or buffering, queue the seek!
      if (this.isHardwareBusy || this.isBufferingState) {
        RemoteLogger.info('AVPLAY', `Hardware busy or buffering, queuing seek to ${target.toFixed(2)}s`);
        this.queuedSeek = { target };
        return;
      }

      // Check if state permits seeking (READY, PLAYING, PAUSED)
      if (state !== 'PLAYING' && state !== 'PAUSED' && state !== 'READY') {
        RemoteLogger.warn('AVPLAY', `Cannot seek in state "${state}", queuing seek for retry`);
        this.queuedSeek = { target };
        setTimeout(() => this.processQueuedSeek(), 400);
        return;
      }

      this.isHardwareBusy = true;
      const targetMs = Math.max(1000, Math.floor(target * 1000));
      const wasPlaying = (state === 'PLAYING');

      const performSeek = () => {
        RemoteLogger.info('AVPLAY', `Calling avplay.seekTo(${targetMs}ms)...`);
        try {
          avplay.seekTo(
            targetMs,
            () => {
              RemoteLogger.info('AVPLAY', `Hardware seekTo SUCCESS at ${target.toFixed(2)}s`);
              this.isHardwareBusy = false;
              this.currentPosSecs = target;
              this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);

              // Resume playback if it was playing
              if (wasPlaying) {
                try {
                  avplay.play();
                  this.isPlayingState = true;
                  this.callbacks.onStateChange?.(true, false);
                } catch (e: any) {
                  RemoteLogger.warn('AVPLAY', `Resume play after seek warning: ${e.message}`);
                }
              }

              // Allow buffer to stabilize then process any pending queued seeks
              setTimeout(() => {
                this.isSeeking = false;
                this.processQueuedSeek();
              }, 400);
            },
            (err: any) => {
              RemoteLogger.error('AVPLAY', `Hardware seekTo FAILED at ${target.toFixed(2)}s:`, err);
              this.isHardwareBusy = false;

              // Resume playback if it was playing
              if (wasPlaying) {
                try {
                  avplay.play();
                  this.isPlayingState = true;
                  this.callbacks.onStateChange?.(true, false);
                } catch (e: any) {}
              }

              this.isSeeking = false;
            }
          );
        } catch (e: any) {
          RemoteLogger.error('AVPLAY', `Hardware seekTo exception: ${e.message}`);
          this.isHardwareBusy = false;
          if (wasPlaying) {
            try { avplay.play(); } catch (err) {}
          }
          this.isSeeking = false;
        }
      };

      // Best practice for Samsung AVPlay: pause video before seeking to freeze hardware demuxer state
      if (wasPlaying) {
        try {
          avplay.pause();
        } catch (e: any) {
          RemoteLogger.warn('AVPLAY', `Pre-seek pause warning: ${e.message}`);
        }
        setTimeout(performSeek, 60);
      } else {
        performSeek();
      }
    } else if (this.html5Video) {
      this.html5Video.currentTime = target;
      this.currentPosSecs = target;
      this.isSeeking = false;
      this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
    }
  }

  private processQueuedSeek() {
    if (!this.queuedSeek) return;
    if (this.isHardwareBusy || this.isBufferingState) return;

    const next = this.queuedSeek;
    this.queuedSeek = null;
    RemoteLogger.info('AVPLAY', `Processing queued seek to ${next.target.toFixed(2)}s`);
    this.seekTo(next.target);
  }

  public getAudioTracks(): AudioTrackOption[] {
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
    if (this.isTizenAVPlay() && this.isPrepared) {
      try {
        (window as any).webapis.avplay.setSelectTrack('AUDIO', track.id);
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
    clearInterval(this.timerInterval);
    clearTimeout(this.seekSafetyTimer);
    this.isSeeking = false;
    this.isHardwareBusy = false;
    this.queuedSeek = null;
    this.isBufferingState = false;

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
    if (this.avPlayerContainer) {
      this.avPlayerContainer.style.display = 'none';
    }
    if (this.html5Video) {
      this.html5Video.pause();
      this.html5Video.src = '';
      this.html5Video.style.display = 'none';
    }
    this.isPlayingState = false;
  }
}

export const avplayService = new AVPlayService();
