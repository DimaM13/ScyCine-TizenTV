// High-Performance Deterministic Spatial Focus Engine for Samsung Smart TV

import { TIZEN_KEYS, exitTizenApp } from './tizenKeys';

export type FocusDirection = 'up' | 'down' | 'left' | 'right';

export class FocusManager {
  private currentFocusedId: string | null = null;
  private backStack: (() => boolean)[] = [];
  private isEnabled: boolean = true;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private lastEnterTime: number = 0;

  // Custom key interceptor (e.g. for Video Player seeking or Virtual Keyboard)
  public customKeyHandler: ((keyCode: number, e: KeyboardEvent) => boolean) | null = null;

  public init() {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
    }
    this.keydownHandler = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.keydownHandler);

    console.log('[FocusManager] TV Spatial Navigation Initialized.');
  }

  public destroy() {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
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

  public getCurrentFocusedId(): string | null {
    return this.currentFocusedId;
  }

  public getCurrentFocusedElement(): HTMLElement | null {
    const focused = document.querySelector('.tv-focused') as HTMLElement;
    if (focused && (focused.offsetParent !== null || focused.style.position === 'fixed')) return focused;

    if (this.currentFocusedId) {
      const el = document.querySelector(`[data-focus-id="${this.currentFocusedId}"]`) as HTMLElement;
      if (el && (el.offsetParent !== null || el.style.position === 'fixed')) return el;
    }
    return null;
  }

  public focus(idOrEl: string | HTMLElement, scroll = true) {
    const el: HTMLElement | null = typeof idOrEl === 'string'
      ? document.querySelector(`[data-focus-id="${idOrEl}"]:not([disabled])`)
      : idOrEl;

    if (!el) return;

    // Remove focus from previous element
    const prev = document.querySelectorAll('.tv-focused');
    prev.forEach(p => p.classList.remove('tv-focused'));

    // Apply focus class to new element
    el.classList.add('tv-focused');
    this.currentFocusedId = el.getAttribute('data-focus-id') || null;

    try {
      el.focus();
    } catch {}

    if (scroll) {
      try {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      } catch {
        el.scrollIntoView(false);
      }
    }

    // Notify listeners
    window.dispatchEvent(
      new CustomEvent('skycine_focus_changed', {
        detail: { id: this.currentFocusedId, element: el }
      })
    );
  }

  public focusFirst(container?: HTMLElement | string) {
    let root: ParentNode | null = typeof container === 'string'
      ? document.querySelector(container)
      : (container || null);

    if (!root) {
      const playerView = document.querySelector('.player-view') as HTMLElement;
      const activeModal = document.querySelector('.tizen-modal-active') as HTMLElement;
      const detailView = document.querySelector('.detail-view') as HTMLElement;

      if (playerView && playerView.style.display !== 'none') {
        root = playerView;
      } else if (activeModal && activeModal.style.display !== 'none') {
        root = activeModal;
      } else if (detailView && detailView.style.display !== 'none') {
        root = detailView;
      } else {
        root = document;
      }
    }

    const first = (root || document).querySelector('[data-tv-focus="true"]:not([disabled])') as HTMLElement;
    if (first) {
      this.focus(first);
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    const keyCode = e.keyCode || e.which;

    // 1. Allow custom handler (e.g. video player seeking) to intercept first
    if (this.customKeyHandler && this.customKeyHandler(keyCode, e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 2. Return / Back Key
    if (keyCode === TIZEN_KEYS.KEY_RETURN || keyCode === 27 /* Esc */) {
      e.preventDefault();
      e.stopPropagation();

      // Check back stack (modals, dialogs, sub-screens)
      if (this.backStack.length > 0) {
        const topHandler = this.backStack[this.backStack.length - 1];
        if (topHandler()) return;
      }

      // If in content, move back to sidebar first
      const current = this.getCurrentFocusedElement();
      const inSidebar = current && current.closest('.nav-rail');
      if (!inSidebar) {
        const firstNav = document.querySelector('.nav-rail [data-tv-focus="true"]') as HTMLElement;
        if (firstNav) {
          this.focus(firstNav);
          return;
        }
      }

      // If already in sidebar, exit application
      exitTizenApp();
      return;
    }

    if (!this.isEnabled) return;

    // 3. OK / Enter Key
    if (keyCode === TIZEN_KEYS.KEY_ENTER) {
      e.preventDefault();
      e.stopPropagation();

      if (e.repeat) return; // Prevent remote key bounce

      const now = Date.now();
      if (now - this.lastEnterTime < 350) return; // Increased debounce for 6x char bug
      this.lastEnterTime = now;

      const current = this.getCurrentFocusedElement();
      if (current) {
        // Trigger a click. If the element is natively focused, we already prevented default, 
        // so the browser shouldn't emit a duplicate click.
        current.click();
      }
      return;
    }

    // 4. Directional Arrows (Up, Down, Left, Right)
    let dir: FocusDirection | null = null;
    if (keyCode === TIZEN_KEYS.KEY_UP) dir = 'up';
    else if (keyCode === TIZEN_KEYS.KEY_DOWN) dir = 'down';
    else if (keyCode === TIZEN_KEYS.KEY_LEFT) dir = 'left';
    else if (keyCode === TIZEN_KEYS.KEY_RIGHT) dir = 'right';

    if (!dir) return;

    e.preventDefault();
    e.stopPropagation();

    this.navigate(dir);
  }

  public navigate(dir: FocusDirection) {
    const current = this.getCurrentFocusedElement();
    if (!current) {
      this.focusFirst();
      return;
    }

    // Active Modal Scoping: strictly prioritize currently visible view
    let searchScope: ParentNode = document;
    const playerView = document.querySelector('.player-view') as HTMLElement;
    const activeModal = document.querySelector('.tizen-modal-active') as HTMLElement;
    const detailView = document.querySelector('.detail-view') as HTMLElement;

    if (playerView && playerView.style.display !== 'none') {
      searchScope = playerView;
    } else if (activeModal && activeModal.style.display !== 'none') {
      searchScope = activeModal;
    } else if (detailView && detailView.style.display !== 'none') {
      searchScope = detailView;
    }

    // Special handling: Horizontal Carousels
    const currentCarousel = current.closest('.shelf-carousel');
    if (currentCarousel) {
      if (dir === 'left') {
        const prevCard = current.previousElementSibling as HTMLElement;
        if (prevCard && prevCard.getAttribute('data-tv-focus') === 'true') {
          this.focus(prevCard);
          return;
        } else {
          // At beginning of shelf: jump to sidebar!
          const activeNav = document.querySelector('.nav-rail .nav-item.active, .nav-rail [data-tv-focus="true"]') as HTMLElement;
          if (activeNav && searchScope === document) {
            this.focus(activeNav);
            return;
          }
        }
      } else if (dir === 'right') {
        const nextCard = current.nextElementSibling as HTMLElement;
        if (nextCard && nextCard.getAttribute('data-tv-focus') === 'true') {
          this.focus(nextCard);
          return;
        }
      }
    }

    // Special handling: Sidebar Nav Rail
    const currentNav = current.closest('.nav-rail');
    if (currentNav) {
      if (dir === 'right') {
        // Jump from sidebar to main content
        const mainTarget = document.querySelector(
          '.hero-actions [data-tv-focus="true"], .shelf-carousel [data-tv-focus="true"], .main-content [data-tv-focus="true"]'
        ) as HTMLElement;
        if (mainTarget) {
          this.focus(mainTarget);
          return;
        }
      }
    }

    // Geometric Spatial Search
    this.geometricMove(current, dir, searchScope);
  }

  private geometricMove(current: HTMLElement, dir: FocusDirection, scope: ParentNode) {
    const candidates = Array.from(
      scope.querySelectorAll('[data-tv-focus="true"]:not([disabled])')
    ) as HTMLElement[];

    const curRect = current.getBoundingClientRect();
    const curCenter = {
      x: curRect.left + curRect.width / 2,
      y: curRect.top + curRect.height / 2
    };

    let bestCandidate: HTMLElement | null = null;
    let lowestScore = Infinity;

    for (const el of candidates) {
      if (el === current) continue;
      if (el.offsetParent === null && el.style.position !== 'fixed') continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const elCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      let dPrimary = 0;
      let dCross = 0;
      let isValid = false;

      if (dir === 'right') {
        const dx = elCenter.x - curCenter.x;
        if (dx > 4 && rect.left >= curRect.left - 10) {
          dPrimary = Math.max(0, rect.left - curRect.right);
          const overlapY = Math.max(0, Math.min(curRect.bottom, rect.bottom) - Math.max(curRect.top, rect.top));
          if (overlapY > 0) {
            dCross = Math.abs(elCenter.y - curCenter.y);
            isValid = true;
          } else {
            const gapY = rect.top > curRect.bottom ? rect.top - curRect.bottom : curRect.top - rect.bottom;
            if (gapY < 120) {
              dCross = 5000 + (gapY * 10);
              isValid = true;
            }
          }
        }
      } else if (dir === 'left') {
        const dx = curCenter.x - elCenter.x;
        if (dx > 4 && rect.right <= curRect.right + 10) {
          dPrimary = Math.max(0, curRect.left - rect.right);
          const overlapY = Math.max(0, Math.min(curRect.bottom, rect.bottom) - Math.max(curRect.top, rect.top));
          if (overlapY > 0) {
            dCross = Math.abs(elCenter.y - curCenter.y);
            isValid = true;
          } else {
            const gapY = rect.top > curRect.bottom ? rect.top - curRect.bottom : curRect.top - rect.bottom;
            if (gapY < 120) {
              dCross = 5000 + (gapY * 10);
              isValid = true;
            }
          }
        }
      } else if (dir === 'down') {
        const dy = elCenter.y - curCenter.y;
        if (dy > 4 && rect.top >= curRect.top - 10) {
          dPrimary = Math.max(0, rect.top - curRect.bottom);
          const overlapX = Math.max(0, Math.min(curRect.right, rect.right) - Math.max(curRect.left, rect.left));
          if (overlapX > 0) {
            dCross = Math.abs(elCenter.x - curCenter.x);
            isValid = true;
          } else {
            const gapX = rect.left > curRect.right ? rect.left - curRect.right : curRect.left - rect.right;
            if (gapX < 120) {
              dCross = 5000 + (gapX * 10);
              isValid = true;
            }
          }
        }
      } else if (dir === 'up') {
        const dy = curCenter.y - elCenter.y;
        if (dy > 4 && rect.bottom <= curRect.bottom + 10) {
          dPrimary = Math.max(0, curRect.top - rect.bottom);
          const overlapX = Math.max(0, Math.min(curRect.right, rect.right) - Math.max(curRect.left, rect.left));
          if (overlapX > 0) {
            dCross = Math.abs(elCenter.x - curCenter.x);
            isValid = true;
          } else {
            const gapX = rect.left > curRect.right ? rect.left - curRect.right : curRect.left - rect.right;
            if (gapX < 120) {
              dCross = 5000 + (gapX * 10);
              isValid = true;
            }
          }
        }
      }

      if (isValid) {
        const score = (dPrimary * 1.2) + dCross;
        if (score < lowestScore) {
          lowestScore = score;
          bestCandidate = el;
        }
      }
    }

    if (bestCandidate) {
      this.focus(bestCandidate);
    }
  }
}

export const focusManager = new FocusManager();
