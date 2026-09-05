// Native Cinema TV 1920x1080 Authentication Screen

import { Preferences } from '../../storage/preferences';
import { SkyCineApi } from '../../api/client';
import { VirtualKeyboard } from '../components/VirtualKeyboard';
import { focusManager } from '../../tizen/focusManager';
import { Icons } from '../icons';

export class AuthPage {
  private container: HTMLElement;
  private onSuccessCallback: () => void;

  private username: string = '';
  private password: string = '';
  private serverUrl: string = Preferences.getServerUrl();
  private activeField: 'user' | 'pass' | 'server' = 'user';
  private errorMsg: string = '';
  private loading: boolean = false;

  private keyboard: VirtualKeyboard;

  constructor(onSuccess: () => void) {
    this.onSuccessCallback = onSuccess;
    this.container = document.createElement('div');
    this.container.className = 'auth-page-view';
    this.container.style.cssText = `
      width: 1920px;
      height: 1080px;
      background: linear-gradient(135deg, #07090e 0%, #0d111a 50%, #07090e 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 48px 64px;
      overflow: hidden;
      position: fixed;
      inset: 0;
      z-index: 200;
    `;

    this.keyboard = new VirtualKeyboard({
      onChar: (ch) => this.handleChar(ch),
      onBackspace: () => this.handleBackspace(),
      onClear: () => this.handleClear(),
      onSubmit: () => this.handleLogin(),
      submitLabel: 'Войти',
      defaultLang: 'EN'
    });

    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public onMounted() {
    focusManager.focus('auth-user-input');
  }

  private handleChar(ch: string) {
    this.errorMsg = '';
    if (this.activeField === 'user') this.username += ch;
    else if (this.activeField === 'pass') this.password += ch;
    else if (this.activeField === 'server') this.serverUrl += ch;
    this.updateFieldValues();
  }

  private handleBackspace() {
    this.errorMsg = '';
    if (this.activeField === 'user') this.username = this.username.slice(0, -1);
    else if (this.activeField === 'pass') this.password = this.password.slice(0, -1);
    else if (this.activeField === 'server') this.serverUrl = this.serverUrl.slice(0, -1);
    this.updateFieldValues();
  }

  private handleClear() {
    this.errorMsg = '';
    if (this.activeField === 'user') this.username = '';
    else if (this.activeField === 'pass') this.password = '';
    else if (this.activeField === 'server') this.serverUrl = '';
    this.updateFieldValues();
  }

  private updateFieldValues() {
    const userVal = this.container.querySelector('#auth-user-val');
    if (userVal) userVal.textContent = this.username || 'Введите логин...';

    const passVal = this.container.querySelector('#auth-pass-val');
    if (passVal) passVal.textContent = this.password || 'Введите пароль...';

    const serverVal = this.container.querySelector('#auth-server-val');
    if (serverVal) serverVal.textContent = this.serverUrl || 'http://192.168.0.100:3000';

    const activeBanner = this.container.querySelector('#auth-active-banner');
    if (activeBanner) {
      activeBanner.textContent =
        this.activeField === 'user' ? 'Имя пользователя' : this.activeField === 'pass' ? 'Пароль (открытый ввод)' : 'Адрес сервера';
    }

    const errorEl = this.container.querySelector('#auth-error-box');
    if (errorEl) {
      errorEl.textContent = this.errorMsg;
      (errorEl as HTMLElement).style.display = this.errorMsg ? 'block' : 'none';
    }
  }

  private async handleLogin() {
    if (!this.username.trim() || !this.password) {
      this.errorMsg = 'Введите имя пользователя и пароль';
      this.updateFieldValues();
      return;
    }

    Preferences.setServerUrl(this.serverUrl);
    this.loading = true;
    this.errorMsg = '';
    this.updateFieldValues();

    const submitBtn = this.container.querySelector('[data-focus-id="auth-submit-btn"]') as HTMLElement;
    if (submitBtn) submitBtn.textContent = 'Проверка данных...';

    try {
      const cleanUser = this.username.trim();
      const res = await SkyCineApi.login(cleanUser, this.password);
      Preferences.setToken(res.token);
      Preferences.setUser(res.user);
      this.onSuccessCallback();
    } catch (err: any) {
      this.errorMsg = err.response?.data?.error || 'Неверный логин или пароль (проверьте адрес сервера)';
      this.updateFieldValues();
      if (submitBtn) submitBtn.textContent = 'Войти в SkyCine';
      focusManager.focus('auth-user-input');
    } finally {
      this.loading = false;
    }
  }

  public render() {
    this.container.innerHTML = `
      <!-- Top Header Bar -->
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid rgba(30,41,59,0.8); padding-bottom: 20px;">
        <div style="display: flex; align-items: center; margin-right: 18px;">
          <div class="nav-logo-icon" style="width: 54px; height: 54px; border-radius: 16px;">
            ${Icons.clapperboard(30, '#07090e')}
          </div>
          <div>
            <div style="font-size: 28px; font-weight: 900; color: #ffffff; letter-spacing: 2px;">
              SKYCINE <span style="color: #e5a93c; font-size: 16px; background: rgba(229,169,60,0.15); border: 1px solid rgba(229,169,60,0.4); padding: 4px 10px; border-radius: 8px;">CINEMA TV</span>
            </div>
            <div style="font-size: 12px; color: #94a3b8; font-weight: 700; letter-spacing: 1.5px; margin-top: 2px;">
              SAMSUNG SMART TV • TIZEN OS 5.0+
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; margin-right: 12px; background: rgba(13,17,26,0.9); border: 1px solid rgba(51,65,85,0.8); padding: 10px 20px; border-radius: 16px;">
          <div style="width: 10px; height: 10px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399;"></div>
          <span style="font-size: 13px; font-weight: 700; color: #94a3b8;">Сервер:</span>
          <span style="font-size: 13px; font-weight: 800; color: #e5a93c; font-family: monospace;">${this.serverUrl}</span>
        </div>
      </div>

      <!-- Main Columns Grid -->
      <div style="display: grid; grid-template-columns: 580px 1fr; margin-right: 48px; align-items: center; margin: auto 0; width: 100%;">
        
        <!-- Left Column: Form -->
        <div style="background: rgba(13,17,26,0.92); border: 2px solid rgba(30,41,59,0.8); border-radius: 28px; padding: 36px; display: flex; flex-direction: column; margin-right: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.8);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(30,41,59,0.8); padding-bottom: 12px;">
            <span style="font-size: 18px; font-weight: 900; color: #ffffff; text-transform: uppercase;">Вход в аккаунт</span>
            <span style="font-size: 12px; color: #64748b;">Управление с пульта TV</span>
          </div>

          <div id="auth-error-box" style="display: none; background: rgba(220,38,38,0.2); border: 2px solid #ef4444; border-radius: 12px; padding: 12px 16px; color: #fca5a5; font-size: 13px; font-weight: 700;"></div>

          <!-- Fields -->
          <div style="display: flex; flex-direction: column; margin-right: 16px;">
            <!-- Username Field -->
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">ИМЯ ПОЛЬЗОВАТЕЛЯ</div>
              <button 
                type="button"
                class="tv-input-line" 
                data-tv-focus="true" 
                data-focus-id="auth-user-input"
                tabindex="0"
                style="width: 100%; height: 56px; background: #141a29; border: 2px solid #1e2638; border-radius: 16px; padding: 0 20px; color: #ffffff; font-size: 17px; font-weight: 700; display: flex; align-items: center; text-align: left; cursor: pointer;"
              >
                <span id="auth-user-val" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${this.username || 'Введите логин...'}
                </span>
              </button>
            </div>

            <!-- Password Field -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 13px; font-weight: 700; color: #94a3b8;">ПАРОЛЬ</span>
                <span style="font-size: 11px; color: #e5a93c; font-weight: 700;">открытый ввод</span>
              </div>
              <button 
                type="button"
                class="tv-input-line" 
                data-tv-focus="true" 
                data-focus-id="auth-pass-input"
                tabindex="0"
                style="width: 100%; height: 56px; background: #141a29; border: 2px solid #1e2638; border-radius: 16px; padding: 0 20px; color: #ffffff; font-family: monospace; font-size: 17px; font-weight: 700; display: flex; align-items: center; text-align: left; cursor: pointer;"
              >
                <span id="auth-pass-val" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${this.password || 'Введите пароль...'}
                </span>
              </button>
            </div>

            <!-- Server URL Field -->
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">АДРЕС СЕРВЕРА SKYCINE</div>
              <button 
                type="button"
                class="tv-input-line" 
                data-tv-focus="true" 
                data-focus-id="auth-server-input"
                tabindex="0"
                style="width: 100%; height: 56px; background: #141a29; border: 2px solid #1e2638; border-radius: 16px; padding: 0 20px; color: #e5a93c; font-family: monospace; font-size: 15px; font-weight: 700; display: flex; align-items: center; text-align: left; cursor: pointer;"
              >
                <span id="auth-server-val" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${this.serverUrl || 'http://192.168.0.100:3000'}
                </span>
              </button>

              <!-- Server presets -->
              <div style="display: flex; margin-right: 8px; margin-top: 8px;">
                <button type="button" class="tv-btn tv-btn-secondary" data-tv-focus="true" data-focus-id="preset-def" tabindex="0" style="height: 38px; padding: 0 14px; font-size: 12px; font-family: monospace; color: #e5a93c;">
                  192.168.0.100:3000
                </button>
                <button type="button" class="tv-btn tv-btn-secondary" data-tv-focus="true" data-focus-id="preset-prefix" tabindex="0" style="height: 38px; padding: 0 14px; font-size: 12px; font-family: monospace;">
                  http://
                </button>
                <button type="button" class="tv-btn tv-btn-secondary" data-tv-focus="true" data-focus-id="preset-port" tabindex="0" style="height: 38px; padding: 0 14px; font-size: 12px; font-family: monospace;">
                  :3000
                </button>
              </div>
            </div>
          </div>

          <button 
            type="button"
            class="tv-btn tv-btn-primary" 
            data-tv-focus="true" 
            data-focus-id="auth-submit-btn"
            tabindex="0"
            style="height: 60px; font-size: 18px; margin-top: 10px;"
          >
            Войти в SkyCine
          </button>
        </div>

        <!-- Right Column: Keyboard & Active Field Banner -->
        <div style="display: flex; flex-direction: column; margin-right: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(13,17,26,0.95); border: 2px solid rgba(30,41,59,0.8); border-radius: 20px; padding: 14px 24px;">
            <div style="display: flex; align-items: center; margin-right: 14px;">
              <span style="font-size: 14px; font-weight: 800; color: #94a3b8;">Ввод текста в:</span>
              <span id="auth-active-banner" style="background: #e5a93c; color: #07090e; font-size: 14px; font-weight: 900; padding: 4px 14px; border-radius: 8px; text-transform: uppercase; letter-spacing: 1px;">
                Имя пользователя
              </span>
            </div>
            <span style="font-size: 12px; color: #e5a93c; font-weight: 700;">◄ Стрелка Влево: переключить поле</span>
          </div>

          <!-- Keyboard Container Insertion -->
          <div id="auth-keyboard-mount"></div>
        </div>

      </div>

      <!-- Bottom Hint Bar -->
      <div style="display: flex; justify-content: space-between; color: #64748b; font-size: 12px; font-weight: 600; border-top: 1px solid rgba(30,41,59,0.6); padding-top: 16px;">
        <span>Пульт: ▲ ▼ ◄ ► Навигация &bull; OK Выбор &bull; Return Назад</span>
        <span>SkyCine Client v1.0.4 for Tizen OS</span>
      </div>
    `;

    // Mount Virtual Keyboard
    const kbMount = this.container.querySelector('#auth-keyboard-mount');
    if (kbMount) {
      kbMount.appendChild(this.keyboard.getElement());
    }

    // Attach Input Field Selection Handlers
    const userInput = this.container.querySelector('[data-focus-id="auth-user-input"]');
    if (userInput) {
      userInput.addEventListener('click', () => {
        this.activeField = 'user';
        this.updateFieldValues();
        focusManager.focus('kb-EN-q');
      });
      userInput.addEventListener('focus', () => {
        this.activeField = 'user';
        this.updateFieldValues();
      });
    }

    const passInput = this.container.querySelector('[data-focus-id="auth-pass-input"]');
    if (passInput) {
      passInput.addEventListener('click', () => {
        this.activeField = 'pass';
        this.updateFieldValues();
        focusManager.focus('kb-EN-a');
      });
      passInput.addEventListener('focus', () => {
        this.activeField = 'pass';
        this.updateFieldValues();
      });
    }

    const serverInput = this.container.querySelector('[data-focus-id="auth-server-input"]');
    if (serverInput) {
      serverInput.addEventListener('click', () => {
        this.activeField = 'server';
        this.updateFieldValues();
        focusManager.focus('kb-EN-z');
      });
      serverInput.addEventListener('focus', () => {
        this.activeField = 'server';
        this.updateFieldValues();
      });
    }

    // Preset Buttons
    const defPreset = this.container.querySelector('[data-focus-id="preset-def"]');
    if (defPreset) {
      defPreset.addEventListener('click', () => {
        this.serverUrl = 'http://192.168.0.100:3000';
        Preferences.setServerUrl(this.serverUrl);
        this.updateFieldValues();
      });
    }

    const prefixPreset = this.container.querySelector('[data-focus-id="preset-prefix"]');
    if (prefixPreset) {
      prefixPreset.addEventListener('click', () => {
        if (!this.serverUrl.startsWith('http://')) {
          this.serverUrl = `http://${this.serverUrl}`;
          this.updateFieldValues();
        }
      });
    }

    const portPreset = this.container.querySelector('[data-focus-id="preset-port"]');
    if (portPreset) {
      portPreset.addEventListener('click', () => {
        if (!this.serverUrl.includes(':3000')) {
          this.serverUrl = `${this.serverUrl}:3000`;
          this.updateFieldValues();
        }
      });
    }

    // Submit Button
    const submitBtn = this.container.querySelector('[data-focus-id="auth-submit-btn"]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.handleLogin();
      });
    }
  }
}
