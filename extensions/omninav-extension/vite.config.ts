import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

// 构建时将 package.json 的 version 同步写入 public/manifest.json
function syncManifestVersion(): import('vite').Plugin {
  return {
    name: 'sync-manifest-version',
    buildStart() {
      const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
      const manifestPath = resolve(__dirname, 'public/manifest.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      if (manifest.version !== pkg.version) {
        manifest.version = pkg.version
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
        console.log(`[sync-manifest-version] manifest.json version → ${pkg.version}`)
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), syncManifestVersion()],
  // 扩展页面使用相对路径，避免 chrome-extension:// 下的绝对路径解析问题
  base: './',
  root: resolve(__dirname, 'src'),
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup.html'),
        options: resolve(__dirname, 'src/options.html'),
        ai: resolve(__dirname, 'src/ai.html'),
        background: resolve(__dirname, 'src/background/entry.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js'
          return 'assets/[name]-[hash].js'
        },
      },
    },
  },
})

