import { build } from 'esbuild'
import { mkdir, readFile, chmod } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const define = { __DSH_OPEN_VERSION__: JSON.stringify(manifest.version) }
const face = process.argv[2]
if (face && !['host', 'client'].includes(face)) throw new Error(`未知构建目标: ${face}`)
await mkdir('lib', { recursive: true })
if (face !== 'client') {
  await build({ entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true, format: 'esm', platform: 'node', target: 'node22', packages: 'external', sourcemap: true })
  // CLI 独立打包, 从仓库直接运行时只需要 Node.
  await build({ entryPoints: ['src/cli/main.ts'], outfile: 'lib/cli.js', bundle: true, format: 'esm', platform: 'node', target: 'node22', sourcemap: true, define })
  await chmod('lib/cli.js', 0o755)
  const declarations = spawnSync('pnpm', ['exec', 'tsc', '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', 'lib/types'], { stdio: 'inherit' })
  if (declarations.status !== 0) process.exit(declarations.status ?? 1)
}
if (face !== 'host') {
  await build({ entryPoints: ['src/client/index.ts'], outfile: 'lib/client.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2022', sourcemap: true })
}
