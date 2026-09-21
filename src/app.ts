// Native Samsung Smart TV Master Application Router & State Manager

import { Preferences } from './storage/preferences';
import { registerTizenKeys } from './tizen/tizenKeys';
import { focusManager } from './tizen/focusManager';
import { Navbar } from './ui/components/Navbar';
import { AuthPage } from './ui/pages/AuthPage';
import { HomePage } from './ui/pages/HomePage';
import { CatalogPage } from './ui/pages/CatalogPage';
import { DetailPage } from './ui/pages/DetailPage';
import { SearchPage } from './ui/pages/SearchPage';
import { RoomsPage } from './ui/pages/RoomsPage';
import { SettingsPage } from './ui/pages/SettingsPage';
import { VideoPlayer } from './ui/player/VideoPlayer';
import { MediaItem, Episode } from './types';
import { SkyCineApi, episodeProgress, episodeCompleted } from './api/client';
import { RemoteLogger } from './logger';

export class App {
  private rootEl: HTMLElement;
  private appContainer: HTMLElement;
  private viewportEl: HTMLElement;
  private navbar: Navbar | null = null;

  private currentScreen: string = 'home';
  private activePage: any = null;
  private activeDetail: DetailPage | null = null;
  private activePlayer: VideoPlayer | null = null;
  private librariesCache: Array<{ id: string; name: string; type?: string }> = [];

  constructor() {
    this.rootEl = document.getElementById('root') || document.body;
    this.rootEl.innerHTML = '';

    this.appContainer = document.createElement('div');
    this.appContainer.className = 'app-container';

    this.viewportEl = document.createElement('div');
    this.viewportEl.style.cssText = 'flex: 1; height: 1080px; position: relative; overflow: hidden;';

    this.appContainer.appendChild(this.viewportEl);
    this.rootEl.appendChild(this.appContainer);

    // Initialize Hardware TV Keys and Spatial Navigation
    registerTizenKeys();
    focusManager.init();

    // Listen for Auth Expired event
    window.addEventListener('skycine_auth_expired', () => {
      Preferences.clearAuth();
      this.showAuth();
    });
  }

  public start() {
    if (!Preferences.isLoggedIn()) {
      this.showAuth();
    } else {
      this.showMainApp();
    }
  }

  public showAuth() {
    this.cleanupPlayer();
    this.cleanupDetail();

    if (this.navbar) {
      const navEl = this.navbar.getElement();
      if (navEl.parentNode) navEl.parentNode.removeChild(navEl);
      this.navbar = null;
    }

    this.viewportEl.innerHTML = '';

    const auth = new AuthPage(() => {
      this.showMainApp();
    });

    this.viewportEl.appendChild(auth.getElement());
    auth.onMounted();
  }

  public showMainApp() {
    this.viewportEl.innerHTML = '';

    // Initialize Sidebar Navbar
    this.navbar = new Navbar(
      (screen) => this.navigateTo(screen),
      () => this.handleLogout()
    );

    // Insert navbar before viewport in container
    this.appContainer.insertBefore(this.navbar.getElement(), this.viewportEl);

    // Default to Home Screen
    this.navigateTo('home');

    // Dynamic libraries (access-filtered by server) into the sidebar
    this.refreshLibraries();
  }

  private async refreshLibraries() {
    try {
      const libs = await SkyCineApi.getLibraries();
      if (Array.isArray(libs) && libs.length > 0) {
        this.librariesCache = libs;
        if (this.navbar) this.navbar.setLibraries(libs);
      }
    } catch (e) {
      RemoteLogger.warn('APP', `Libraries refresh failed, keeping fallback menu: ${e}`);
    }
  }

  public navigateTo(screen: string) {
    this.currentScreen = screen;
    this.cleanupDetail();
    this.cleanupPlayer();

    if (this.navbar) {
      this.navbar.setActive(screen);
    }

    this.viewportEl.innerHTML = '';

    if (screen === 'home') {
      const home = new HomePage(
        (item) => this.playMedia(item),
        (item) => this.openDetail(item)
      );
      this.activePage = home;
      this.viewportEl.appendChild(home.getElement());
      home.loadData();
    } else if (screen === 'movies') {
      const cat = new CatalogPage('movies', (item) => this.openDetail(item));
      this.activePage = cat;
      this.viewportEl.appendChild(cat.getElement());
    } else if (screen === 'shows') {
      const cat = new CatalogPage('shows', (item) => this.openDetail(item));
      this.activePage = cat;
      this.viewportEl.appendChild(cat.getElement());
    } else if (screen.startsWith('lib:')) {
      const libId = screen.slice(4);
      const lib = this.librariesCache.find((l: any) => String(l.id) === libId);
      const kind = String((lib as any)?.type || '').toUpperCase();
      const libView = kind === 'SHOWS'
        ? { mode: 'shows' as const }
        : { mode: 'movies' as const };
      const cat = new CatalogPage(libView.mode, (item) => this.openDetail(item), lib
        ? { id: String((lib as any).id), name: String((lib as any).name), kind: kind === 'SHOWS' ? 'SHOWS' : kind === 'VIDEOS' ? 'VIDEOS' : 'MOVIES' }
        : null);
      this.activePage = cat;
      this.viewportEl.appendChild(cat.getElement());
    } else if (screen === 'search') {
      const search = new SearchPage((item) => this.openDetail(item));
      this.activePage = search;
      this.viewportEl.appendChild(search.getElement());
      search.onMounted();
    } else if (screen === 'rooms') {
      const rooms = new RoomsPage((code) => this.handleJoinRoom(code));
      this.activePage = rooms;
      this.viewportEl.appendChild(rooms.getElement());
    } else if (screen === 'settings') {
      const settings = new SettingsPage(() => this.handleLogout());
      this.activePage = settings;
      this.viewportEl.appendChild(settings.getElement());
      settings.onMounted();
    }
  }

  public openDetail(media: MediaItem) {
    this.cleanupDetail();

    const detail = new DetailPage(
      media,
      () => {
        this.activeDetail = null;
      },
      (item, ep, list, startFrom) => {
        this.playMedia(item, ep, list, null, startFrom !== undefined ? startFrom : null);
      }
    );

    this.activeDetail = detail;
    this.rootEl.appendChild(detail.getElement());
  }

  public async playMedia(media: MediaItem, episode?: Episode, episodesList?: Episode[], roomId?: string | null, startFromSecs?: number | null) {
    RemoteLogger.info('APP', `playMedia called for "${media.title || media.showTitle}" (type: ${media.type})`);

    // If it's a show and no episode was specified, automatically resolve the first episode!
    const isShow = media.type === 'SHOW' || Boolean(media.showTitle);
    if (!episode && isShow) {
      const title = media.title || media.showTitle || '';
      RemoteLogger.info('APP', `Resolving first episode for show: "${title}"...`);
      try {
        const epList = await SkyCineApi.getShowEpisodes(title);
        if (epList && epList.length > 0) {
          const targetEp = epList.find(e => episodeProgress(e) > 0 && !episodeCompleted(e)) || epList[0];
          RemoteLogger.info('APP', `Starting episode ${targetEp.seasonNumber}x${targetEp.episodeNumber}: "${targetEp.title}"`);
          this.playMedia(media, targetEp, epList);
          return;
        }
      } catch (e: any) {
        RemoteLogger.error('APP', `Failed to load episodes for show: ${title}`, e);
      }
      this.openDetail(media);
      return;
    }

    this.cleanupPlayer();

    // HIDE OTHER UI LAYERS FOR HOLE PUNCHING
    this.appContainer.style.display = 'none';
    if (this.activeDetail) {
      this.activeDetail.getElement().style.display = 'none';
    }

    const player = new VideoPlayer(
      media,
      episode,
      episodesList || [],
      () => {
        this.activePlayer = null;

        // RESTORE OTHER UI LAYERS
        this.appContainer.style.display = 'flex';
        if (this.activeDetail) {
          this.activeDetail.getElement().style.display = 'block';
          focusManager.focus('detail-play-btn');
        } else {
          focusManager.focusFirst();
        }
      },
      (nextEp) => {
        this.playMedia(media, nextEp, episodesList);
      },
      roomId || null,
      startFromSecs !== undefined ? startFromSecs : null
    );

    this.activePlayer = player;
    this.rootEl.appendChild(player.getElement());
    player.onMounted();
  }

  private async handleJoinRoom(roomCode: string) {
    try {
      const rooms = await SkyCineApi.getRooms();
      const targetRoom = rooms.find((r: any) => r.code === roomCode);
      if (!targetRoom) return;
      // Server rooms carry mediaItemId (not mediaId); YouTube rooms have no local file
      const mediaId = (targetRoom as any).mediaItemId || (targetRoom as any).mediaId;
      if (!mediaId) {
        RemoteLogger.warn('APP', `Room ${roomCode} has no local media (YouTube?) — cannot play on TV`);
        return;
      }
      const media = await SkyCineApi.getMediaItem(mediaId);
      this.playMedia(media, undefined, [], targetRoom.id);
    } catch (e) {
      console.error('[App] Error joining room:', e);
    }
  }

  private handleLogout() {
    Preferences.clearAuth();
    this.showAuth();
  }

  private cleanupDetail() {
    if (this.activeDetail) {
      this.activeDetail.close();
      this.activeDetail = null;
    }
  }

  private cleanupPlayer() {
    if (this.activePlayer) {
      this.activePlayer.close();
      this.activePlayer = null;
    }
  }
}
