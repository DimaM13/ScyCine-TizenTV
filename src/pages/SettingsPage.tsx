import React, { useState, useEffect } from 'react';
import { Preferences } from '../storage/preferences';
import { TVButton } from '../components/common/TVButton';
import { VirtualKeyboard } from '../components/common/VirtualKeyboard';
import { spatialNav } from '../tizen/spatialNavigation';
import { Save, LogOut, CheckCircle, Cpu, Maximize, Database } from 'lucide-react';

interface SettingsPageProps {
  onLogout: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onLogout }) => {
  const [serverUrl, setServerUrl] = useState(Preferences.getServerUrl());
  const [engine, setEngine] = useState<'avplay' | 'html5'>(Preferences.getPlayerEngine());
  const [aspect, setAspect] = useState<'FIT' | 'STRETCH' | 'ZOOM'>(Preferences.getAspectRatio());
  const [bufferMb, setBufferMb] = useState<number>(Preferences.getBufferMb());
  const [saved, setSaved] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);

  const user = Preferences.getUser();

  // Return key exits URL edit mode if active
  useEffect(() => {
    if (editingUrl) {
      const handleBack = () => {
        setEditingUrl(false);
        return true;
      };
      spatialNav.pushBackHandler(handleBack);
      return () => spatialNav.popBackHandler(handleBack);
    }
  }, [editingUrl]);

  const handleSave = () => {
    Preferences.setServerUrl(serverUrl);
    Preferences.setPlayerEngine(engine);
    Preferences.setAspectRatio(aspect);
    Preferences.setBufferMb(bufferMb);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-cinema-950 p-12 flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-black text-white">Настройки SkyCine TV</h1>
        <p className="text-sm text-slate-400 mt-1">
          Конфигурация аппаратного плеера Samsung Tizen и сервера
        </p>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start">
        <div className="col-span-7 flex flex-col gap-6">
          {/* Server URL Field as Focusable Button */}
          <div className="bg-cinema-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-cinema-gold" />
              <span>Адрес сервера SkyCine</span>
            </h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-tv-focus="true"
                data-focus-id="setting-url-input"
                onClick={() => setEditingUrl(true)}
                className={`flex-1 h-12 bg-cinema-850 border rounded-xl px-4 flex items-center text-sm font-mono text-left cursor-pointer transition-all ${
                  editingUrl ? 'border-cinema-gold text-cinema-gold ring-1 ring-cinema-gold shadow-gold-glow' : 'border-slate-700 text-white'
                }`}
              >
                {serverUrl}
                {editingUrl && <span className="animate-pulse ml-1 text-cinema-gold font-bold">|</span>}
              </button>
              <TVButton
                id="setting-save-btn"
                variant="primary"
                onClick={handleSave}
                icon={saved ? <CheckCircle className="w-5 h-5 text-slate-950" /> : <Save className="w-5 h-5" />}
              >
                {saved ? 'Сохранено!' : 'Сохранить'}
              </TVButton>
            </div>

            {/* Quick helper buttons when editing */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                data-tv-focus="true"
                data-focus-id="quick-prefix"
                onClick={() => {
                  setEditingUrl(true);
                  setServerUrl((prev) => (prev.startsWith('http://') ? prev : `http://${prev}`));
                }}
                className="px-2.5 py-1 rounded bg-cinema-800 hover:bg-cinema-700 text-xs font-mono text-slate-300 border border-slate-700"
              >
                http://
              </button>
              <button
                type="button"
                data-tv-focus="true"
                data-focus-id="quick-192"
                onClick={() => {
                  setEditingUrl(true);
                  setServerUrl((prev) => `${prev}192.168.`);
                }}
                className="px-2.5 py-1 rounded bg-cinema-800 hover:bg-cinema-700 text-xs font-mono text-slate-300 border border-slate-700"
              >
                192.168.
              </button>
              <button
                type="button"
                data-tv-focus="true"
                data-focus-id="quick-port"
                onClick={() => {
                  setEditingUrl(true);
                  setServerUrl((prev) => `${prev}:3000`);
                }}
                className="px-2.5 py-1 rounded bg-cinema-800 hover:bg-cinema-700 text-xs font-mono text-slate-300 border border-slate-700"
              >
                :3000
              </button>
              <button
                type="button"
                data-tv-focus="true"
                data-focus-id="quick-reset"
                onClick={() => {
                  setEditingUrl(true);
                  setServerUrl('http://192.168.0.100:3000');
                }}
                className="px-2.5 py-1 rounded bg-cinema-800 hover:bg-cinema-700 text-xs font-mono text-cinema-gold border border-cinema-gold/30"
              >
                Сброс (192.168.0.100:3000)
              </button>
            </div>
          </div>

          {/* Player Engine */}
          <div className="bg-cinema-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cinema-gold" />
              <span>Движок воспроизведения видео</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                data-tv-focus="true"
                data-focus-id="engine-avplay"
                onClick={() => setEngine('avplay')}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                  engine === 'avplay'
                    ? 'bg-cinema-gold/15 border-cinema-gold text-cinema-gold font-bold shadow-gold-glow'
                    : 'bg-cinema-850 border-slate-800 text-slate-300'
                }`}
              >
                <div className="text-sm font-bold">Samsung AVPlay Hardware (Рекомендуется)</div>
                <div className="text-xs text-slate-400 mt-1">
                  Нативный аппаратный чипсет Samsung Smart TV • 4K/HDR Zero-Copy
                </div>
              </button>

              <button
                type="button"
                data-tv-focus="true"
                data-focus-id="engine-html5"
                onClick={() => setEngine('html5')}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                  engine === 'html5'
                    ? 'bg-cinema-gold/15 border-cinema-gold text-cinema-gold font-bold shadow-gold-glow'
                    : 'bg-cinema-850 border-slate-800 text-slate-300'
                }`}
              >
                <div className="text-sm font-bold">HTML5 Video Player</div>
                <div className="text-xs text-slate-400 mt-1">
                  Резервный программный веб-плеер
                </div>
              </button>
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="bg-cinema-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Maximize className="w-5 h-5 text-cinema-gold" />
              <span>Масштабирование кадра (Соотношение сторон)</span>
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'FIT', label: 'Вписать (FIT)', desc: 'Оригинал с черными полосами (4:3, 16:9, 21:9)' },
                { id: 'ZOOM', label: 'Обрезать (ZOOM)', desc: 'Заполнение экрана без искажения' },
                { id: 'STRETCH', label: 'Растянуть (STRETCH)', desc: 'Растянуть на весь экран 16:9' }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-tv-focus="true"
                  data-focus-id={`aspect-${item.id}`}
                  onClick={() => setAspect(item.id as any)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    aspect === item.id
                      ? 'bg-cinema-gold/15 border-cinema-gold text-cinema-gold font-bold shadow-gold-glow'
                      : 'bg-cinema-850 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">{item.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* User Account & Logout */}
          <div className="bg-cinema-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase">Текущий пользователь</span>
              <h4 className="text-lg font-bold text-white">{user ? user.username : 'Не авторизован'}</h4>
              <p className="text-xs text-cinema-gold font-semibold">Роль: {user?.role || 'Гость'}</p>
            </div>
            <TVButton
              id="settings-logout-btn"
              variant="danger"
              onClick={onLogout}
              icon={<LogOut className="w-5 h-5" />}
            >
              Выйти из аккаунта
            </TVButton>
          </div>
        </div>

        {/* Right Column: Virtual Keyboard when editing Server URL */}
        <div className="col-span-5">
          {editingUrl && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cinema-gold uppercase">
                  Клавиатура для адреса сервера
                </span>
                <button
                  type="button"
                  onClick={() => setEditingUrl(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Закрыть ввод ✕
                </button>
              </div>
              <VirtualKeyboard
                onKeyPress={(c) => setServerUrl((prev) => prev + c)}
                onBackspace={() => setServerUrl((prev) => prev.slice(0, -1))}
                onClear={() => setServerUrl('')}
                onSubmit={() => {
                  handleSave();
                  setEditingUrl(false);
                }}
                submitLabel="Сохранить"
                defaultLang="EN"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
