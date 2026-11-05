import { mkdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const face = process.argv[2]
if (face && !['host', 'client', 'cli'].includes(face)) throw new Error(`未知构建目标: ${face}`)
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// Go CLI 独立于插件包构建, 只需要 Node 和 Go, 不依赖 node_modules.
if (face === 'cli') {
  await mkdir('.tmp/bin', { recursive: true })
  const output = resolve('.tmp/bin', process.platform === 'win32' ? 'dsh-open.exe' : 'dsh-open')
  run('go', ['build', '-trimpath', '-ldflags', `-s -w -X main.version=${manifest.version}`, '-o', output, './cmd/dsh-open'], { cwd: 'cli' })
  process.exit(0)
}

const { build } = await import('esbuild')
await mkdir('lib', { recursive: true })
if (face !== 'client') {
  await build({ entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true, format: 'esm', platform: 'node', target: 'node22', packages: 'external', sourcemap: true })
  run('pnpm', ['exec', 'tsc', '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', 'lib/types'])
}
if (face !== 'host') {
  await build({ entryPoints: ['src/client/index.ts'], outfile: 'lib/client.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2022', sourcemap: true })
}
