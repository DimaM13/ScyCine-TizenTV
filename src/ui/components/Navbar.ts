// Native Cinema TV Sidebar Navigation Rail

import { Icons } from '../icons';
import { Preferences } from '../../storage/preferences';
import { focusManager } from '../../tizen/focusManager';

export interface NavItemDef {
  id: string;
  label: string;
  iconHtml: string;
}

export interface NavLibraryDef {
  id: string;
  name: string;
  kind: 'MOVIES' | 'SHOWS' | 'VIDEOS';
}

export class Navbar {
  private container: HTMLElement;
  private currentScreen: string = 'home';
  private onSelectCallback: (screen: string) => void;
  private onLogoutCallback: () => void;
  private libraries: NavLibraryDef[] = [];
  private librariesLoaded: boolean = false;

  private coreHead: NavItemDef[] = [
    { id: 'home', label: 'Главная', iconHtml: Icons.home(26) },
  ];

  private coreTail: NavItemDef[] = [
    { id: 'search', label: 'Поиск', iconHtml: Icons.search(26) },
    { id: 'rooms', label: 'Вместе', iconHtml: Icons.users(26) },
    { id: 'settings', label: 'Настройки', iconHtml: Icons.settings(26) }
  ];

  private get items(): NavItemDef[] {
    // Пока библиотеки не загрузились — классика, чтобы не было пустого меню.
    // После загрузки — только реальные библиотеки, к которым есть доступ.
    const middle: NavItemDef[] = this.librariesLoaded
      ? this.libraries.map((l) => ({
          id: `lib:${l.id}`,
          label: l.name,
          iconHtml: l.kind === 'SHOWS' ? Icons.tv(26) : l.kind === 'VIDEOS' ? Icons.play(26) : Icons.film(26),
        }))
      : [
          { id: 'movies', label: 'Фильмы', iconHtml: Icons.film(26) },
          { id: 'shows', label: 'Сериалы', iconHtml: Icons.tv(26) },
        ];
    return [...this.coreHead, ...middle, ...this.coreTail];
  }

  constructor(
    onSelect: (screen: string) => void,
    onLogout: () => void
  ) {
    this.onSelectCallback = onSelect;
    this.onLogoutCallback = onLogout;
    this.container = document.createElement('aside');
    this.container.className = 'nav-rail';
    this.render();

    // Auto expand/collapse sidebar on focus
    window.addEventListener('skycine_focus_changed', (e: any) => {
      const el = e.detail?.element as HTMLElement;
      if (el && this.container.contains(el)) {
        this.container.classList.add('expanded');
      } else {
        this.container.classList.remove('expanded');
      }
    });
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  /** Real libraries from server (access-filtered). Re-renders the middle section. */
  public setLibraries(libs: Array<{ id: string; name: string; type?: string }>) {
    const norm = (t: any): 'MOVIES' | 'SHOWS' | 'VIDEOS' => {
      const u = String(t || '').toUpperCase();
      if (u === 'SHOWS') return 'SHOWS';
      if (u === 'VIDEOS' || u === 'VIDEO' || u === 'CLIPS') return 'VIDEOS';
      return 'MOVIES';
    };
    this.libraries = (libs || [])
      .filter((l) => l && l.id && l.name)
      .map((l) => ({ id: String(l.id), name: String(l.name), kind: norm((l as any).type) }));
    this.librariesLoaded = true;
    // Keep focus sane: if current screen vanished, fall back to home highlight
    const stillThere = this.items.some((i) => i.id === this.currentScreen);
    if (!stillThere) this.currentScreen = 'home';
    this.render();
  }

  public setActive(screen: string) {
    this.currentScreen = screen;
    const allBtns = this.container.querySelectorAll('.nav-item');
    allBtns.forEach((btn) => {
      const id = btn.getAttribute('data-screen-id');
      if (id === screen) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  public render() {
    const user = Preferences.getUser();

    this.container.innerHTML = `
      <!-- Brand Logo -->
      <div class="nav-rail-logo">
        <div class="nav-logo-icon">
          ${Icons.clapperboard(30, '#07090e')}
        </div>
        <div class="nav-logo-text">
          <div class="nav-logo-title">SKY<span>CINE</span></div>
          <div class="nav-logo-sub">Cinema TV</div>
        </div>
      </div>

      <!-- Menu Items -->
      <nav class="nav-menu">
        ${this.items
          .map(
            (item) => `
          <button 
            type="button"
            class="nav-item ${this.currentScreen === item.id ? 'active' : ''}"
            data-tv-focus="true"
            data-focus-id="nav-${item.id}"
            data-screen-id="${item.id}"
            tabindex="0"
          >
            <div class="nav-item-icon">${item.iconHtml}</div>
            <span class="nav-item-label">${item.label}</span>
          </button>
        `
          )
          .join('')}
      </nav>

      <!-- Footer: User & Logout -->
      <div class="nav-footer">
        ${
          user
            ? `
          <div class="nav-user-info" style="display: none; padding: 0 16px;">
            <div style="font-size: 11px; color: #64748b; font-weight: 700;">ПРОФИЛЬ</div>
            <div style="font-size: 14px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.username}</div>
          </div>
        `
            : ''
        }
        <button 
          type="button"
          class="nav-item"
          data-tv-focus="true"
          data-focus-id="nav-logout"
          tabindex="0"
          style="color: #f87171;"
        >
          <div class="nav-item-icon">${Icons.logout(24, '#f87171')}</div>
          <span class="nav-item-label">Выйти</span>
        </button>
      </div>
    `;

    // Attach click handlers
    this.items.forEach((item) => {
      const btn = this.container.querySelector(`[data-focus-id="nav-${item.id}"]`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.setActive(item.id);
          this.onSelectCallback(item.id);
        });
      }
    });

    const logoutBtn = this.container.querySelector('[data-focus-id="nav-logout"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.onLogoutCallback();
      });
    }
  }
}
