import { Icon } from '@iconify/react';
import noMicIcon from '@iconify-icons/bi/mic-mute-fill';
import { useTranslation } from 'react-i18next';

export function RequestMicrophone() {
  const { t } = useTranslation();

  return (
    <div class="p-2 border-2 bg-opacity-25 rounded-md border-yellow-500 bg-yellow-500 align-middle font-body">
      <h1 class="text-lg font-medium flex gap-2 items-center justify-center sm:justify-start">
        <Icon icon={noMicIcon} /> {t('onboarding.noAudio.title')}
      </h1>
      <span>{t('onboarding.noAudio.desc')}</span>
    </div>
  );
}
