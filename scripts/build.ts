import * as esbuild from 'esbuild'
import { mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

console.log('[Build] Cleaning previous build output in dist/ ...')
rmSync(dist, { recursive: true, force: true })
mkdirSync(path.join(dist, 'workers'), { recursive: true })
mkdirSync(path.join(dist, 'daemon'), { recursive: true })

// 1. Copy reed-solomon wasm if present
const wasmSrc = path.join(
  root,
  'node_modules/@digitaldefiance/reed-solomon-erasure.wasm/dist/reed_solomon_erasure_bg.wasm'
)
if (existsSync(wasmSrc)) {
  copyFileSync(wasmSrc, path.join(dist, 'workers/reed_solomon_erasure_bg.wasm'))
}

// 2. Build Bare worker bundle (CJS for Bare runtime)
console.log('[Build] Bundling Ryve P2P Bare worker...')
await esbuild.build({
  entryPoints: [path.join(root, 'src/workers/main.ts')],
  outfile: path.join(dist, 'workers/main.cjs'),
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  bundle: true,
  packages: 'external',
  sourcemap: true
})

// Guard against parent package.json "type":"module" if anything loads .js inside workers
writeFileSync(
  path.join(dist, 'workers/package.json'),
  JSON.stringify({ type: 'commonjs', private: true }, null, 2) + '\n'
)

// 3. Build Node.js Daemon (ESM)
console.log('[Build] Bundling Ryve Storage Node Daemon...')
await esbuild.build({
  entryPoints: [path.join(root, 'src/daemon/index.ts')],
  outfile: path.join(dist, 'daemon/index.js'),
  platform: 'node',
  format: 'esm',
  target: 'node20',
  bundle: true,
  packages: 'external',
  sourcemap: true,
  banner: {
    js: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`
  }
})

console.log('[Build] Build complete successfully -> dist/daemon/index.js & dist/workers/main.cjs')
