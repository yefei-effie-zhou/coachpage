import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@tiptap/') || id.includes('/node_modules/@remirror/') || id.includes('/node_modules/prosemirror-')) return 'editor'
        },
      },
    },
  },
})
