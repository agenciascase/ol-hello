// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// HUB na Hostinger: servidor Node comum. traceDeps leva a biblioteca do WhatsApp pelo QR Code (com
// WebAssembly) inteira para o servidor, sem reempacotar. (O tipo do pacote da Lovable não lista traceDeps,
// mas ele repassa as opções para o nitro.)
const nitroHub = {
  preset: "node-server",
  traceDeps: ["@whiskeysockets/baileys*", "qrcode*", "pino*"],
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // HUB na Hostinger: servidor Node comum (npm run build → node .output/server/index.mjs).
  // Dentro da Lovable o pacote acima força cloudflare-module de qualquer jeito.
  nitro: nitroHub,
});
