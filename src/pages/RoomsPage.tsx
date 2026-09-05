import React, { useState, useEffect } from 'react';
import { SkyCineApi } from '../api/client';
import { TVButton } from '../components/common/TVButton';
import { VirtualKeyboard } from '../components/common/VirtualKeyboard';
import { Users, LogIn, RefreshCw } from 'lucide-react';

interface RoomsPageProps {
  onJoinRoom: (roomCode: string) => void;
}

export const RoomsPage: React.FC<RoomsPageProps> = ({ onJoinRoom }) => {
  const [roomCode, setRoomCode] = useState('');
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRooms = () => {
    setLoading(true);
    SkyCineApi.getRooms()
      .then(setRooms)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleKeyPress = (char: string) => {
    if (roomCode.length < 8) {
      setRoomCode(roomCode + char.toUpperCase());
    }
  };

  const handleBackspace = () => {
    setRoomCode(roomCode.slice(0, -1));
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-cinema-950 p-12 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Смотреть вместе</h1>
          <p className="text-sm text-slate-400 mt-1">
            Синхронный просмотр фильмов и сериалов с друзьями на телевизоре
          </p>
        </div>
        <TVButton
          id="refresh-rooms-btn"
          variant="secondary"
          onClick={fetchRooms}
          icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
        >
          Обновить
        </TVButton>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start">
        {/* Left Column: Code Input & Keyboard */}
        <div className="col-span-6 flex flex-col gap-4">
          <div className="bg-cinema-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
            <h3 className="text-base font-bold text-white">Введите код комнаты</h3>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-14 bg-cinema-850 border-2 border-cinema-gold rounded-xl flex items-center justify-center text-2xl font-mono font-black text-cinema-gold tracking-widest">
                {roomCode || '______'}
              </div>
              <TVButton
                id="join-room-btn"
                variant="primary"
                onClick={() => roomCode && onJoinRoom(roomCode)}
                disabled={!roomCode}
                icon={<LogIn className="w-5 h-5 fill-slate-950" />}
                className="h-14 px-8"
              >
                Войти
              </TVButton>
            </div>
          </div>

          <VirtualKeyboard
            onKeyPress={handleKeyPress}
            onBackspace={handleBackspace}
            onClear={() => setRoomCode('')}
            onSubmit={() => roomCode && onJoinRoom(roomCode)}
          />
        </div>

        {/* Right Column: Active Rooms */}
        <div className="col-span-6 flex flex-col gap-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cinema-gold" />
            <span>Активные комнаты ({rooms.length})</span>
          </h3>

          {rooms.length === 0 ? (
            <div className="h-48 bg-cinema-900/50 border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 p-6 text-center">
              <p className="text-sm font-semibold">Нет открытых комнат</p>
              <p className="text-xs text-slate-600 mt-1">
                Создайте комнату на сайте или введите код приглашения слева
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[540px] overflow-y-auto pr-1">
              {rooms.map((room) => (
                <div
                  key={room.code}
                  data-tv-focus="true"
                  data-focus-id={`room-item-${room.code}`}
                  onClick={() => onJoinRoom(room.code)}
                  className="p-4 rounded-xl bg-cinema-900 border border-slate-800 hover:border-cinema-gold flex items-center justify-between cursor-pointer group"
                >
                  <div>
                    <h4 className="font-bold text-white group-hover:text-cinema-gold">{room.name || `Комната ${room.code}`}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Код: <span className="font-mono text-cinema-gold font-bold">{room.code}</span> • Участников: {room.participantsCount || 1}
                    </p>
                  </div>
                  <TVButton variant="secondary" className="text-xs py-2">
                    Подключиться
                  </TVButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
