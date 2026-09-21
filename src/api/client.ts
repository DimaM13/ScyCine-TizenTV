import axios from 'axios';
import { Preferences } from '../storage/preferences';
import { MediaItem, Episode, Library, User } from '../types';

export const getApiClient = () => {
  const baseURL = Preferences.getServerUrl();
  const token = Preferences.getToken();

  const client = axios.create({
    baseURL: `${baseURL}/api`,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  // Global response interceptor for 401 Unauthorized
  client.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        if (typeof window !== 'undefined') {
          console.warn('[SkyCineApi] Session expired (401/403). Notifying App.');
          window.dispatchEvent(new CustomEvent('skycine_auth_expired'));
        }
      }
      return Promise.reject(err);
    }
  );

  return client;
};

export const SkyCineApi = {
  // HLS — ЕДИНСТВЕННЫЙ движок Tizen-клиента: нативный AVPlay открывает master.m3u8 (fMP4).
  // isApple=0 => сервер отдаёт fMP4-контейнер (поддерживается с Tizen 3.0).
  // quality=original => видео direct-copy, звук либо copy, либо AAC-транскод внутри сегментов.
  // audioIndex — streamIndex выбранной аудиодорожки из /stream/:id/info.
  // startSecs — серверный prewarm (плейлист содержит EXT-X-START, AVPlay seekTo дублирует).
  getHlsUrl(mediaId: string, opts?: { audioIndex?: number; startSecs?: number; quality?: string }): string {
    const token = Preferences.getToken();
    const q = opts?.quality || 'original';
    const a = opts?.audioIndex !== undefined && opts.audioIndex !== null ? opts.audioIndex : 0;
    const params = [
      `quality=${encodeURIComponent(q)}`,
      `audioIndex=${encodeURIComponent(String(a))}`,
      'isApple=0',
      'client=tizen',
    ];
    if (opts?.startSecs && opts.startSecs > 1) {
      params.push(`startTime=${Math.floor(opts.startSecs)}`);
    }
    params.push(`token=${encodeURIComponent(token || '')}`);
    return `${Preferences.getServerUrl()}/api/stream/${encodeURIComponent(mediaId)}/master.m3u8?${params.join('&')}`;
  },

  // Helpers: прямой прогрессивный поток (DEPRECATED: Tizen полностью на HLS,
  // оставлено для совместимости, прод-плеер не использует).
  // Суффикс /video.{ext} помогает прошивке определить контейнер.
  getStreamUrl(mediaId: string, filePath?: string): string {
    const token = Preferences.getToken();
    let extSuffix = '';
    if (filePath) {
      const match = filePath.match(/\.([a-zA-Z0-9]+)$/);
      if (match) {
        extSuffix = `/video.${match[1].toLowerCase()}`;
      }
    }
    return `${Preferences.getServerUrl()}/api/stream/${encodeURIComponent(mediaId)}/direct${extSuffix}?token=${encodeURIComponent(token || '')}`;
  },

  getThumbnailUrl(mediaId: string): string {
    if (!mediaId) return '';
    return `${Preferences.getServerUrl()}/api/media/item/${encodeURIComponent(mediaId)}/thumbnail`;
  },

  getImageUrl(path?: string): string {
    if (!path) return '';
    // Normalize Windows backslashes
    const clean = path.replace(/\\/g, '/');
    if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
    return `${Preferences.getServerUrl()}${clean.startsWith('/') ? '' : '/'}${clean}`;
  },

  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const client = getApiClient();
    const cleanUsername = (username || '').trim();
    const res = await client.post('/auth/login', {
      login: cleanUsername,
      username: cleanUsername,
      password
    });
    return res.data;
  },

  async me(): Promise<{ user: User }> {
    const client = getApiClient();
    const res = await client.get('/auth/me');
    return res.data;
  },

  // Stream Info & Tracks
  async getStreamInfo(mediaId: string): Promise<any> {
    const client = getApiClient();
    const res = await client.get(`/stream/${encodeURIComponent(mediaId)}/info`);
    return res.data;
  },

  // Завершение HLS-сессии сервера. client обязателен: без маркера _tvtizen
  // sessionId не совпадёт с живой ТВ-сессией и kill промахнётся.
  async endHlsSession(mediaId: string, audioIndex: number): Promise<void> {
    try {
      const client = getApiClient();
      await client.post('/stream/hls/session/end', {
        mediaId,
        quality: 'original',
        audioIndex,
        isApple: false,
        client: 'tizen',
      });
    } catch {}
  },

  // Libraries & Content
  async getLibraries(): Promise<Library[]> {
    const client = getApiClient();
    const res = await client.get('/libraries');
    return res.data.libraries || res.data || [];
  },

  async getLibraryItems(libraryId: string): Promise<MediaItem[]> {
    const client = getApiClient();
    const res = await client.get(`/libraries/${encodeURIComponent(libraryId)}/items`);
    return res.data.items || res.data || [];
  },

  async getContinueWatching(): Promise<MediaItem[]> {
    const client = getApiClient();
    const res = await client.get('/media/continue-watching');
    return res.data.items || res.data || [];
  },

  async getMediaItem(id: string): Promise<MediaItem> {
    const client = getApiClient();
    const res = await client.get(`/media/item/${encodeURIComponent(id)}`);
    return res.data.media || res.data;
  },

  async getMovies(libraryId?: string): Promise<MediaItem[]> {
    const client = getApiClient();
    const res = await client.get('/media/movies', {
      params: libraryId ? { libraryId } : {}
    });
    return res.data.movies || res.data || [];
  },

  async getShows(libraryId?: string): Promise<MediaItem[]> {
    const client = getApiClient();
    const res = await client.get('/media/shows', {
      params: libraryId ? { libraryId } : {}
    });
    return res.data.shows || res.data || [];
  },

  async getShowEpisodes(showTitle: string): Promise<Episode[]> {
    const client = getApiClient();
    const res = await client.get(`/media/shows/${encodeURIComponent(showTitle)}/episodes`);
    const list = res.data.episodes || res.data || [];
    return Array.isArray(list) ? list.map(normalizeEpisode) : [];
  },

  async updateProgress(mediaItemId: string, progressSeconds: number, durationSeconds: number) {
    const client = getApiClient();
    await client.post('/media/progress', {
      mediaItemId,
      progressSeconds: Math.floor(progressSeconds),
      durationSeconds: Math.floor(durationSeconds)
    });
  },

  async search(query: string): Promise<MediaItem[]> {
    const client = getApiClient();
    const res = await client.get(`/media/search?q=${encodeURIComponent(query)}`);
    return res.data.items || res.data || [];
  },

  // Rooms (Watch Together)
  async getRooms(): Promise<any[]> {
    const client = getApiClient();
    const res = await client.get('/rooms');
    return res.data.rooms || res.data || [];
  },

  async createRoom(mediaId: string): Promise<any> {
    const client = getApiClient();
    const res = await client.post('/rooms', { mediaId });
    return res.data;
  }
};

/**
 * Сервер называет прогресс серий userProgress/userCompleted, а фильмов —
 * userProgress/userCompleted тоже, тогда как continue-watching отдаёт
 * progressSeconds. Нормализуем к единым progressSeconds/isCompleted,
 * иначе диалоги «Продолжить» и автовыбор серии молча не срабатывают.
 */
export function episodeProgress(ep: any): number {
  const v = ep?.progressSeconds ?? (ep as any)?.userProgress ?? 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function episodeCompleted(ep: any): boolean {
  return Boolean(ep?.isCompleted ?? (ep as any)?.userCompleted ?? false);
}

export function episodeDuration(ep: any): number {
  const v = ep?.durationSeconds ?? 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function mediaProgress(m: any): number {
  const v = m?.userProgress ?? m?.progressSeconds ?? 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function mediaCompleted(m: any): boolean {
  return Boolean(m?.isCompleted ?? m?.userCompleted ?? false);
}

export function mediaDuration(m: any): number {
  const v = m?.durationSeconds ?? m?.fullDuration ?? 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function normalizeEpisode<T extends object>(ep: T): T {
  const e: any = ep;
  if (e.progressSeconds === undefined && e.userProgress !== undefined) {
    e.progressSeconds = e.userProgress;
  }
  if (e.isCompleted === undefined && e.userCompleted !== undefined) {
    e.isCompleted = e.userCompleted;
  }
  return ep;
}
