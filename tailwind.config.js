const defaults = require('tailwindcss/defaultConfig');
const sans = defaults.theme.fontFamily.sans;
const mono = defaults.theme.fontFamily.mono;

module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Lexend', '"Red Hat Text"', ...sans],
        body: ['"Red Hat Text"', ...sans],
        mono: ['"Ubunto Mono"', ...mono]
      }
    }
  },
  variants: {
    extend: {}
  },
  plugins: []
};
