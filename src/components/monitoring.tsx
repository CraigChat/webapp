import { Icon } from '@iconify/react';
import micIcon from '@iconify-icons/bi/mic-fill';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

import { AppUser } from '../app';
import { Recording } from '../util/api';
import Panel from './common/panel';
import { PanelHeader } from './common/panelHeader';

interface MonitoringPanelProps {
  recording: Recording;
  users: AppUser[];
  usersSpeaking: { [id: number]: boolean };
}

export function MonitoringPanel({ recording, users, usersSpeaking }: MonitoringPanelProps) {
  const { t } = useTranslation();

  return (
    <Panel sandwich>
      <PanelHeader recording={recording} />
      <div class="flex flex-col justify-center items-center p-6 gap-4 w-full">
        {users.length > 0 ? (
          users.map((user) => {
            const discrim = user.nick.split('#').reverse()[0];
            const username = user.nick.slice(0, -discrim.length - 1);

            return (
              <div
                key={user.id}
                class={clsx(
                  'flex items-center w-full gap-2 p-3 rounded transition-colors bg-opacity-60',
                  usersSpeaking[user.id] ? 'bg-green-500' : ''
                )}
              >
                {user.avatar ? (
                  <img src={user.avatar} class="w-12 h-12 rounded-full shadow" />
                ) : (
                  <div class="rounded-full shadow p-3 transition-colors bg-zinc-600">
                    <Icon icon={micIcon} className="w-6 h-6" />
                  </div>
                )}
                <span class="sm:text-xl">
                  <span class="font-medium">{username}</span>
                  <span class={clsx('transition-opacity', usersSpeaking[user.id] ? 'opacity-75' : 'opacity-50')}>
                    {discrim === 'web' ? ` ${t('rec.viaWeb')}` : `#${discrim}`}
                  </span>
                </span>
              </div>
            );
          })
        ) : (
          <span class="font-medium opacity-75">{t('rec.noUsersConnected')}</span>
        )}
      </div>
    </Panel>
  );
}
