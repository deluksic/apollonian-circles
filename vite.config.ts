import { defineConfig } from '@solidjs/start/config'

export default defineConfig({
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  start: { ssr: false },
})
