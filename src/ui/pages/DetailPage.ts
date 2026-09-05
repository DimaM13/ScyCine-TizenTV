// Native Cinema TV Series & Movie Detail View (100% Opaque - Zero Overlap)

import { MediaItem, Episode } from '../../types';
import { SkyCineApi } from '../../api/client';
import { Icons } from '../icons';
import { createEpisodeCard } from '../components/Card';
import { focusManager } from '../../tizen/focusManager';

export class DetailPage {
  private container: HTMLElement;
  private media: MediaItem;
  private episodes: Episode[] = [];
  private selectedSeason: number = 1;

  private onCloseCallback: () => void;
  private onPlayCallback: (media: MediaItem, episode?: Episode, list?: Episode[]) => void;

  constructor(
    media: MediaItem,
    onClose: () => void,
    onPlay: (media: MediaItem, episode?: Episode, list?: Episode[]) => void
  ) {
    this.media = media;
    this.onCloseCallback = onClose;
    this.onPlayCallback = onPlay;

    this.container = document.createElement('div');
    this.container.className = 'detail-view';

    // Register Back button handler in focus manager
    focusManager.pushBackHandler(() => {
      this.close();
      return true;
    });

    this.render();
    this.loadEpisodesIfShow();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public close() {
    focusManager.popBackHandler();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.onCloseCallback();
  }

  private async loadEpisodesIfShow() {
    const isShow = this.media.type === 'SHOW' || Boolean(this.media.showTitle);
    if (!isShow) return;

    const title = this.media.title || this.media.showTitle || '';
    try {
      const epList = await SkyCineApi.getShowEpisodes(title);
      this.episodes = epList;
      if (epList.length > 0) {
        this.selectedSeason = epList[0].seasonNumber || 1;
      }
      this.render();
    } catch (e) {
      console.error('[DetailPage] Error loading episodes:', e);
    }
  }

  public render() {
    const media = this.media;
    const isShow = media.type === 'SHOW' || Boolean(media.showTitle);
    const backdropUrl = SkyCineApi.getImageUrl(media.backdropPath || media.posterPath);
    const title = media.title || media.displayTitle || media.showTitle || 'Без названия';

    const seasons = Array.from(new Set(this.episodes.map(e => e.seasonNumber))).sort((a, b) => a - b);
    const currentEpisodes = this.episodes.filter(e => e.seasonNumber === this.selectedSeason);

    this.container.innerHTML = `
      <!-- Top Hero Showcase -->
      <div class="detail-hero">
        ${backdropUrl ? `<img class="hero-backdrop-img" src="${backdropUrl}" alt="${title}" />` : ''}
        <div class="hero-gradient-bottom"></div>
        <div class="hero-gradient-left"></div>

        <!-- Back Button -->
        <button 
          type="button" 
          class="tv-btn tv-btn-secondary detail-back-btn" 
          data-tv-focus="true" 
          data-focus-id="detail-back-btn"
          tabindex="0"
        >
          ${Icons.arrowLeft(20, '#ffffff')}
          <span>Назад к списку</span>
        </button>

        <div class="hero-content">
          <div class="hero-badges">
            ${
              media.rating
                ? `
              <div class="badge-rating">
                ${Icons.star(14, '#e5a93c')}
                <span>${media.rating.toFixed(1)}</span>
              </div>
            `
                : ''
            }
            ${media.year ? `<span class="badge-meta">${media.year}</span>` : ''}
            ${media.resolution ? `<span class="badge-meta" style="border: 1px solid rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 6px; font-size: 11px;">${media.resolution}</span>` : ''}
            ${
              media.durationSeconds
                ? `<span class="badge-meta">${Math.floor(media.durationSeconds / 60)} мин</span>`
                : ''
            }
          </div>

          <h1 class="hero-title">${title}</h1>

          ${
            media.overview
              ? `<p class="hero-overview">${media.overview}</p>`
              : ''
          }

          <div class="hero-actions">
            <button 
              type="button" 
              class="tv-btn tv-btn-primary" 
              data-tv-focus="true" 
              data-focus-id="detail-play-btn"
              tabindex="0"
            >
              ${Icons.play(22, '#07090e')}
              <span>${isShow ? 'Смотреть с 1 серии' : 'Смотреть фильм'}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- TV Series Episodes Browser -->
      ${
        isShow
          ? `
        <div class="detail-episodes-wrap">
          <!-- Season Selector Tabs -->
          ${
            seasons.length > 1
              ? `
            <div class="season-tabs-bar">
              <span style="font-size: 13px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-right: 10px;">Сезоны:</span>
              ${seasons
                .map(
                  (sNum) => `
                <button 
                  type="button"
                  class="season-tab-btn ${this.selectedSeason === sNum ? 'active' : ''}"
                  data-tv-focus="true"
                  data-focus-id="season-tab-${sNum}"
                  data-season="${sNum}"
                  tabindex="0"
                >
                  ${sNum} сезон
                </button>
              `
                )
                .join('')}
            </div>
          `
              : ''
          }

          <!-- Episodes Section Header -->
          <div style="font-size: 20px; font-weight: 900; color: #ffffff; margin-bottom: 24px;">
            Серии (${currentEpisodes.length})
          </div>

          <!-- Episode Cards Grid -->
          <div class="episodes-grid" id="episodes-grid-mount"></div>
        </div>
      `
          : ''
      }
    `;

    // Attach Back Button Handler
    const backBtn = this.container.querySelector('[data-focus-id="detail-back-btn"]');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.close());
    }

    // Attach Play Button Handler
    const playBtn = this.container.querySelector('[data-focus-id="detail-play-btn"]');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (isShow && this.episodes.length > 0) {
          this.onPlayCallback(this.media, this.episodes[0], this.episodes);
        } else {
          this.onPlayCallback(this.media);
        }
      });
    }

    // Attach Season Tabs Handlers
    const tabBtns = this.container.querySelectorAll('[data-season]');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sNum = parseInt(btn.getAttribute('data-season') || '1', 10);
        this.selectedSeason = sNum;
        this.render();
        focusManager.focus(`season-tab-${sNum}`);
      });
    });

    // Populate Episode Cards
    const epGridMount = this.container.querySelector('#episodes-grid-mount');
    if (epGridMount && currentEpisodes.length > 0) {
      currentEpisodes.forEach((ep) => {
        const epCard = createEpisodeCard(ep, () => {
          this.onPlayCallback(this.media, ep, this.episodes);
        });
        epGridMount.appendChild(epCard);
      });
    }

    // Auto Focus Main Action
    setTimeout(() => {
      focusManager.focus('detail-play-btn');
    }, 100);
  }
}
