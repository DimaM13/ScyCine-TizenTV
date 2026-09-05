// Native Cinema TV Hero Billboard Component (560px Showcase)

import { MediaItem } from '../../types';
import { SkyCineApi } from '../../api/client';
import { Icons } from '../icons';

export class Billboard {
  private container: HTMLElement;
  private currentItem: MediaItem | null = null;
  private onPlayCallback: (item: MediaItem) => void;
  private onInfoCallback: (item: MediaItem) => void;

  constructor(
    onPlay: (item: MediaItem) => void,
    onInfo: (item: MediaItem) => void
  ) {
    this.onPlayCallback = onPlay;
    this.onInfoCallback = onInfo;
    this.container = document.createElement('div');
    this.container.className = 'hero-billboard';
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public setItem(item: MediaItem | null) {
    this.currentItem = item;
    this.render();
  }

  public render() {
    if (!this.currentItem) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'flex';
    const item = this.currentItem;
    const backdropUrl = SkyCineApi.getImageUrl(item.backdropPath || item.posterPath);
    const title = item.title || item.displayTitle || item.showTitle || 'Без названия';
    const isShow = item.type === 'SHOW' || Boolean(item.showTitle);

    this.container.innerHTML = `
      ${backdropUrl ? `<img class="hero-backdrop-img" src="${backdropUrl}" alt="${title}" />` : ''}
      <div class="hero-gradient-bottom"></div>
      <div class="hero-gradient-left"></div>

      <div class="hero-content">
        <div class="hero-badges">
          <span class="badge-gold">Эксклюзив</span>
          ${
            item.rating
              ? `
            <div class="badge-rating">
              ${Icons.star(14, '#e5a93c')}
              <span>${item.rating.toFixed(1)}</span>
            </div>
          `
              : ''
          }
          ${item.year ? `<span class="badge-meta">${item.year}</span>` : ''}
          ${item.resolution ? `<span class="badge-meta" style="border: 1px solid rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 6px; font-size: 11px;">${item.resolution}</span>` : ''}
          ${
            item.durationSeconds
              ? `<span class="badge-meta">${Math.floor(item.durationSeconds / 60)} мин</span>`
              : ''
          }
        </div>

        <h1 class="hero-title">${title}</h1>

        ${
          item.overview
            ? `<p class="hero-overview">${item.overview}</p>`
            : ''
        }

        <div class="hero-actions">
          <button 
            type="button" 
            class="tv-btn tv-btn-primary" 
            data-tv-focus="true" 
            data-focus-id="hero-play-btn"
            tabindex="0"
          >
            ${Icons.play(20, '#07090e')}
            <span>Смотреть</span>
          </button>
          <button 
            type="button" 
            class="tv-btn tv-btn-secondary" 
            data-tv-focus="true" 
            data-focus-id="hero-info-btn"
            tabindex="0"
          >
            ${Icons.info(20, '#ffffff')}
            <span>${isShow ? 'О сериале' : 'О фильме'}</span>
          </button>
        </div>
      </div>
    `;

    const playBtn = this.container.querySelector('[data-focus-id="hero-play-btn"]');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (this.currentItem) this.onPlayCallback(this.currentItem);
      });
    }

    const infoBtn = this.container.querySelector('[data-focus-id="hero-info-btn"]');
    if (infoBtn) {
      infoBtn.addEventListener('click', () => {
        if (this.currentItem) this.onInfoCallback(this.currentItem);
      });
    }
  }
}
