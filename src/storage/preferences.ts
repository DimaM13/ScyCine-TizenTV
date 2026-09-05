import { User } from '../types';

const STORAGE_KEYS = {
  SERVER_URL: 'skycine_server_url',
  TOKEN: 'skycine_jwt_token',
  USER: 'skycine_user_data',
  PLAYER_ENGINE: 'skycine_player_engine', // 'avplay' | 'html5'
  ASPECT_RATIO: 'skycine_aspect_ratio', // 'FIT' | 'STRETCH' | 'ZOOM'
  BUFFER_MB: 'skycine_buffer_mb',
};

export const Preferences = {
  getServerUrl(): string {
    const saved = localStorage.getItem(STORAGE_KEYS.SERVER_URL);
    if (saved) return saved;
    if (
      typeof window !== 'undefined' &&
      window.location &&
      window.location.hostname &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1' &&
      !window.location.protocol.startsWith('file')
    ) {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    return 'http://192.168.0.100:3000';
  },
  setServerUrl(url: string) {
    localStorage.setItem(STORAGE_KEYS.SERVER_URL, url.replace(/\/+$/, ''));
  },

  getToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  },
  setToken(token: string | null) {
    if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    else localStorage.removeItem(STORAGE_KEYS.TOKEN);
  },

  getUser(): User | null {
    const data = localStorage.getItem(STORAGE_KEYS.USER);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },
  setUser(user: User | null) {
    if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEYS.USER);
  },

  getPlayerEngine(): 'avplay' | 'html5' {
    return (localStorage.getItem(STORAGE_KEYS.PLAYER_ENGINE) as any) || 'avplay';
  },
  setPlayerEngine(engine: 'avplay' | 'html5') {
    localStorage.setItem(STORAGE_KEYS.PLAYER_ENGINE, engine);
  },

  getAspectRatio(): 'FIT' | 'STRETCH' | 'ZOOM' {
    return (localStorage.getItem(STORAGE_KEYS.ASPECT_RATIO) as any) || 'FIT';
  },
  setAspectRatio(ratio: 'FIT' | 'STRETCH' | 'ZOOM') {
    localStorage.setItem(STORAGE_KEYS.ASPECT_RATIO, ratio);
  },

  getBufferMb(): number {
    return parseInt(localStorage.getItem(STORAGE_KEYS.BUFFER_MB) || '50', 10);
  },
  setBufferMb(mb: number) {
    localStorage.setItem(STORAGE_KEYS.BUFFER_MB, mb.toString());
  },

  clearAuth() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  },

  isLoggedIn(): boolean {
    return Boolean(this.getToken());
  }
};
