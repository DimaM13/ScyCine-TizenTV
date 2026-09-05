// Native Cinema TV Settings Screen

import { Preferences } from '../../storage/preferences';
import { focusManager } from '../../tizen/focusManager';
import { Icons } from '../icons';

export class SettingsPage {
  private container: HTMLElement;
  private onLogoutCallback: () => void;

  constructor(onLogout: () => void) {
    this.onLogoutCallback = onLogout;
    this.container = document.createElement('div');
    this.container.className = 'main-content';
    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public onMounted() {
    focusManager.focus('setting-engine-btn');
  }

  public render() {
    const serverUrl = Preferences.getServerUrl();
    const user = Preferences.getUser();
    const engine = Preferences.getPlayerEngine();
    const aspect = Preferences.getAspectRatio();
    const buffer = Preferences.getBufferMb();

    this.container.innerHTML = `
      <div style="padding: 48px 64px 20px 64px; display: flex; align-items: center; margin-right: 16px;">
        <div class="shelf-pill" style="height: 32px; width: 8px;"></div>
        <h1 style="font-size: 32px; font-weight: 900; color: #ffffff;">Настройки SkyCine</h1>
      </div>

      <div style="padding: 20px 64px 80px 64px; max-width: 960px; display: flex; flex-direction: column; margin-right: 24px;">
        
        <!-- Player Engine Setting -->
        <div style="background: #0d111a; border: 2px solid rgba(30,41,59,0.8); border-radius: 20px; padding: 24px 32px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 18px; font-weight: 800; color: #ffffff;">Движок воспроизведения</div>
            <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
              Samsung AVPlay использует аппаратный декодер телевизора (0% нагрузки на процессор)
            </div>
          </div>
          <button 
            type="button" 
            class="tv-btn tv-btn-secondary" 
            data-tv-focus="true" 
            data-focus-id="setting-engine-btn"
            tabindex="0"
          >
            <span id="setting-engine-val">${engine === 'avplay' ? 'Samsung AVPlay (Аппаратный)' : 'HTML5 Video'}</span>
          </button>
        </div>

        <!-- Default Aspect Ratio Setting -->
        <div style="background: #0d111a; border: 2px solid rgba(30,41,59,0.8); border-radius: 20px; padding: 24px 32px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 18px; font-weight: 800; color: #ffffff;">Масштаб кадра по умолчанию</div>
            <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
              Режим отображения соотношения сторон видео
            </div>
          </div>
          <button 
            type="button" 
            class="tv-btn tv-btn-secondary" 
            data-tv-focus="true" 
            data-focus-id="setting-aspect-btn"
            tabindex="0"
          >
            <span id="setting-aspect-val">${aspect === 'FIT' ? 'Вписать в экран' : aspect === 'ZOOM' ? 'Обрезать поля' : 'Растянуть'}</span>
          </button>
        </div>

        <!-- Buffering Size Setting -->
        <div style="background: #0d111a; border: 2px solid rgba(30,41,59,0.8); border-radius: 20px; padding: 24px 32px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 18px; font-weight: 800; color: #ffffff;">Буфер предзагрузки видео</div>
            <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
              Объем оперативной памяти телевизора под кэширование
            </div>
          </div>
          <button 
            type="button" 
            class="tv-btn tv-btn-secondary" 
            data-tv-focus="true" 
            data-focus-id="setting-buffer-btn"
            tabindex="0"
          >
            <span id="setting-buffer-val">${buffer} МБ</span>
          </button>
        </div>

        <!-- Server URL Info -->
        <div style="background: #0d111a; border: 2px solid rgba(30,41,59,0.8); border-radius: 20px; padding: 24px 32px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 18px; font-weight: 800; color: #ffffff;">Подключенный сервер SkyCine</div>
            <div style="font-size: 14px; font-family: monospace; color: #e5a93c; font-weight: 800; margin-top: 4px;">
              ${serverUrl}
            </div>
          </div>
          ${
            user
              ? `<div style="font-size: 14px; color: #94a3b8; font-weight: 700;">Пользователь: <span style="color: #ffffff; font-weight: 900;">${user.username}</span></div>`
              : ''
          }
        </div>

        <!-- App Info Banner -->
        <div style="background: rgba(229,169,60,0.08); border: 2px solid rgba(229,169,60,0.3); border-radius: 20px; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 16px; font-weight: 900; color: #ffffff;">SkyCine Cinema TV Client</div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Нативная архитектура Tizen 5.0+ &bull; Версия 1.0.4</div>
          </div>
          <div style="font-size: 13px; font-weight: 800; color: #e5a93c;">60 FPS Direct Engine</div>
        </div>

        <!-- Logout Button -->
        <button 
          type="button" 
          class="tv-btn tv-btn-danger" 
          data-tv-focus="true" 
          data-focus-id="setting-logout-btn"
          tabindex="0"
          style="height: 56px; font-size: 16px;"
        >
          ${Icons.logout(20, '#f87171')}
          <span>Выйти из аккаунта</span>
        </button>

      </div>
    `;

    // Engine toggle
    const engineBtn = this.container.querySelector('[data-focus-id="setting-engine-btn"]');
    if (engineBtn) {
      engineBtn.addEventListener('click', () => {
        const cur = Preferences.getPlayerEngine();
        const next = cur === 'avplay' ? 'html5' : 'avplay';
        Preferences.setPlayerEngine(next);
        const val = this.container.querySelector('#setting-engine-val');
        if (val) val.textContent = next === 'avplay' ? 'Samsung AVPlay (Аппаратный)' : 'HTML5 Video';
      });
    }

    // Aspect toggle
    const aspectBtn = this.container.querySelector('[data-focus-id="setting-aspect-btn"]');
    if (aspectBtn) {
      aspectBtn.addEventListener('click', () => {
        const cur = Preferences.getAspectRatio();
        const next = cur === 'FIT' ? 'ZOOM' : cur === 'ZOOM' ? 'STRETCH' : 'FIT';
        Preferences.setAspectRatio(next);
        const val = this.container.querySelector('#setting-aspect-val');
        if (val) val.textContent = next === 'FIT' ? 'Вписать в экран' : next === 'ZOOM' ? 'Обрезать поля' : 'Растянуть';
      });
    }

    // Buffer toggle
    const bufferBtn = this.container.querySelector('[data-focus-id="setting-buffer-btn"]');
    if (bufferBtn) {
      bufferBtn.addEventListener('click', () => {
        const cur = Preferences.getBufferMb();
        const next = cur === 25 ? 50 : cur === 50 ? 100 : 25;
        Preferences.setBufferMb(next);
        const val = this.container.querySelector('#setting-buffer-val');
        if (val) val.textContent = `${next} МБ`;
      });
    }

    // Logout
    const logoutBtn = this.container.querySelector('[data-focus-id="setting-logout-btn"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.onLogoutCallback();
      });
    }
  }
}
