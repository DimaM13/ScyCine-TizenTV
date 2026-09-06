// Native Cinema TV Virtual Keyboard Component with Deterministic 2D Grid for Samsung Tizen TV

import { focusManager } from '../../tizen/focusManager';

export interface VirtualKeyboardOptions {
  onChar: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  defaultLang?: 'EN' | 'RU';
}

export class VirtualKeyboard {
  private container: HTMLElement;
  private options: VirtualKeyboardOptions;
  private currentLang: 'EN' | 'RU';
  private isCaps: boolean = false;

  private layouts = {
    EN: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '_'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '!', '?'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@', '#', '$'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', ':', '/', '+', '=']
    ],
    RU: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '_'],
      ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
      ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э', '@'],
      ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', '.', ':', '/']
    ]
  };

  constructor(options: VirtualKeyboardOptions) {
    this.options = options;
    this.currentLang = options.defaultLang || 'EN';
    this.container = document.createElement('div');
    this.container.className = 'tv-keyboard-container';
    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public setLanguage(lang: 'EN' | 'RU') {
    this.currentLang = lang;
    this.render();
  }

  public toggleCaps() {
    this.isCaps = !this.isCaps;
    this.render();
  }

  public render() {
    const layout = this.layouts[this.currentLang];
    const submitText = this.options.submitLabel || 'Готово';

    let html = '';

    // Letter / Number Rows
    layout.forEach((row, rowIdx) => {
      html += `<div class="kb-row" data-row="${rowIdx}">`;
      row.forEach((char) => {
        const displayChar = this.isCaps ? char.toUpperCase() : char.toLowerCase();
        html += `
          <button 
            type="button" 
            class="tv-kb-key" 
            data-tv-focus="true" 
            data-focus-id="kb-${this.currentLang}-${char}" 
            data-char="${displayChar}"
            tabindex="0"
          >
            ${displayChar}
          </button>
        `;
      });
      html += `</div>`;
    });

    // Control Action Row (Lang, Caps, Space, Backspace, Clear, Submit)
    html += `
      <div class="kb-row" style="margin-top: 10px;">
        <button 
          type="button" 
          class="tv-kb-key tv-kb-key-wide" 
          data-tv-focus="true" 
          data-focus-id="kb-action-lang" 
          tabindex="0"
          style="padding: 0 14px; font-size: 15px;"
        >
          Язык: ${this.currentLang}
        </button>

        <button 
          type="button" 
          class="tv-kb-key tv-kb-key-wide" 
          data-tv-focus="true" 
          data-focus-id="kb-action-caps" 
          tabindex="0"
          style="padding: 0 14px; font-size: 15px; ${this.isCaps ? 'background: #e5a93c; color: #07090e; font-weight: 900; border: 2px solid #f59e0b;' : ''}"
        >
          ${this.isCaps ? '⇧ БОЛЬШИЕ' : '⇧ маленькие'}
        </button>

        <button 
          type="button" 
          class="tv-kb-key tv-kb-key-wide" 
          data-tv-focus="true" 
          data-focus-id="kb-action-space" 
          tabindex="0"
          style="flex: 1; max-width: 200px; font-size: 15px;"
        >
          Пробел
        </button>

        <button 
          type="button" 
          class="tv-kb-key tv-kb-key-wide" 
          data-tv-focus="true" 
          data-focus-id="kb-action-backspace" 
          tabindex="0"
          style="padding: 0 14px; font-size: 15px;"
        >
          Стереть
        </button>

        <button 
          type="button" 
          class="tv-kb-key tv-kb-key-wide" 
          data-tv-focus="true" 
          data-focus-id="kb-action-clear" 
          tabindex="0"
          style="padding: 0 14px; font-size: 15px;"
        >
          Очистить
        </button>

        <button 
          type="button" 
          class="tv-kb-key tv-kb-key-wide" 
          data-tv-focus="true" 
          data-focus-id="kb-action-submit" 
          tabindex="0"
          style="padding: 0 18px; font-size: 15px; border: 2px solid #e5a93c;"
        >
          ${submitText}
        </button>
      </div>
    `;

    this.container.innerHTML = html;

    // Attach Key Click Handlers
    const keyBtns = this.container.querySelectorAll('[data-char]');
    keyBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const ch = btn.getAttribute('data-char');
        if (ch) this.options.onChar(ch);
      });
    });

    const langBtn = this.container.querySelector('[data-focus-id="kb-action-lang"]');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        this.setLanguage(this.currentLang === 'EN' ? 'RU' : 'EN');
        focusManager.focus('kb-action-lang');
      });
    }

    const capsBtn = this.container.querySelector('[data-focus-id="kb-action-caps"]');
    if (capsBtn) {
      capsBtn.addEventListener('click', () => {
        this.toggleCaps();
        focusManager.focus('kb-action-caps');
      });
    }

    const spaceBtn = this.container.querySelector('[data-focus-id="kb-action-space"]');
    if (spaceBtn) {
      spaceBtn.addEventListener('click', () => {
        this.options.onChar(' ');
      });
    }

    const backBtn = this.container.querySelector('[data-focus-id="kb-action-backspace"]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.options.onBackspace();
      });
    }

    const clearBtn = this.container.querySelector('[data-focus-id="kb-action-clear"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.options.onClear();
      });
    }

    const submitBtn = this.container.querySelector('[data-focus-id="kb-action-submit"]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.options.onSubmit();
      });
    }
  }
}
