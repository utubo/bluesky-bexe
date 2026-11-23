/// <reference types="vitest" />
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [sveltekit(), svelteTesting()],

  resolve: {
    conditions: mode === 'test' ? ['browser'] : undefined,
  },

  define: {
    __BUILD_TIME__: JSON.stringify(process.env.VITE_BUILD_TIME || new Date().toISOString()),
  },

  build: {
    chunkSizeWarningLimit: 5000,
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    deps: {
      inline: [/^(?!.*vitest).*$/, '@testing-library/svelte'],
    },
  },
}));
