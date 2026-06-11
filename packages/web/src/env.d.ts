/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string;
  readonly VITE_DEFAULT_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
