import 'tailwindcss/tailwind.css';
import 'react-tippy/dist/tippy.css';
import '@fontsource/red-hat-text/400.css';
import '@fontsource/red-hat-text/500.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/500.css';
import '@fontsource/lexend/700.css';
import '@fontsource/ubuntu-mono/400.css';
import './index.sass';

import { render } from 'preact';

import { App } from './app';
import { loadI18n } from './util/i18n';

(async () => {
  await loadI18n();
  render(<App />, document.getElementById('app')!);
})();
