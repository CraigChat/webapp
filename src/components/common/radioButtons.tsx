import { useState } from 'preact/hooks';
import { RadioGroup } from '@headlessui/react';
import { Icon, IconifyIcon } from '@iconify/react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { asT, StringT } from '../../util';

export interface RadioButton extends Record<string, any> {
  icon?: IconifyIcon;
  name: StringT;
  description?: StringT;
  value: string;
}

interface RadioButtonsProps {
  className?: string;
  label?: string;
  items: RadioButton[];
  selected?: RadioButton;
  disabled?: boolean;
  onSelect?(item: RadioButton): any;
}

export default function RadioButtons({
  className,
  label,
  items,
  selected: defaultSelected,
  disabled,
  onSelect
}: RadioButtonsProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(defaultSelected || items[0]);

  function onSelectItem(item: RadioButton) {
    if (onSelect) onSelect(item);
    setSelected(item);
  }

  // Prevent dumb TS errors
  const RGroup = RadioGroup as any;
  const Label = RadioGroup.Label as any;

  return (
    <RGroup value={selected} onChange={onSelectItem} disabled={disabled} className={className}>
      {label ? (
        <RadioGroup.Label className="block text-sm font-medium font-display text-zinc-400">{label}</RadioGroup.Label>
      ) : (
        ''
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <RadioGroup.Option
            key={item.value}
            value={item}
            className={({ active, checked }) =>
              clsx(
                active ? 'ring-2 ring-white ring-opacity-60' : '',
                checked ? 'bg-teal-800 bg-opacity-75 text-white' : 'bg-zinc-600',
                'relative rounded-lg shadow-md px-5 py-4 cursor-pointer flex focus:outline-none'
              )
            }
          >
            {({ active, checked }) => (
              <div className="flex gap-4 w-full items-center">
                {item.icon ? <Icon icon={item.icon} className="w-8 h-8" /> : ''}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center">
                    <div className="text-sm">
                      <Label as="p" className="font-medium text-white">
                        {asT(t, item.name)}
                      </Label>
                      {item.description ? (
                        // @ts-ignore
                        <RadioGroup.Description
                          as="span"
                          className={clsx('inline', checked ? 'text-teal-100' : 'text-zinc-300')}
                        >
                          {asT(t, item.description)}
                        </RadioGroup.Description>
                      ) : (
                        ''
                      )}
                    </div>
                  </div>
                  {checked && (
                    <div className="flex-shrink-0 text-white">
                      <CheckIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </RadioGroup.Option>
        ))}
      </div>
    </RGroup>
  );
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx={12} cy={12} r={12} fill="#fff" opacity="0.2" />
      <path d="M7 13l3 3 7-7" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
