// Native Cinema TV Seeking HUD Center Badge Component

export class SeekBadge {
  private element: HTMLElement;
  private timer: any = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'player-seek-hud';
    this.element.style.display = 'none';
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public show(action: string, timeDetail: string) {
    clearTimeout(this.timer);

    this.element.innerHTML = `
      <div class="seek-hud-action">${action}</div>
      <div class="seek-hud-time">${timeDetail}</div>
    `;

    this.element.style.display = 'flex';

    this.timer = setTimeout(() => {
      this.element.style.display = 'none';
    }, 1300);
  }

  public hide() {
    clearTimeout(this.timer);
    this.element.style.display = 'none';
  }
}
