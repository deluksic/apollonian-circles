import { defineConfig } from '@solidjs/start/config'

export default defineConfig({
  ssr: true,
  server: { preset: 'vercel' },
  devOverlay: false,
  vite: {
    css: {
      modules: {
        localsConvention: 'camelCaseOnly',
      },
    },
  },
})
