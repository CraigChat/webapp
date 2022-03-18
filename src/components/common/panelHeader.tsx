import Button from '../common/button';
import { Recording } from '../../util/api';
import ChannelIcon from '../common/channelIcon';
import { useTranslation } from 'react-i18next';

interface MonitoringPanelProps {
  recording: Recording;
}

export function PanelHeader({ recording }: MonitoringPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="flex justify-between p-3 items-center relative bg-black bg-opacity-20 self-stretch w-full font-body font-medium">
      <div class="flex justify-center items-center gap-2">
        <span class="flex items-center justify-center gap-2 text-ellipsis overflow-hidden">
          <ChannelIcon type={recording.channelType} className="inline w-5 h-5 flex-none" />
          <span class="max-w-full text-ellipsis overflow-hidden">{recording.channelName}</span>
        </span>
        <span class="opacity-50">{t('in')}</span>
        <div class="flex items-center justify-center gap-2 text-ellipsis overflow-hidden">
          {recording.serverIcon ? <img src={recording.serverIcon} class="w-10 h-10 rounded-full" /> : ''}
          <span class="max-w-full text-ellipsis overflow-hidden">{recording.serverName}</span>
        </div>
      </div>
      <Button type="danger" onClick={() => location.reload()}>
        {t('rec.disconnect')}
      </Button>
    </div>
  );
}
