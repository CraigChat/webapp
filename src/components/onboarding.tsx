import { Icon } from '@iconify/react';
import backIcon from '@iconify-icons/bi/arrow-left-short';
import monitorIcon from '@iconify-icons/bi/card-checklist';
import recordIcon from '@iconify-icons/bi/mic-fill';
import clsx from 'clsx';
import { useEffect, useState } from 'preact/compat';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';

import { useSyncedState } from '../util';
import { Recording } from '../util/api';
import { start } from '../util/audio';
import { connectMonitor } from '../util/audio/net';
import { setUseNR } from '../util/audio/processing';
import { RecorderState, useRecorder } from '../util/recorder';
import Button from './common/button';
import ChannelIcon from './common/channelIcon';
import { Input } from './common/input';
import Panel from './common/panel';
import RadioButtons, { RadioButton } from './common/radioButtons';
import Spinner from './common/spinner';
import Toggle from './common/toggle';
import { servers } from './login';
import { RequestMicrophone } from './requestMicrophone';

interface OnboardingPanelProps {
  recording: Recording;
  server: string;
  hasConnected: boolean;
  onBack: () => void;
  setAttributes: (connectionType: string, nickname: string, flac: boolean, continuous: boolean, noiseSuppression: boolean) => void;
  onDisconnect: (arg0: CloseEvent) => void;
}

// const modes: RadioButton[] = [
//   { icon: recordIcon, name: 'Record', value: 'record', description: 'Join the recording session as a user' },
//   { icon: monitorIcon, name: 'Monitor', value: 'monitor', description: 'Check when people are being recorded' }
// ];
const modes: RadioButton[] = [
  {
    icon: recordIcon,
    name: (t) => t('onboarding.record'),
    value: 'record',
    description: (t) => t('onboarding.recordDesc')
  },
  {
    icon: monitorIcon,
    name: (t) => t('onboarding.monitor'),
    value: 'monitor',
    description: (t) => t('onboarding.monitorDesc')
  }
];

export function OnboardingPanel({ recording, server, hasConnected, onBack, setAttributes, onDisconnect }: OnboardingPanelProps) {
  const { t } = useTranslation();
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [nickname, setNickname] = useSyncedState('', 'craigWebapp.nickname');
  const [flac, setFlac] = useSyncedState(false, 'craigWebapp.flac');
  const [continuous, setContinuous] = useSyncedState(false, 'craigWebapp.continuous');
  const [noiseSuppression, setNoiseSuppression] = useSyncedState(false, 'craigWebapp.noiseSuppression');
  const [mode, setMode] = useState(modes[0]);

  const recorder = useRecorder();
  let recorderDiv: JSX.Element | null = null;
  if (recorder.state === RecorderState.REQUESTING_PERMISSION) {
    recorderDiv = <p>{t('onboarding.requesting')}</p>;
  } else if (recorder.state === RecorderState.ERROR) {
    if (recorder.error && (recorder.error.message === 'Permission denied' || recorder.error.message === 'Permission dismissed')) {
      recorderDiv = <RequestMicrophone />;
    } else {
      recorderDiv = (
        <span class="p-2 border-2 bg-opacity-25 rounded-md border-red-500 bg-red-500">
          <b>{t('onboarding.errors.audioPerm')}:</b> {recorder.error?.toString()}
        </span>
      );
    }
  }

  async function startConnecting() {
    if (isLoading) return;

    if (!nickname || nickname.length > 32) return void setError(t('onboarding.errors.badNick'));

    const url = servers.find((s) => s.value === server)?.wsUrl;
    if (!url) return void setError(t('onboarding.errors.badServer'));

    setLoading(true);
    setError('');
    setAttributes(mode.value, nickname, flac, continuous, noiseSuppression);

    if (mode.value === 'record') {
      await start({
        url,
        username: nickname,
        continuous,
        flac,
        token: recording.connectionToken,
        onDisconnect
      });
    } else {
      await connectMonitor({
        url,
        username: nickname,
        continuous,
        flac,
        token: recording.connectionToken,
        onDisconnect
      });
    }
  }

  useEffect(() => {
    if (hasConnected) setLoading(false);
  }, [hasConnected]);
  useEffect(() => setUseNR(noiseSuppression), [noiseSuppression]);

  return (
    <Panel sidePanel>
      {/* @ts-ignore */}
      <Helmet>
        <title>
          {this.state.recording.channelName} / {this.state.recording.serverName} — {t('craigWebapp')}
        </title>
      </Helmet>
      <div className="flex flex-col justify-center items-center relative bg-black bg-opacity-20 self-stretch w-full sm:w-48 flex-none p-3 gap-4 font-body">
        {recording.serverIcon ? <img src={recording.serverIcon} class="w-16 h-16 rounded-full" /> : ''}
        <div class="flex sm:flex-col justify-center items-center font-medium gap-2 sm:gap-0 w-full overflow-hidden">
          <span class="opacity-50">{t('onboarding.joining')}</span>
          <span class="sm:text-xl flex justify-center items-center gap-2 sm:w-full overflow-hidden">
            <ChannelIcon type={recording.channelType} className="inline w-5 h-5 flex-none" />
            <span class="whitespace-nowrap sm:whitespace-normal max-w-full text-ellipsis overflow-hidden">{recording.channelName}</span>
          </span>
          <span class="opacity-50">{t('in')}</span>
          <span class="whitespace-nowrap sm:whitespace-normal sm:text-lg max-w-full text-ellipsis overflow-hidden text-center">
            {recording.serverName}
          </span>
        </div>
        <button
          class="flex items-center justify-center pr-2 rounded opacity-50 hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:opacity-75"
          onClick={onBack}
        >
          <Icon icon={backIcon} className="w-6 h-6" />
          <span>{t('back')}</span>
        </button>
      </div>
      <div className="flex flex-col justify-center items-center w-full p-6 gap-8">
        <Input
          label={t('onboarding.nickLabel')}
          placeholder={t('onboarding.nickPlaceholder')}
          disabled={isLoading}
          value={nickname}
          setValue={setNickname}
          big
          maxLength={32}
        />
        <RadioButtons disabled={isLoading} items={modes} className="w-full" selected={mode} onSelect={setMode} />
        {mode.value === 'record' ? recorderDiv : ''}
        <div class={clsx('flex flex-col gap-2 w-full', mode.value === 'monitor' ? 'hidden' : '')}>
          <Toggle
            label={t('options.flac.title')}
            description={t('options.flac.desc')}
            checked={recording.flacEnabled ? flac : false}
            tooltip={recording.flacEnabled ? '' : t('options.flac.disabled')}
            disabled={!recording.flacEnabled || isLoading}
            onToggle={setFlac}
          />
          <Toggle
            label={t('options.continuous.title')}
            description={t('options.continuous.desc')}
            checked={recording.continuousEnabled ? continuous : false}
            tooltip={recording.continuousEnabled ? '' : t('options.continuous.disabled')}
            disabled={!recording.continuousEnabled || isLoading}
            onToggle={setContinuous}
          />
          <Toggle
            label={t('options.nr.title')}
            description={t('options.nr.desc')}
            checked={noiseSuppression}
            disabled={isLoading}
            onToggle={setNoiseSuppression}
          />
        </div>
        <div class="flex flex-col gap-2 items-center">
          {error ? <span class="text-red-500">{error}</span> : ''}
          <Button
            disabled={isLoading || (mode.value === 'record' ? recorder.state !== RecorderState.READY : false)}
            type="brand"
            className="w-fit"
            onClick={startConnecting}
          >
            {isLoading ? <Spinner /> : t('onboarding.join')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
