import clsx from 'clsx';
import { h } from 'preact';

interface PanelProps {
  children?: any;
  sidePanel?: boolean;
  sandwich?: boolean;
  className?: string;
}

export default function Panel({ children, sidePanel, sandwich, className }: PanelProps) {
  return (
    <div
      class={clsx(
        'bg-zinc-700 sm:rounded flex justify-center items-center sm:shadow-md w-full',
        {
          'flex-col sm:w-4/5 sm:max-w-4xl': !sidePanel,
          'flex-col sm:flex-row md:w-4/5 md:max-w-4xl': sidePanel,
          'p-6 gap-8': !sandwich && !sidePanel
        },
        className
      )}
    >
      {children}
    </div>
  );
}
