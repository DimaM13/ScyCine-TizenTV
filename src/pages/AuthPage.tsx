import React, { useState } from 'react';
import { SkyCineApi } from '../api/client';
import { Preferences } from '../storage/preferences';
import { TVButton } from '../components/common/TVButton';
import { VirtualKeyboard } from '../components/common/VirtualKeyboard';
import { Clapperboard, LogIn, Settings as SettingsIcon, CheckCircle } from 'lucide-react';

interface AuthPageProps {
  onSuccess: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('SkyLight');
  const [password, setPassword] = useState('');
  const [activeField, setActiveField] = useState<'user' | 'pass' | 'server'>('user');
  const [serverUrl, setServerUrl] = useState(Preferences.getServerUrl());
  const [showServerModal, setShowServerModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedUrl, setSavedUrl] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Введите имя пользователя и пароль');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await SkyCineApi.login(username, password);
      Preferences.setToken(res.token);
      Preferences.setUser(res.user);
      onSuccess();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Неверный логин или пароль (проверьте также адрес сервера)');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (char: string) => {
    if (activeField === 'server') {
      setServerUrl(serverUrl + char);
    } else if (activeField === 'user') {
      setUsername(username + char);
    } else {
      setPassword(password + char);
    }
  };

  const handleBackspace = () => {
    if (activeField === 'server') {
      setServerUrl(serverUrl.slice(0, -1));
    } else if (activeField === 'user') {
      setUsername(username.slice(0, -1));
    } else {
      setPassword(password.slice(0, -1));
    }
  };

  const handleSaveServer = () => {
    Preferences.setServerUrl(serverUrl);
    setSavedUrl(true);
    setTimeout(() => {
      setSavedUrl(false);
      setShowServerModal(false);
      setActiveField('user');
    }, 1500);
  };

  return (
    <div className="w-screen h-screen bg-cinema-950 flex items-center justify-center p-12 select-none">
      <div className="grid grid-cols-12 gap-10 w-full max-w-5xl items-center">
        {/* Left: Login Form */}
        <div className="col-span-5 bg-cinema-900 border border-slate-800 rounded-3xl p-8 flex flex-col gap-5 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cinema-gold flex items-center justify-center shadow-gold-glow">
              <Clapperboard className="w-7 h-7 text-slate-950 fill-slate-950" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">SKYCINE</h2>
              <p className="text-[10px] font-bold text-cinema-gold uppercase tracking-wider">
                Samsung Tizen OS Smart TV
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500 text-red-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Input Fields */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold text-slate-400 mb-1 block">Имя пользователя</label>
              <div
                data-tv-focus="true"
                data-focus-id="auth-user-input"
                onClick={() => setActiveField('user')}
                className={`h-12 bg-cinema-850 border rounded-xl px-4 flex items-center text-sm font-semibold text-white cursor-pointer ${
                  activeField === 'user' ? 'border-cinema-gold shadow-gold-glow' : 'border-slate-700'
                }`}
              >
                {username || <span className="text-slate-500">Введите логин...</span>}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 mb-1 block">Пароль</label>
              <div
                data-tv-focus="true"
                data-focus-id="auth-pass-input"
                onClick={() => setActiveField('pass')}
                className={`h-12 bg-cinema-850 border rounded-xl px-4 flex items-center text-sm font-semibold text-white cursor-pointer ${
                  activeField === 'pass' ? 'border-cinema-gold shadow-gold-glow' : 'border-slate-700'
                }`}
              >
                {password ? '••••••••' : <span className="text-slate-500">Введите пароль...</span>}
              </div>
            </div>

            {/* Server URL Display with Quick Config button */}
            <div className="pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Сервер: <strong className="text-slate-200">{Preferences.getServerUrl()}</strong></span>
              </div>
              <TVButton
                id="auth-server-btn"
                variant="secondary"
                onClick={() => {
                  setShowServerModal(true);
                  setActiveField('server');
                }}
                icon={<SettingsIcon className="w-4 h-4" />}
                className="w-full py-2 text-xs"
              >
                Настроить адрес сервера
              </TVButton>
            </div>
          </div>

          <TVButton
            id="auth-submit-btn"
            variant="primary"
            onClick={handleLogin}
            disabled={loading}
            icon={<LogIn className="w-5 h-5 fill-slate-950" />}
            className="h-12 text-base mt-2"
          >
            {loading ? 'Вход...' : 'Войти в SkyCine'}
          </TVButton>
        </div>

        {/* Right: Virtual Keyboard */}
        <div className="col-span-7">
          <VirtualKeyboard
            onKeyPress={handleKeyPress}
            onBackspace={handleBackspace}
            onClear={() => {
              if (activeField === 'server') setServerUrl('');
              else if (activeField === 'user') setUsername('');
              else setPassword('');
            }}
            onSubmit={showServerModal ? handleSaveServer : handleLogin}
          />
        </div>
      </div>

      {/* Server Config Modal */}
      {showServerModal && (
        <div className="tizen-modal-active fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-8">
          <div className="bg-cinema-900 border border-slate-700 rounded-3xl p-6 max-w-lg w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Адрес сервера SkyCine</h3>
            <p className="text-xs text-slate-400">
              Укажите IP-адрес компьютера с сервером (например http://192.168.0.100:3000)
            </p>

            <div className="h-12 bg-cinema-850 border-2 border-cinema-gold rounded-xl px-4 flex items-center font-mono text-sm text-cinema-gold">
              {serverUrl}
            </div>

            <div className="flex gap-3 pt-2">
              <TVButton
                id="modal-save-server"
                variant="primary"
                onClick={handleSaveServer}
                icon={savedUrl ? <CheckCircle className="w-5 h-5" /> : undefined}
                className="flex-1"
              >
                {savedUrl ? 'Сохранено!' : 'Сохранить адрес'}
              </TVButton>
              <TVButton
                id="modal-cancel-server"
                variant="ghost"
                onClick={() => {
                  setShowServerModal(false);
                  setActiveField('user');
                }}
              >
                Закрыть
              </TVButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
