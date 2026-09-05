import { TIZEN_KEYS, exitTizenApp } from './tizenKeys';

export class SpatialNavigationManager {
  private currentFocusedId: string | null = null;
  private backStack: (() => boolean)[] = [];
  private isEnabled: boolean = true;

  public init() {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    console.log('[SpatialNav] Spatial navigation initialized.');
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  public pushBackHandler(handler: () => boolean) {
    this.backStack.push(handler);
  }

  public popBackHandler(handler?: () => boolean) {
    if (handler) {
      const idx = this.backStack.lastIndexOf(handler);
      if (idx !== -1) this.backStack.splice(idx, 1);
    } else {
      this.backStack.pop();
    }
  }

  public setFocus(id: string) {
    const target = document.querySelector(`[data-focus-id="${id}"]`) as HTMLElement;
    if (target) {
      this.focusElement(target);
    }
  }

  public focusFirst(containerSelector?: string) {
    const root = containerSelector ? document.querySelector(containerSelector) : document;
    const first = (root || document).querySelector('[data-tv-focus="true"]:not([disabled])') as HTMLElement;
    if (first) {
      this.focusElement(first);
    }
  }

  public getCurrentFocused(): HTMLElement | null {
    return (document.querySelector('.tv-focused') as HTMLElement) || null;
  }

  public focusElement(el: HTMLElement) {
    const prev = document.querySelector('.tv-focused') as HTMLElement;
    if (prev) {
      prev.classList.remove('tv-focused');
      prev.blur();
    }

    el.classList.add('tv-focused');
    el.focus();
    this.currentFocusedId = el.getAttribute('data-focus-id');

    // Smoothly scroll into viewport on TV
    el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
  }

  private handleKeyDown(e: KeyboardEvent) {
    const keyCode = e.keyCode || e.which;

    // 1. Check Return / Back key (Always active, even if navigation is paused)
    if (keyCode === TIZEN_KEYS.KEY_RETURN || keyCode === 27 /* Esc */) {
      e.preventDefault();
      if (this.backStack.length > 0) {
        const topHandler = this.backStack[this.backStack.length - 1];
        const handled = topHandler();
        if (handled) return;
      }
      exitTizenApp();
      return;
    }

    if (!this.isEnabled) {
      return;
    }

    // 2. Check Enter / OK key
    if (keyCode === TIZEN_KEYS.KEY_ENTER) {
      const focused = document.querySelector('.tv-focused') as HTMLElement;
      if (focused) {
        focused.click();
      }
      return;
    }

    // 3. Arrow Navigation (Up, Down, Left, Right)
    let direction: 'up' | 'down' | 'left' | 'right' | null = null;
    if (keyCode === TIZEN_KEYS.KEY_UP) direction = 'up';
    else if (keyCode === TIZEN_KEYS.KEY_DOWN) direction = 'down';
    else if (keyCode === TIZEN_KEYS.KEY_LEFT) direction = 'left';
    else if (keyCode === TIZEN_KEYS.KEY_RIGHT) direction = 'right';

    if (!direction) return;

    // Check modal isolation: if a modal is active, focus only within it!
    const activeModal = document.querySelector('.tizen-modal-active') as HTMLElement;
    const searchScope = activeModal || document;

    const current = (activeModal && !activeModal.contains(document.querySelector('.tv-focused')))
      ? (activeModal.querySelector('[data-tv-focus="true"]:not([disabled])') as HTMLElement)
      : (document.querySelector('.tv-focused') as HTMLElement) ||
        (searchScope.querySelector('[data-tv-focus="true"]:not([disabled])') as HTMLElement);

    if (!current) {
      this.focusFirst(activeModal ? '.tizen-modal-active' : undefined);
      return;
    }

    e.preventDefault();
    this.moveFocus(current, direction, searchScope);
  }

  private moveFocus(current: HTMLElement, direction: 'up' | 'down' | 'left' | 'right', scope: ParentNode) {
    const allFocusables = Array.from(
      scope.querySelectorAll('[data-tv-focus="true"]:not([disabled])')
    ) as HTMLElement[];

    const currentRect = current.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2
    };

    let bestCandidate: HTMLElement | null = null;
    let shortestDistance = Infinity;

    for (const candidate of allFocusables) {
      if (candidate === current) continue;
      const rect = candidate.getBoundingClientRect();

      // Check if visible
      if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(candidate).display === 'none' || window.getComputedStyle(candidate).visibility === 'hidden') {
        continue;
      }

      const candidateCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      const dx = candidateCenter.x - currentCenter.x;
      const dy = candidateCenter.y - currentCenter.y;

      // Validate direction
      let isValidDirection = false;
      let primaryDiff = 0;
      let secondaryDiff = 0;

      if (direction === 'up' && dy < -4) {
        isValidDirection = true;
        primaryDiff = Math.abs(dy);
        secondaryDiff = Math.abs(dx);
      } else if (direction === 'down' && dy > 4) {
        isValidDirection = true;
        primaryDiff = Math.abs(dy);
        secondaryDiff = Math.abs(dx);
      } else if (direction === 'left' && dx < -4) {
        isValidDirection = true;
        primaryDiff = Math.abs(dx);
        secondaryDiff = Math.abs(dy);
      } else if (direction === 'right' && dx > 4) {
        isValidDirection = true;
        primaryDiff = Math.abs(dx);
        secondaryDiff = Math.abs(dy);
      }

      if (isValidDirection) {
        // Weighted distance penalizes cross-axis movement
        const distance = primaryDiff + secondaryDiff * 2.2;
        if (distance < shortestDistance) {
          shortestDistance = distance;
          bestCandidate = candidate;
        }
      }
    }

    if (bestCandidate) {
      this.focusElement(bestCandidate);
    }
  }
}

export const spatialNav = new SpatialNavigationManager();
