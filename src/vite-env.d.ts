/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_ENABLED?: string;
  readonly VITE_USDA_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
