import Panel from './common/panel';
import { Recording } from '../util/api';
import micIcon from '@iconify-icons/bi/mic-fill';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { AppUser } from '../app';
import { PanelHeader } from './common/panelHeader';
import { useTranslation } from 'react-i18next';

interface MonitoringPanelProps {
  recording: Recording;
  users: AppUser[];
}

export function MonitoringPanel({ recording, users }: MonitoringPanelProps) {
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
                  user.speaking ? 'bg-green-500' : ''
                )}
              >
                <div class="rounded-full shadow p-3 transition-colors bg-zinc-600">
                  <Icon icon={micIcon} className="w-6 h-6" />
                </div>
                <span class="sm:text-xl">
                  <span class="font-medium">{username}</span>
                  <span class={clsx('transition-opacity', user.speaking ? 'opacity-75' : 'opacity-50')}>
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
