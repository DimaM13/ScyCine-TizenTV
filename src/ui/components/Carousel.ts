// Native Cinema TV Horizontal Carousel (Shelf) Component

import { MediaItem } from '../../types';
import { createCinemaCard } from './Card';

export class Carousel {
  private container: HTMLElement;
  private carouselRow: HTMLElement;
  private title: string;

  constructor(title: string) {
    this.title = title;
    this.container = document.createElement('section');
    this.container.className = 'shelf-section';

    this.container.innerHTML = `
      <div class="shelf-header">
        <div class="shelf-pill"></div>
        <h2 class="shelf-title">${title}</h2>
      </div>
      <div class="shelf-carousel no-scrollbar"></div>
    `;

    this.carouselRow = this.container.querySelector('.shelf-carousel') as HTMLElement;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public setItems(
    items: MediaItem[],
    onClick: (item: MediaItem) => void,
    focusIdPrefix = 'card'
  ) {
    this.carouselRow.innerHTML = '';

    if (!items || items.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'block';

    items.forEach((item) => {
      const card = createCinemaCard(item, onClick, focusIdPrefix);
      this.carouselRow.appendChild(card);
    });
  }
}
