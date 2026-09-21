// Minimal Watch Together sync client for Samsung Tizen (vanilla TS).
// Speaks the SAME socket.io protocol as the web client:
//   room:join / room:leave / room:action / room:host_heartbeat / room:member_status
//   <- room:initial_state / room:sync_state / room:time_anchor / room:force_sync_all
//      room:health / room:action_feed / room:rollback_notice
// Local user actions are sent explicitly by VideoPlayer (send* methods).
// Remote-applied actions go through do* callbacks and never re-emit (no echo).

import { io, Socket } from 'socket.io-client';
import { RemoteLogger } from '../logger';

export interface RoomSyncCallbacks {
  getPos: () => number;
  isPaused: () => boolean;
  isBuffering: () => boolean;
  doSeek: (pos: number, shouldPlay: boolean) => void;
  doPlay: () => void;
  doPause: () => void;
  showBadge: (title: string, sub: string) => void;
}

export class RoomSyncClient {
  private socket: Socket | null = null;
  private roomId: string;
  private userId: string;
  private username: string;
  private token: string | null = null;
  private cb: RoomSyncCallbacks;
  private roomPlaying: boolean = false;

  private clockOffset: number = 0;
  private lastRtt: number = 0;
  private initialized: boolean = false;
  private internalAction: boolean = false;
  private internalTimer: any = null;
  private lastSentSeekPos: number | null = null;
  private lastSentSeekTime: number = 0;
  private seekDebounceTimer: any = null;
  private hbTimer: any = null;
  private statusTimer: any = null;
  private ntpTimer: any = null;
  private lastWaitingText: string | null = null;

  constructor(serverUrl: string, roomId: string, userId: string, username: string, cb: RoomSyncCallbacks, token?: string | null) {
    this.roomId = roomId;
    this.userId = userId;
    this.username = username;
    this.cb = cb;
    this.token = token || null;

    try {
      const s = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 3000,
        timeout: 10000,
      });
      this.socket = s;

      s.on('connect', () => {
        RemoteLogger.info('TVSYNC', 'socket connected, joining room');
        // Токен доказывает личность сокета (без него сервер видит нас гостем)
        const hello: any = { userId: this.userId, username: this.username };
        if (this.token) hello.token = this.token;
        s.emit('user:connect', hello);
        s.emit('room:join', {
          roomId: this.roomId,
          userId: this.userId,
          username: this.username,
          streamMode: 'hls',
          platform: 'tizen',
        });
        this.ntpPing();
      });

      s.on('sync:pong', (data: { clientTimestamp: number; serverTimestamp: number }) => {
        if (!data) return;
        const now = Date.now();
        const rtt = now - data.clientTimestamp;
        this.lastRtt = rtt;
        this.clockOffset = (data.serverTimestamp + rtt / 2) - now;
      });

      s.on('room:initial_state', (data: { room: any; serverTimestamp: number; livePosition: number }) => {
        if (!data || !data.room) return;
        this.roomPlaying = data.room.state === 'PLAYING';
        if (this.initialized) return;
        this.initialized = true;
        const livePos = Math.max(0, data.livePosition || data.room.currentPosition || 0);
        RemoteLogger.info('TVSYNC', `initial_state: ${data.room.state} @ ${livePos.toFixed(1)}s`);
        this.blockSyncFor(2000);
        this.cb.doSeek(livePos, this.roomPlaying);
        if (this.roomPlaying) this.cb.doPlay();
        else this.cb.doPause();
      });

      s.on('room:sync_state', (data: {
        state: string; currentPosition: number; serverTimestamp: number;
        playbackRate: number; action: string; initiatedBy: string; initiatedByUserId?: string;
      }) => {
        if (!data) return;
        this.roomPlaying = data.state === 'PLAYING';
        const now = Date.now();
        const isRecentLocalSeek =
          data.action === 'SEEK' &&
          this.lastSentSeekPos !== null &&
          Math.abs(data.currentPosition - this.lastSentSeekPos) < 1.5 &&
          (now - this.lastSentSeekTime) < 5000;
        const isInitiator = Boolean(
          isRecentLocalSeek ||
          (data.initiatedByUserId && data.initiatedByUserId === this.userId)
        );

        if (data.action === 'PAUSE') {
          this.cb.doPause();
          const cur = this.safePos();
          if (!isInitiator && Math.abs(cur - data.currentPosition) > 0.8) {
            this.cb.doSeek(Math.max(0, data.currentPosition), false);
          }
          this.blockSyncFor(1500);
        } else if (data.action === 'PLAY') {
          const delay = Math.max(0, data.serverTimestamp - (Date.now() + this.clockOffset));
          const cur = this.safePos();
          if (Math.abs(cur - data.currentPosition) > 1.5) {
            this.cb.doSeek(Math.max(0, data.currentPosition), true);
          }
          this.blockSyncFor(1500);
          if (delay > 0) {
            setTimeout(() => this.cb.doPlay(), delay);
          } else {
            this.cb.doPlay();
          }
        } else if (data.action === 'SEEK') {
          const shouldPlay = data.state === 'PLAYING';
          this.blockSyncFor(2500);
          if (!isInitiator) {
            this.cb.doSeek(Math.max(0, data.currentPosition), shouldPlay);
          } else {
            this.lastSentSeekPos = null;
          }
          if (!shouldPlay) this.cb.doPause();
        }
      });

      s.on('room:time_anchor', (data: { currentPosition: number; serverTimestamp: number }) => {
        if (!data || this.internalAction || !this.roomPlaying) return;
        const now = Date.now() + this.clockOffset;
        const elapsed = Math.max(0, (now - data.serverTimestamp) / 1000);
        const expected = data.currentPosition + elapsed;
        const diff = this.safePos() - expected;
        if (Math.abs(diff) > 1.5 && Math.abs(diff) < 20.0 && !this.internalAction) {
          RemoteLogger.info('TVSYNC', `auto-align drift ${diff.toFixed(1)}s -> ${expected.toFixed(1)}s`);
          this.blockSyncFor(2500);
          this.cb.doSeek(Math.max(0, expected), true);
        }
      });

      s.on('room:force_sync_all', (data: { position: number }) => {
        if (!data) return;
        this.blockSyncFor(2500);
        this.cb.doSeek(Math.max(0, data.position || 0), this.roomPlaying);
        if (this.roomPlaying) this.cb.doPlay();
        else this.cb.doPause();
      });

      s.on('room:health', (data: { waitingText: string | null }) => {
        if (!data) return;
        const wt = data.waitingText || null;
        if (wt && wt !== this.lastWaitingText) {
          this.cb.showBadge('⏳ Синхронизация', wt);
        }
        this.lastWaitingText = wt;
      });

      s.on('room:action_feed', (entry: { text: string }) => {
        if (entry && entry.text) this.cb.showBadge('👥 Комната', entry.text);
      });

      s.on('room:rollback_notice', (n: { text: string }) => {
        if (n && n.text) this.cb.showBadge('⚠️ Откат', n.text);
      });

      this.ntpTimer = setInterval(() => this.ntpPing(), 10000);

      this.hbTimer = setInterval(() => {
        try {
          if (this.roomPlaying && !this.cb.isPaused() && !this.internalAction) {
            s.emit('room:host_heartbeat', { roomId: this.roomId, position: this.safePos() });
          }
        } catch {}
      }, 3000);

      this.statusTimer = setInterval(() => {
        try {
          let buffering = false;
          try { buffering = this.cb.isBuffering(); } catch {}
          s.emit('room:member_status', {
            roomId: this.roomId,
            currentPosition: this.safePos(),
            streamMode: 'hls',
            isBuffering: buffering,
            isPlaying: !this.cb.isPaused(),
            platform: 'tizen',
            rttMs: Math.round(this.lastRtt),
          });
        } catch {}
      }, 3000);
    } catch (e: any) {
      RemoteLogger.error('TVSYNC', `socket init failed: ${e?.message || e}`);
    }
  }

  private ntpPing() {
    try {
      this.socket?.emit('sync:ping', { clientTimestamp: Date.now() });
    } catch {}
  }

  private safePos(): number {
    try {
      const p = this.cb.getPos();
      return Number.isFinite(p) ? Math.max(0, p) : 0;
    } catch {
      return 0;
    }
  }

  private blockSyncFor(ms: number) {
    this.internalAction = true;
    clearTimeout(this.internalTimer);
    this.internalTimer = setTimeout(() => {
      this.internalAction = false;
      this.internalTimer = null;
    }, ms);
  }

  public sendPlay() {
    try {
      this.socket?.emit('room:action', {
        roomId: this.roomId, action: 'PLAY', position: this.safePos(), userId: this.userId,
      });
    } catch {}
  }

  public sendPause() {
    try {
      this.socket?.emit('room:action', {
        roomId: this.roomId, action: 'PAUSE', position: this.safePos(), userId: this.userId,
      });
    } catch {}
  }

  public sendSeek(pos: number, shouldPlay?: boolean) {
    if (!this.socket) return;
    let willPlay = shouldPlay;
    try {
      if (willPlay === undefined) willPlay = !this.cb.isPaused();
    } catch {
      willPlay = true;
    }
    this.blockSyncFor(2500);
    this.lastSentSeekPos = pos;
    this.lastSentSeekTime = Date.now();
    clearTimeout(this.seekDebounceTimer);
    this.seekDebounceTimer = setTimeout(() => {
      try {
        this.lastSentSeekPos = pos;
        this.lastSentSeekTime = Date.now();
        this.socket?.emit('room:action', {
          roomId: this.roomId, action: 'SEEK', position: pos, shouldPlay: willPlay, userId: this.userId,
        });
      } catch {}
      this.seekDebounceTimer = null;
      this.blockSyncFor(2500);
    }, 150);
  }

  public leave() {
    try {
      clearInterval(this.hbTimer);
      clearInterval(this.statusTimer);
      clearInterval(this.ntpTimer);
      clearTimeout(this.internalTimer);
      clearTimeout(this.seekDebounceTimer);
      this.socket?.emit('room:leave', { roomId: this.roomId });
      this.socket?.disconnect();
    } catch {}
    this.socket = null;
  }
}
