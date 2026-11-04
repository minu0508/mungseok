import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 공유 미리보기(og:image)는 절대 주소여야 한다. SITE_URL, 없으면 Vercel 의 운영 주소로 채운다
function siteOrigin(): Plugin {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const origin = (process.env.SITE_URL || (vercel ? `https://${vercel}` : 'http://localhost:4173')).replace(/\/$/, '')
  return { name: 'site-origin', transformIndexHtml: html => html.replaceAll('__ORIGIN__', origin) }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteOrigin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
})
