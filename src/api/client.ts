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
  // Helpers
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

  async getMovies(): Promise<MediaItem[]> {
    const client = getApiClient();
    const res = await client.get('/media/movies');
    return res.data.movies || res.data || [];
  },

  async getShows(): Promise<MediaItem[]> {
    const client = getApiClient();
    const res = await client.get('/media/shows');
    return res.data.shows || res.data || [];
  },

  async getShowEpisodes(showTitle: string): Promise<Episode[]> {
    const client = getApiClient();
    const res = await client.get(`/media/shows/${encodeURIComponent(showTitle)}/episodes`);
    return res.data.episodes || res.data || [];
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
