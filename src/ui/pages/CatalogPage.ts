// Native Cinema TV Catalog Grid Page (Movies & Series)

import { MediaItem } from '../../types';
import { SkyCineApi } from '../../api/client';
import { createCinemaCard } from '../components/Card';
import { focusManager } from '../../tizen/focusManager';

export class CatalogPage {
  private container: HTMLElement;
  private type: 'movies' | 'shows';
  private onDetailCallback: (item: MediaItem) => void;

  constructor(type: 'movies' | 'shows', onDetail: (item: MediaItem) => void) {
    this.type = type;
    this.onDetailCallback = onDetail;

    this.container = document.createElement('div');
    this.container.className = 'main-content';

    this.render();
    this.loadData();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  private async loadData() {
    try {
      const items = this.type === 'movies'
        ? await SkyCineApi.getMovies()
        : await SkyCineApi.getShows();

      const gridMount = this.container.querySelector('#catalog-grid-mount');
      const countEl = this.container.querySelector('#catalog-count');

      if (countEl) countEl.textContent = `${items.length} ${this.type === 'movies' ? 'фильмов' : 'сериалов'}`;

      if (gridMount) {
        gridMount.innerHTML = '';
        if (items.length === 0) {
          gridMount.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: #64748b; font-size: 18px; font-weight: 700;">
              Медиатека пуста. Добавьте файлы на сервере SkyCine.
            </div>
          `;
          return;
        }

        items.forEach((item, index) => {
          const card = createCinemaCard(item, (m) => this.onDetailCallback(m), `cat-${index}`);
          gridMount.appendChild(card);
        });

        // Focus first card
        setTimeout(() => {
          const first = gridMount.querySelector('[data-tv-focus="true"]') as HTMLElement;
          if (first) focusManager.focus(first);
        }, 100);
      }
    } catch (e) {
      console.error('[CatalogPage] Error loading catalog:', e);
    }
  }

  public render() {
    const title = this.type === 'movies' ? 'Фильмы медиатеки' : 'Сериалы';

    this.container.innerHTML = `
      <div style="padding: 48px 64px 20px 64px; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; margin-right: 16px;">
          <div class="shelf-pill" style="height: 32px; width: 8px;"></div>
          <h1 style="font-size: 32px; font-weight: 900; color: #ffffff;">${title}</h1>
        </div>
        <span id="catalog-count" style="font-size: 15px; font-weight: 800; color: #e5a93c;">Загрузка...</span>
      </div>

      <div 
        id="catalog-grid-mount" 
        style="display: grid; grid-template-columns: repeat(6, 1fr); grid-gap: 24px; gap: 24px; padding: 20px 64px 80px 64px;"
      ></div>
    `;
  }
}
