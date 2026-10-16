import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Link previews (LinkedIn, Slack, email) need an absolute image URL. On Vercel the production domain is
// known at build time; SITE_URL overrides it. Without either, the tags fall back to relative paths.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const site = (env.SITE_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '')

export default defineConfig({
  plugins: [react(), { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', site) }],
  server: { port: 5101, strictPort: true },
  preview: { port: 5101, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        // The run's claims, traces and excerpts are one chunk of their own: index.html preloads it beside the
        // app code, a code change leaves its cached copy valid, and its size shows on its own line in the build.
        codeSplitting: { groups: [{ name: 'run-data', test: /[\\/]data[\\/](claims|traces|excerpts|rejected)\.json$/ }] },
      },
    },
    // run-data is about 750 KB (about 105 KB gzipped). Every other chunk is under the 500 KB default.
    chunkSizeWarningLimit: 900,
  },
})
