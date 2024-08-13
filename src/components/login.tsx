import { useEffect, useState } from 'preact/compat';
import { useTranslation } from 'react-i18next';

import { logger } from '../app';
import { getRecording, Recording } from '../util/api';
import Button from './common/button';
import Dropdown, { DropdownItem } from './common/dropdown';
import { Input } from './common/input';
import LinkButton from './common/linkButton';
import Panel from './common/panel';
import Spinner from './common/spinner';

export const servers: DropdownItem[] = [
  {
    title: 'Craig / Alistair',
    value: 'craig',
    url: 'https://craig-ws.craig.horse',
    wsUrl: 'wss://craig-ws.craig.horse'
  },
  {
    title: 'Giarc',
    value: 'giarc',
    url: 'https://giarc.craig.media',
    wsUrl: 'wss://giarc.craig.media'
  }
];

// Add local server if on localhost
if (location.hostname === 'localhost')
  servers.unshift({
    title: (t) => t('server.local'),
    value: 'local',
    url: 'http://localhost:9001',
    wsUrl: 'ws://localhost:9001'
  });

// Add custom server if set
if (location.search.includes('custom=')) {
  const domain = new URLSearchParams(location.search).get('custom');
  if (domain)
    servers.unshift({
      title: (t) => `${t('server.custom')} (${domain})`,
      value: 'custom',
      url: `https://${domain}`,
      wsUrl: `wss://${domain}`
    });
}

interface LoginPanelProps {
  recordingId?: string;
  ennuiKey?: string;
  server?: string;
  autoLogin?: boolean;
  loginAttempted?: boolean;
  setLoginAttempted: (v: boolean) => void;
  setRecording: (recording: Recording, server: string) => void;
}

export function LoginPanel({
  recordingId: defaultRecordingId,
  ennuiKey: defaultEnnuiKey,
  server: defaultServer,
  autoLogin,
  loginAttempted,
  setLoginAttempted,
  setRecording
}: LoginPanelProps) {
  const { t } = useTranslation();
  const [recordingId, setRecordingId] = useState(defaultRecordingId || '');
  const [ennuiKey, setEnnuiKey] = useState(defaultEnnuiKey || '');
  const [server, setServer] = useState(servers.find((s) => s.value === defaultServer) || servers[0]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  async function onLogin() {
    if (isLoading) return;
    setLoginAttempted(true);

    if (!recordingId) return void setError(t('login.errors.noID'));
    if (!ennuiKey) return void setError(t('login.errors.noKey'));

    setLoading(true);
    setError('');

    try {
      const recording = await getRecording(server.url, recordingId, ennuiKey);
      logger.log('Recording found', recording);
      setLoading(false);
      setRecording(recording, server.value);
    } catch (e) {
      logger.error('Failed to login:', e);

      if (e instanceof Response) {
        const { status, statusText } = e;
        if (status === 404) setError(t('login.errors.notFound'));
        else if (status === 401) setError(t('login.errors.invalidKey'));
        else {
          const json = await e.json().catch(() => null);
          setError(json?.error ?? `${status}: ${statusText}`);
        }
      } else setError(e.toString());
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoLogin && !loginAttempted) onLogin();
  });

  return (
    <Panel>
      <h1 class="text-3xl font-display text-center">{t('craigWebapp')}</h1>
      <div class="flex flex-col gap-4 w-full">
        <Input label={t('login.recId')} error={!!error} disabled={isLoading} maxLength={12} value={recordingId} setValue={setRecordingId} />
        <Input label={t('login.webKey')} error={!!error} disabled={isLoading} maxLength={6} value={ennuiKey} setValue={setEnnuiKey} password />
        <Dropdown disabled={isLoading} items={servers} label={t('login.server')} className="w-full" full selected={server} onSelect={setServer} />
      </div>
      <div class="flex flex-col gap-2 items-center">
        {error ? <span class="text-red-500">{error}</span> : ''}
        <Button disabled={isLoading} type="brand" className="w-fit" onClick={() => onLogin()}>
          {isLoading ? <Spinner /> : t('login.connect')}
        </Button>
      </div>
      <div class="flex gap-4 flex-wrap justify-center">
        <LinkButton name={t('login.what')} href="https://craig.chat/docs/webapp/" />
        <LinkButton name={t('login.home')} href="https://craig.chat/" />
        <LinkButton name={t('login.privacy')} href="https://craig.chat/privacy" />
        {/* <LinkButton name={t('login.tos')} href="/" /> */}
      </div>
    </Panel>
  );
}
