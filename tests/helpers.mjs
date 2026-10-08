import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'
import { mkdir, mkdtemp } from 'node:fs/promises'

export const log = { debug() {}, info() {}, warn() {}, error() {} }
export async function sandbox(name) {
  const root = resolve('.tmp/tests')
  await mkdir(root, { recursive: true })
  return mkdtemp(join(root, `${name}-`))
}
export async function source(entry, directory) {
  const outfile = join(directory, 'source.mjs')
  await build({ entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent' })
  return import(pathToFileURL(outfile).href)
}
export function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
