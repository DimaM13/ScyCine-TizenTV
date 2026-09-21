// Native Cinema TV Card Components (Posters & Episode Thumbnails)

import { MediaItem, Episode } from '../../types';
import { SkyCineApi } from '../../api/client';
import { Icons } from '../icons';

export function createCinemaCard(
  item: MediaItem,
  onClick: (item: MediaItem) => void,
  focusIdPrefix = 'card'
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'cinema-card';
  card.setAttribute('data-tv-focus', 'true');
  const safeId = item.id || (item.showTitle ? encodeURIComponent(item.showTitle) : Math.random().toString(36).substring(2, 9));
  card.setAttribute('data-focus-id', `${focusIdPrefix}-${safeId}`);
  card.setAttribute('tabindex', '0');

  const posterUrl = SkyCineApi.getImageUrl(item.posterPath || item.stillPath)
    // Видео без постеров: сервер сгенерирует кадр из файла и закеширует
    || (item.id ? SkyCineApi.getThumbnailUrl(item.id) : '');
  const title = item.title || item.displayTitle || item.showTitle || 'Без названия';
  const isShow = item.type === 'SHOW' || Boolean(item.showTitle);
  const isVideo = (item as any).type === 'VIDEO';
  const subText = isShow ? 'Сериал' : isVideo ? 'Видео' : item.year ? `${item.year}` : 'Фильм';

  const progressSecs = item.userProgress || item.progressSeconds || 0;
  const totalSecs = item.durationSeconds || 0;
  const progressPercent = totalSecs > 0 && progressSecs > 5
    ? Math.min(100, Math.round((progressSecs / totalSecs) * 100))
    : 0;

  card.innerHTML = `
    <div class="card-poster-wrap">
      ${
        posterUrl
          ? `<img class="card-poster-img" src="${posterUrl}" alt="${title}" loading="lazy" />`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#141a29;color:#64748b;">${Icons.film(48, '#334155')}</div>`
      }
      ${
        item.rating
          ? `
        <div class="card-rating-badge">
          ${Icons.star(12, '#e5a93c')}
          <span>${item.rating.toFixed(1)}</span>
        </div>
      `
          : ''
      }
      ${
        item.resolution
          ? `<div class="card-resolution-badge">${item.resolution}</div>`
          : ''
      }
      ${
        progressPercent > 0
          ? `
        <div class="card-progress-bar">
          <div class="card-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
      `
          : ''
      }
    </div>
    <div class="card-info">
      <div class="card-title">${title}</div>
      <div class="card-sub">${subText}</div>
    </div>
  `;

  card.addEventListener('click', () => {
    onClick(item);
  });

  return card;
}

export function createEpisodeCard(
  ep: Episode,
  onClick: (ep: Episode) => void
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'episode-card';
  card.setAttribute('data-tv-focus', 'true');
  card.setAttribute('data-focus-id', `ep-${ep.id}`);
  card.setAttribute('tabindex', '0');

  const thumbUrl = SkyCineApi.getImageUrl(ep.stillPath);
  const title = ep.title || `${ep.episodeNumber} серия`;

  card.innerHTML = `
    <div class="episode-thumb-wrap">
      ${
        thumbUrl
          ? `<img class="episode-thumb-img" src="${thumbUrl}" alt="${title}" loading="lazy" />`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#141a29;color:#64748b;">${Icons.play(36, '#64748b')}</div>`
      }
      <span class="episode-num-badge">${ep.episodeNumber} серия</span>
    </div>
    <div class="episode-card-body">
      <div class="episode-card-title">${title}</div>
      ${
        ep.overview
          ? `<div class="episode-card-desc">${ep.overview}</div>`
          : ''
      }
    </div>
  `;

  card.addEventListener('click', () => {
    onClick(ep);
  });

  return card;
}
