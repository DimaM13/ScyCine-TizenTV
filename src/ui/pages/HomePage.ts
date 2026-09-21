// Native Cinema TV Home Screen (Hero Billboard + Widescreen Carousels)

import { MediaItem } from '../../types';
import { SkyCineApi } from '../../api/client';
import { Billboard } from '../components/Billboard';
import { Carousel } from '../components/Carousel';
import { focusManager } from '../../tizen/focusManager';

export class HomePage {
  private container: HTMLElement;
  private billboard: Billboard;
  private continueShelf: Carousel;
  private moviesShelf: Carousel;
  private videosShelf: Carousel;
  private showsShelf: Carousel;

  private onPlayCallback: (item: MediaItem) => void;
  private onDetailCallback: (item: MediaItem) => void;

  private featuredItem: MediaItem | null = null;
  private allMovies: MediaItem[] = [];
  private allVideos: MediaItem[] = [];
  private allShows: MediaItem[] = [];

  constructor(
    onPlay: (item: MediaItem) => void,
    onDetail: (item: MediaItem) => void
  ) {
    this.onPlayCallback = onPlay;
    this.onDetailCallback = onDetail;

    this.container = document.createElement('div');
    this.container.className = 'main-content';

    this.billboard = new Billboard(
      (item) => this.onPlayCallback(item),
      (item) => this.onDetailCallback(item)
    );

    this.continueShelf = new Carousel('Продолжить просмотр');
    this.moviesShelf = new Carousel('Фильмы медиатеки');
    this.videosShelf = new Carousel('Видео и клипы');
    this.showsShelf = new Carousel('Популярные сериалы');

    this.container.appendChild(this.billboard.getElement());
    this.container.appendChild(this.continueShelf.getElement());
    this.container.appendChild(this.moviesShelf.getElement());
    this.container.appendChild(this.videosShelf.getElement());
    this.container.appendChild(this.showsShelf.getElement());
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public async loadData() {
    try {
      const [continueItems, moviesRaw, shows] = await Promise.all([
        SkyCineApi.getContinueWatching().catch(() => []),
        SkyCineApi.getMovies().catch(() => []),
        SkyCineApi.getShows().catch(() => [])
      ]);

      // Сервер кладёт VIDEO в выдачу /media/movies — делим честно:
      // фильмы отдельно, клипы/видео отдельной полкой
      const movies = (moviesRaw as MediaItem[]).filter(m => (m as any).type !== 'VIDEO');
      const videos = (moviesRaw as MediaItem[]).filter(m => (m as any).type === 'VIDEO');
      this.allMovies = movies;
      this.allVideos = videos;
      this.allShows = shows;

      // 1. Set Featured Item for Billboard
      const candidates = [...movies, ...shows].filter(m => m.backdropPath && (m.title || m.showTitle));
      if (candidates.length > 0) {
        const sorted = [...candidates].sort((a, b) => (b.rating || 0) - (a.rating || 0));
        this.featuredItem = sorted[0];
      } else if (movies.length > 0) {
        this.featuredItem = movies[0];
      } else if (shows.length > 0) {
        this.featuredItem = shows[0];
      }

      this.billboard.setItem(this.featuredItem);

      // 2. Populate Shelves
      this.continueShelf.setItems(
        continueItems.map((item: any) => ({
          ...item,
          id: item.mediaId || item.id,
          effectiveId: item.mediaId || item.id
        })),
        (item) => this.onPlayCallback(item),
        'cont'
      );

      this.moviesShelf.setItems(
        movies,
        (item) => this.onDetailCallback(item),
        'movie'
      );

      this.videosShelf.setItems(
        videos,
        (item) => this.onDetailCallback(item),
        'video'
      );

      this.showsShelf.setItems(
        shows,
        (item) => this.onDetailCallback(item),
        'show'
      );

      // 3. Initial Focus
      setTimeout(() => {
        const firstFocus = this.container.querySelector(
          '[data-focus-id="hero-play-btn"], [data-focus-id^="cont-"], [data-focus-id^="movie-"], [data-focus-id^="video-"], [data-focus-id^="show-"]'
        ) as HTMLElement;
        if (firstFocus) {
          focusManager.focus(firstFocus);
        }
      }, 100);

    } catch (err) {
      console.error('[HomePage] Error loading home content:', err);
    }
  }
}
