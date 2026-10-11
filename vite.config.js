/* global process, Buffer */
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

// Dev-only twin of worker/index.js "/api/photo-proxy": the admin Photo Review editor reads photo pixels through
// a same-origin URL. (In production the Cloudflare Worker serves this.)
const photoProxyDev = () => ({
  name: 'photo-proxy-dev',
  configureServer(server) {
    server.middlewares.use('/api/photo-proxy', async (req, res) => {
      try {
        const target = new URL(req.url, 'http://x').searchParams.get('u') || ''
        const u = new URL(target)
        const ok = u.protocol === 'https:' && (u.hostname === 'drive.google.com' || u.hostname === 'lh3.googleusercontent.com' || u.hostname.endsWith('.supabase.co'))
        if (!ok) { res.statusCode = 400; res.end('Host not allowed'); return }
        const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' })
        const type = (r.headers.get('content-type') || '').split(';')[0]
        if (!r.ok || !type.startsWith('image/')) { res.statusCode = 502; res.end('Photo fetch failed'); return }
        res.setHeader('Content-Type', type)
        res.end(Buffer.from(await r.arrayBuffer()))
      } catch { res.statusCode = 400; res.end('Bad request') }
    })
  },
})

export default defineConfig({
  plugins: [react(), versionFilePlugin(), photoProxyDev()],
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
