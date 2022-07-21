import { Icon } from '@iconify/react';
import micIcon from '@iconify-icons/bi/mic-fill';
import micMuteIcon from '@iconify-icons/bi/mic-mute-fill';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Tooltip } from 'react-tippy';

import { AppUser } from '../app';
import { useSyncedState } from '../util';
import { Recording } from '../util/api';
import { switchDevice, toggleMute } from '../util/audio';
import { setUseNR } from '../util/audio/processing';
import { setWaveformCanvas } from '../util/audio/waveform';
import { useWindowEvent } from '../util/hooks/useWindowEvent';
import Dropdown, { DropdownItem } from './common/dropdown';
import Panel from './common/panel';
import { PanelHeader } from './common/panelHeader';
import Toggle from './common/toggle';

interface RecordingPanelProps {
  recording: Recording;
  username: string;
  flac: boolean;
  continuous: boolean;
  vad: boolean;
  users: AppUser[];
  usersSpeaking: { [id: number]: boolean };
  myId: number;
  mediaReady: boolean;
  deviceId?: string;
}

export function RecordingPanel({
  recording,
  username,
  flac,
  continuous,
  vad,
  users,
  usersSpeaking,
  myId,
  mediaReady,
  deviceId
}: RecordingPanelProps) {
  const { t } = useTranslation();
  const [noiseSuppression, setNoiseSuppression] = useSyncedState(false, 'craigWebapp.noiseSuppression');
  const [mute, setMute] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement>(null);
  const [devices, setDevices] = useState<DropdownItem[]>(null);
  const [device, setDevice] = useState<DropdownItem>(null);

  const updateDevices = useCallback(async () => {
    let index = 1;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const items = devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        title: d.label || `Microphone #${index++}`,
        value: d.deviceId
      }));
    setDevices(items);
    setDevice(items.find((item) => item.value === deviceId) || items[0]);
  }, [deviceId]);

  useEffect(() => toggleMute(!mute), [mute]);
  useEffect(() => setUseNR(noiseSuppression), [noiseSuppression]);
  useEffect(() => setWaveformCanvas(canvas), [canvas]);
  useEffect(() => {
    updateDevices();
  }, [updateDevices]);

  // @ts-ignore
  useWindowEvent('devicechange', updateDevices);

  return (
    <Panel sandwich>
      <PanelHeader recording={recording} />
      <div class="flex justify-center items-center p-6 gap-4">
        {users.filter((user) => user.id !== myId).length > 0 ? (
          users
            .filter((user) => user.id !== myId)
            .map((user) => {
              const discrim = user.nick.split('#').reverse()[0];
              const username = user.nick.slice(0, -discrim.length - 1);

              const tooltip = (
                <p>
                  <span class="font-medium">{username}</span>
                  <span class="opacity-50">{discrim === 'web' ? ` ${t('rec.viaWeb')}` : `#${discrim}`}</span>
                </p>
              );

              return (
                <Tooltip key={user.id} html={tooltip}>
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      class={clsx(
                        'w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow transition-all border-green-500',
                        usersSpeaking[user.id] ? 'border-4' : ''
                      )}
                    />
                  ) : (
                    <div class={clsx('rounded-full shadow p-3 transition-colors', usersSpeaking[user.id] ? 'bg-green-500' : 'bg-zinc-600')}>
                      <Icon icon={micIcon} className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>
                  )}
                </Tooltip>
              );
            })
        ) : (
          <span class="font-medium opacity-75">{t('rec.noUsersConnected')}</span>
        )}
      </div>
      <div class="flex flex-col p-3 gap-4 items-center relative bg-black bg-opacity-20 self-stretch w-full font-body font-medium">
        <div class="flex gap-2 justify-between items-center w-full">
          <div class="flex gap-2">
            <span class="opacity-50">{t('rec.connectedAs')}</span>
            <span class="max-w-full text-ellipsis overflow-hidden">{username}</span>
          </div>
          <div class="flex gap-2">
            {flac ? <span class="bg-gradient-to-b from-amber-500 to-orange-500 text-black rounded-full px-3 py-1">FLAC</span> : null}
            {continuous ? (
              <span class="bg-gradient-to-b from-green-500 to-emerald-500 text-black rounded-full px-3 py-1">{t('rec.continuous')}</span>
            ) : null}
          </div>
        </div>
        <div class="flex gap-2 justify-between items-center w-full">
          <Tooltip title={t(`rec.${mute ? 'unmute' : 'mute'}`)} className="flex-none">
            <button
              class={clsx('rounded-full shadow p-3 sm:p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-60', {
                'bg-green-500 hover:bg-green-400': (vad || continuous) && !mute,
                'bg-green-800 hover:bg-green-700': !vad && !continuous && !mute,
                'bg-red-500 hover:bg-red-400': mute,
                'pointer-events-none opacity-50': !mediaReady
              })}
              onClick={() => setMute(!mute)}
            >
              <Icon icon={mute ? micMuteIcon : micIcon} className="w-8 h-8 sm:w-10 sm:h-10" />
            </button>
          </Tooltip>
          <canvas class="flex-1 h-16" ref={setCanvas} />
        </div>
        <Toggle label={t('options.nr.title')} className="w-full" checked={noiseSuppression} onToggle={setNoiseSuppression} />
        {devices && (
          <Dropdown
            disabled={!mediaReady}
            items={devices}
            selected={device}
            label={t('rec.microphone')}
            className="w-full"
            full
            onSelect={(device) => switchDevice(device.value, flac, continuous)}
          />
        )}
      </div>
    </Panel>
  );
}
