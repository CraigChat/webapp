import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'preact';
import { useTranslation } from 'react-i18next';
import { WebappOpCloseReason } from '../util/audio/protocol';
import Button from './common/button';

interface ModalProps {
  open: boolean;
  reason?: string;
}

export function Modal({ open, reason: reasonCode }: ModalProps) {
  const { t } = useTranslation();

  // Prevent dumb TS errors
  const DialogFix = Dialog as any;
  const Title = Dialog.Title as any;

  const webappReason = reasonCode.charCodeAt(0);
  const reason = t(`modal.errors.${WebappOpCloseReason[webappReason]}`, WebappOpCloseReason[webappReason]);

  return (
    <Transition appear show={open} as={Fragment}>
      <DialogFix as="div" className="fixed inset-0 z-10 overflow-y-auto bg-black bg-opacity-50" onClose={() => {}}>
        <div className="min-h-screen px-4 text-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay className="fixed inset-0" />
          </Transition.Child>

          {/* This element is to trick the browser into centering the modal contents. */}
          <span className="inline-block h-screen align-middle" aria-hidden="true">
            &#8203;
          </span>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-zinc-600 shadow-xl rounded-2xl">
              <Title as="h3" className="text-lg font-medium leading-6 text-white">
                {t('modal.disconnected')}
              </Title>
              <div className="mt-2">
                <p className="text-sm text-zinc-300">{t('modal.disconnectedBody')}</p>
                {reason ? (
                  <p className="text-sm text-zinc-300">
                    {t('modal.reason')}: {reason}
                  </p>
                ) : (
                  ''
                )}
              </div>

              <div className="mt-4">
                <Button
                  type="brand"
                  className="w-fit"
                  onClick={() => {
                    if (
                      webappReason === WebappOpCloseReason.SHARD_CLOSED ||
                      webappReason === WebappOpCloseReason.INVALID_ID
                    )
                      location.href = '/';
                    else location.reload();
                  }}
                >
                  {t('modal.reload')}
                </Button>
              </div>
            </div>
          </Transition.Child>
        </div>
      </DialogFix>
    </Transition>
  );
}
