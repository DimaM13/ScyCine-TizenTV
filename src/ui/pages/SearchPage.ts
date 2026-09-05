// Native Cinema TV Search Page with Virtual Keyboard

import { MediaItem } from '../../types';
import { SkyCineApi } from '../../api/client';
import { VirtualKeyboard } from '../components/VirtualKeyboard';
import { createCinemaCard } from '../components/Card';
import { focusManager } from '../../tizen/focusManager';
import { Icons } from '../icons';

export class SearchPage {
  private container: HTMLElement;
  private onDetailCallback: (item: MediaItem) => void;
  private searchQuery: string = '';
  private keyboard: VirtualKeyboard;
  private debounceTimer: any = null;

  constructor(onDetail: (item: MediaItem) => void) {
    this.onDetailCallback = onDetail;
    this.container = document.createElement('div');
    this.container.className = 'main-content';

    this.keyboard = new VirtualKeyboard({
      onChar: (ch) => {
        this.searchQuery += ch;
        this.updateQuery();
      },
      onBackspace: () => {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.updateQuery();
      },
      onClear: () => {
        this.searchQuery = '';
        this.updateQuery();
      },
      onSubmit: () => {
        this.performSearch();
      },
      submitLabel: 'Искать'
    });

    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public onMounted() {
    focusManager.focus('kb-EN-q');
  }

  private updateQuery() {
    const inputEl = this.container.querySelector('#search-query-display');
    if (inputEl) {
      inputEl.textContent = this.searchQuery || 'Начните ввод текста на клавиатуре...';
    }

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.performSearch();
    }, 400);
  }

  private async performSearch() {
    const grid = this.container.querySelector('#search-results-grid');
    if (!grid) return;

    if (!this.searchQuery.trim()) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: #64748b; font-size: 16px; font-weight: 700;">
          Введите название фильма или сериала для поиска
        </div>
      `;
      return;
    }

    try {
      const results = await SkyCineApi.search(this.searchQuery.trim());
      grid.innerHTML = '';

      if (results.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: #64748b; font-size: 16px; font-weight: 700;">
            По запросу «${this.searchQuery}» ничего не найдено
          </div>
        `;
        return;
      }

      results.forEach((item) => {
        const card = createCinemaCard(item, (m) => this.onDetailCallback(m), 'srch');
        grid.appendChild(card);
      });
    } catch (e) {
      console.error('[SearchPage] Search error:', e);
    }
  }

  public render() {
    this.container.innerHTML = `
      <div style="padding: 48px 64px 20px 64px; display: flex; align-items: center; margin-right: 16px;">
        <div class="shelf-pill" style="height: 32px; width: 8px;"></div>
        <h1 style="font-size: 32px; font-weight: 900; color: #ffffff;">Поиск по медиатеке</h1>
      </div>

      <div style="display: grid; grid-template-columns: 620px 1fr; margin-right: 48px; padding: 10px 64px 80px 64px; align-items: start;">
        
        <!-- Left: Query bar + Virtual Keyboard -->
        <div style="display: flex; flex-direction: column; margin-right: 20px;">
          <div style="height: 60px; background: #0d111a; border: 2px solid rgba(30,41,59,0.8); border-radius: 18px; padding: 0 24px; display: flex; align-items: center; margin-right: 16px;">
            ${Icons.search(22, '#e5a93c')}
            <span id="search-query-display" style="font-size: 18px; font-weight: 800; color: #ffffff; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              Начните ввод текста на клавиатуре...
            </span>
          </div>

          <div id="search-keyboard-mount"></div>
        </div>

        <!-- Right: Results Grid -->
        <div>
          <div style="font-size: 16px; font-weight: 800; color: #94a3b8; margin-bottom: 16px;">
            Результаты поиска
          </div>
          <div 
            id="search-results-grid" 
            style="display: grid; grid-template-columns: repeat(4, 1fr); grid-gap: 24px; gap: 24px;"
          >
            <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: #64748b; font-size: 16px; font-weight: 700;">
              Введите название фильма или сериала для поиска
            </div>
          </div>
        </div>

      </div>
    `;

    const kbMount = this.container.querySelector('#search-keyboard-mount');
    if (kbMount) {
      kbMount.appendChild(this.keyboard.getElement());
    }
  }
}
