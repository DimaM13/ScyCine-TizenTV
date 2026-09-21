/**
 * Локальная копия серверного профиля (SOURCE OF TRUTH):
 * MyPlex/server/src/services/tv-profiles/tizen.profile.ts
 * При расхождении править серверный файл и синхронизировать сюда.
 *
 * Samsung Tizen: H.264/HEVC/AV1/VP9/MPEG-4 + AAC/AC3/EAC3/MP3/OPUS нативно,
 * DTS/TrueHD/FLAC/Vorbis/WMA/ALAC и VC-1/MPEG-2 — только через HLS.
 * MSE — только до FHD, поэтому HLS отдаём НАТИВНО через AVPlay (не hls.js).
 *
 * ПОЛИТИКА: Tizen-клиент ВСЁ играет через AVPlay HLS (hls-always).
 */

export interface TvMediaProbe {
  videoCodec?: string;
  audioCodec?: string;
  filePath?: string;
  width?: number;
  height?: number;
}

export interface PlaybackDecision {
  mode: 'direct' | 'hls';
  reasons: string[];
}

export const TIZEN_APP_POLICY = 'hls-always' as const;

export const TIZEN_MASTER_PARAMS = {
  isApple: 0,
  quality: 'original',
} as const;
// Сервер включает ТВ-движок по ?client=tizen (маркер _tvtizen в sessionId):
// audio-copy AAC/AC3/EAC3/MP3, video-copy только H.264/HEVC, всегда fMP4,
// плейлист без EXT-X-INDEPENDENT-SEGMENTS. Без маркера — PC-правила.

export const TIZEN_NATIVE_VIDEO = [
  'h264',
  'hevc',
  'h265',
  'av1',
  'vp9',
  'mpeg4',
  'mjpeg',
] as const;

export const TIZEN_NATIVE_AUDIO = [
  'aac',
  'ac3',
  'eac3',
  'mp3',
  'opus',
  'pcm',
  'adpcm',
  'ac4',
  'mpegh',
] as const;

export const TIZEN_NATIVE_CONTAINERS = [
  'mp4', 'm4v', 'mov', 'mkv', 'avi',
  'ts', 'tp', 'trp', 'm2ts', 'mts',
  '3gp', '3g2', 'flv', 'vob', 'webm',
] as const;

export function tizenExtOf(filePath?: string): string {
  if (!filePath) return '';
  const m = filePath.toLowerCase().match(/\.([a-z0-9]+)(?:[?#].*)?$/);
  return m ? m[1] : '';
}

export function normalizeTizenVideoCodec(raw?: string): string {
  const c = (raw || '').toLowerCase().trim();
  if (!c) return '';
  if (['avc1', 'avc', 'h264', 'x264'].includes(c)) return 'h264';
  if (['hev1', 'hev', 'hevc', 'h265', 'hvc1', 'x265'].includes(c)) return 'hevc';
  if (['av01', 'av1'].includes(c)) return 'av1';
  if (['vp09', 'vp9'].includes(c)) return 'vp9';
  if (['vp80', 'vp8'].includes(c)) return 'vp8';
  if (['mp4v', 'mpeg4', 'xvid', 'divx', 'dx50'].includes(c)) return 'mpeg4';
  if (['mpeg2video', 'mpeg2'].includes(c)) return 'mpeg2';
  if (['mpeg1video', 'mpeg1'].includes(c)) return 'mpeg1';
  if (['mjpeg', 'mjpg', 'jpeg'].includes(c)) return 'mjpeg';
  if (['wmv3', 'wmva', 'vc1', 'vc-1'].includes(c)) return 'vc1';
  return c;
}

export function normalizeTizenAudioCodec(raw?: string): string {
  const c = (raw || '').toLowerCase().trim();
  if (!c) return '';
  if (['mp4a', 'mp4a.40.2', 'mp4a.40.5', 'aac', 'aac-lc', 'he-aac', 'heaac'].includes(c)) return 'aac';
  if (['ac-3', 'ac3', 'dolby_digital'].includes(c)) return 'ac3';
  if (['ec-3', 'ec3', 'eac3', 'dd+', 'dolby_digital_plus', 'atmos_eac3'].includes(c)) return 'eac3';
  if (['mp3', 'mpga', 'mp1', 'mp2'].includes(c)) return 'mp3';
  if (c.includes('dts')) return 'dts';
  if (['truehd', 'mlp', 'atmos_truehd'].includes(c)) return 'truehd';
  if (['vorbis', 'ogg'].includes(c)) return 'vorbis';
  if (['flac'].includes(c)) return 'flac';
  if (['opus'].includes(c)) return 'opus';
  if (['pcm', 'lpcm', 's16le', 's24le', 'wav'].includes(c)) return 'pcm';
  if (['adpcm', 'ima_adpcm', 'ms_adpcm'].includes(c)) return 'adpcm';
  if (['wma', 'wmav2'].includes(c)) return 'wma';
  if (['alac'].includes(c)) return 'alac';
  if (['ac-4', 'ac4'].includes(c)) return 'ac4';
  if (['mpeg-h', 'mpegh', '360ra'].includes(c)) return 'mpegh';
  return c;
}

export function decideTizenDirect(probe: TvMediaProbe): PlaybackDecision {
  const reasons: string[] = [];
  const v = normalizeTizenVideoCodec(probe.videoCodec);
  const a = normalizeTizenAudioCodec(probe.audioCodec);
  const ext = tizenExtOf(probe.filePath);

  if (!v || !(TIZEN_NATIVE_VIDEO as readonly string[]).includes(v)) {
    reasons.push(`видео ${v || 'unknown'} не в direct-белом списке Tizen (нужен HLS-транскод в H.264)`);
  }
  if (!a || !(TIZEN_NATIVE_AUDIO as readonly string[]).includes(a)) {
    reasons.push(`аудио ${a || 'unknown'} не поддерживается Tizen нативно (DTS/TrueHD/FLAC/Vorbis/WMA/ALAC — только через HLS с перекодом в AAC)`);
  }
  if (ext && !(TIZEN_NATIVE_CONTAINERS as readonly string[]).includes(ext)) {
    reasons.push(`контейнер .${ext} не открывается Tizen нативно (ASF/WMV/MPG — только через HLS)`);
  }
  if ((probe.width || 0) > 4096 || (probe.height || 0) > 2304) {
    reasons.push('кадр больше 4K — direct не гарантирован, нужен HLS');
  }
  return reasons.length === 0
    ? { mode: 'direct', reasons: ['H.264/HEVC + нативное аудио + нативный контейнер'] }
    : { mode: 'hls', reasons };
}

export function resolveTizenPlayback(probe: TvMediaProbe): PlaybackDecision {
  const direct = decideTizenDirect(probe);
  return {
    mode: 'hls',
    reasons: [
      'политика Tizen-клиента: все через AVPlay HLS (fMP4)',
      ...direct.reasons,
    ],
  };
}
