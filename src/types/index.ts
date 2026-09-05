export interface MediaItem {
  id: string;
  effectiveId?: string;
  libraryId: string;
  title: string;
  originalTitle?: string;
  displayTitle?: string;
  type: 'MOVIE' | 'SHOW' | 'EPISODE' | 'VIDEO';
  year?: number;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  stillPath?: string;
  rating?: number;
  genres?: string;
  durationSeconds?: number;
  filePath?: string;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  showTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  userProgress?: number;
  progressSeconds?: number;
  isCompleted?: number | boolean;
  libraryType?: string;
}

export interface Episode {
  id: string;
  title?: string;
  seasonNumber: number;
  episodeNumber: number;
  overview?: string;
  stillPath?: string;
  durationSeconds?: number;
  progressSeconds?: number;
  isCompleted?: number | boolean;
  filePath?: string;
}

export interface Library {
  id: string;
  name: string;
  type: 'movies' | 'shows' | 'anime' | 'cartoons' | 'videos';
  itemCount?: number;
}

export interface User {
  id: string;
  username: string;
  role: string;
}

export interface AudioTrackOption {
  index: number;
  id: string | number;
  label: string;
  language: string;
  channels?: number;
  codec?: string;
  isSelected?: boolean;
}

export type NavScreen = 'home' | 'movies' | 'shows' | 'search' | 'rooms' | 'settings' | 'auth';
