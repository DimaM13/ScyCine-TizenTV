// Native Cinema TV Watch Together Rooms Screen

import { SkyCineApi } from '../../api/client';
import { focusManager } from '../../tizen/focusManager';
import { Icons } from '../icons';

export class RoomsPage {
  private container: HTMLElement;
  private onJoinRoomCallback: (roomCode: string) => void;

  constructor(onJoinRoom: (roomCode: string) => void) {
    this.onJoinRoomCallback = onJoinRoom;
    this.container = document.createElement('div');
    this.container.className = 'main-content';

    this.render();
    this.loadRooms();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  private async loadRooms() {
    try {
      const rooms = await SkyCineApi.getRooms();
      const mount = this.container.querySelector('#rooms-list-mount');
      if (!mount) return;

      mount.innerHTML = '';
      if (rooms.length === 0) {
        mount.innerHTML = `
          <div style="padding: 60px; text-align: center; color: #64748b; font-size: 16px; font-weight: 700; background: #0d111a; border-radius: 20px; border: 2px solid rgba(30,41,59,0.8);">
            Сейчас нет активных комнат совместного просмотра.<br>Создайте комнату в веб-клиенте SkyCine.
          </div>
        `;
        return;
      }

      rooms.forEach((room: any) => {
        const item = document.createElement('div');
        item.className = 'room-card';
        item.setAttribute('data-tv-focus', 'true');
        item.setAttribute('data-focus-id', `room-${room.code}`);
        item.setAttribute('tabindex', '0');
        item.style.cssText = `
          background: #0d111a;
          border: 2px solid rgba(30,41,59,0.8);
          border-radius: 20px;
          padding: 24px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          margin-bottom: 16px;
        `;

        item.innerHTML = `
          <div>
            <div style="font-size: 20px; font-weight: 900; color: #ffffff;">Комната: ${room.code}</div>
            <div style="font-size: 14px; color: #e5a93c; font-weight: 700; margin-top: 4px;">
              ${room.mediaTitle || 'Медиапоток'} &bull; Участников: ${room.participantsCount || 1}
            </div>
          </div>
          <button type="button" class="tv-btn tv-btn-primary" style="height: 48px; padding: 0 24px; font-size: 14px;">
            Войти в комнату
          </button>
        `;

        item.addEventListener('click', () => {
          this.onJoinRoomCallback(room.code);
        });

        mount.appendChild(item);
      });

      // Auto focus first room
      setTimeout(() => {
        const first = mount.querySelector('[data-tv-focus="true"]') as HTMLElement;
        if (first) focusManager.focus(first);
      }, 100);

    } catch (e) {
      console.error('[RoomsPage] Error loading rooms:', e);
    }
  }

  public render() {
    this.container.innerHTML = `
      <div style="padding: 48px 64px 20px 64px; display: flex; align-items: center; margin-right: 16px;">
        <div class="shelf-pill" style="height: 32px; width: 8px;"></div>
        <h1 style="font-size: 32px; font-weight: 900; color: #ffffff;">Смотреть вместе</h1>
      </div>

      <div style="padding: 20px 64px 80px 64px; max-width: 900px;">
        <div id="rooms-list-mount">
          <div style="color: #94a3b8; font-size: 16px; font-weight: 700;">Поиск активных комнат...</div>
        </div>
      </div>
    `;
  }
}
