import React, { useEffect } from 'react';
import { AudioTrackOption } from '../../types';
import { Volume2, Check } from 'lucide-react';
import { TVButton } from '../common/TVButton';
import { spatialNav } from '../../tizen/spatialNavigation';

interface AudioDialogProps {
  tracks: AudioTrackOption[];
  onSelectTrack: (track: AudioTrackOption) => void;
  onClose: () => void;
}

export const AudioDialog: React.FC<AudioDialogProps> = ({
  tracks,
  onSelectTrack,
  onClose
}) => {
  // Focus first available track or close button when modal opens
  useEffect(() => {
    const timer = setTimeout(() => {
      spatialNav.focusFirst('.tizen-modal-active');
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="tizen-modal-active fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center select-none">
      <div className="w-[500px] bg-cinema-900 border border-slate-700 rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <Volume2 className="w-6 h-6 text-cinema-gold" />
          <h3 className="text-lg font-bold text-white">Выбор аудиодорожки</h3>
        </div>

        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
          {tracks.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              Дополнительные аудиодорожки не обнаружены
            </p>
          ) : (
            tracks.map((track) => (
              <button
                key={track.id}
                data-tv-focus="true"
                data-focus-id={`audio-track-${track.id}`}
                onClick={() => onSelectTrack(track)}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                  track.isSelected
                    ? 'bg-cinema-gold/20 border-cinema-gold text-cinema-gold font-bold shadow-gold-glow'
                    : 'bg-cinema-850 hover:bg-cinema-800 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex flex-col text-left">
                  <span className="text-sm font-semibold">{track.label}</span>
                  <span className="text-xs text-slate-400 uppercase">
                    {track.language || 'ru'} • {track.channels === 6 ? '5.1' : track.channels === 8 ? '7.1' : 'Стерео'} • {track.codec || 'AAC'}
                  </span>
                </div>
                {track.isSelected && <Check className="w-5 h-5 text-cinema-gold" />}
              </button>
            ))
          )}
        </div>

        <TVButton
          id="audio-close-btn"
          variant="secondary"
          onClick={onClose}
          className="mt-2"
        >
          Закрыть
        </TVButton>
      </div>
    </div>
  );
};
