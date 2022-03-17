export function makeLogger(name: string, color = '#444') {
  const nameStyle = `background-color:${color};padding:0 .5em;border-top-right-radius:5px;border-bottom-right-radius:5px;margin-right:.25em`;
  const prefix = `%c•%c${name}`;

  return {
    log: (...a: any[]) =>
      console.log(
        prefix,
        'background-color:#9b59b6;padding:0 .3em;border-top-left-radius:5px;border-bottom-left-radius:5px',
        nameStyle,
        ...a
      ),
    debug: (...a: any[]) =>
      console.debug(
        prefix,
        'background-color:#6c58b5;padding:0 .3em;border-top-left-radius:5px;border-bottom-left-radius:5px',
        nameStyle,
        ...a
      ),
    warn: (...a: any[]) =>
      console.warn(
        prefix,
        'background-color:#f1c40f;padding:0 .3em;border-top-left-radius:5px;border-bottom-left-radius:5px',
        nameStyle,
        ...a
      ),
    error: (...a: any[]) =>
      console.error(
        prefix,
        'background-color:#f00;padding:0 .3em;border-top-left-radius:5px;border-bottom-left-radius:5px',
        nameStyle,
        ...a
      )
  };
}
