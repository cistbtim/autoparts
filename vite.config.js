/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// One id per build (not per request) — used by src/lib/versionCheck.js so an
// already-open tab can notice a newer build was deployed and reload itself.
const buildId = Date.now().toString()

// Emits dist/version.json alongside the rest of the build output. Only runs
// on `vite build` (writeBundle doesn't fire for the dev server), which is
// fine — there's nothing to auto-update to in dev.
const versionFilePlugin = () => ({
  name: 'write-version-file',
  writeBundle(options) {
    fs.writeFileSync(path.join(options.dir || 'dist', 'version.json'), JSON.stringify({ buildId }))
  },
})

export default defineConfig({
  plugins: [react(), versionFilePlugin()],
  server: {
    port: 3000,
    allowedHosts: ['.trycloudflare.com'],
  },
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __BUILD_ID__: JSON.stringify(buildId),
  },
})
