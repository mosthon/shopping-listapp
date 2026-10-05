/// <reference types="vite/client" />

declare module 'occt-import-js' {
  const init: (opts?: unknown) => Promise<unknown>;
  export default init;
}
