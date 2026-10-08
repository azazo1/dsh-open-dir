import { lstat, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { record, errorMessage, type Endpoint, type Log, type Target } from '../shared/protocol.ts'

function valid(value: unknown): value is Endpoint {
  return record(value) && value.version === 1 && typeof value.instance === 'string' && /^[a-f0-9-]{36}$/.test(value.instance)
    && typeof value.token === 'string' && /^[a-f0-9]{64}$/.test(value.token)
    && typeof value.pid === 'number' && Number.isInteger(value.pid) && value.pid > 0
    && typeof value.port === 'number' && Number.isInteger(value.port) && value.port > 0 && value.port <= 65535
}
export function address(endpoint: Endpoint, route: string): string { return `http://127.0.0.1:${endpoint.port}${route}` }
export function authorization(endpoint: Endpoint): Record<string, string> { return { Authorization: `Bearer ${endpoint.token}` } }

/** 只读取本插件的发现记录, 通过身份握手忽略崩溃后留下的过期文件. */
export async function discover(directory: string, target: Target, instance: string | undefined, signal: AbortSignal, log: Log): Promise<Endpoint[]> {
  let files: string[]
  try { files = (await readdir(directory)).filter(file => /^[a-f0-9-]{36}\.json$/.test(file)) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  if (files.length > 128) throw new Error('发现记录超过 128 个, 请清理本插件遗留的运行时记录')
  const candidates = await Promise.all(files.map(async file => {
    if (instance && file !== `${instance}.json`) return null
    try {
      const path = join(directory, file)
      const info = await lstat(path)
      if (!info.isFile() || info.size > 4096 || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) return null
      const value: unknown = JSON.parse(await readFile(path, 'utf8'))
      if (!valid(value) || file !== `${value.instance}.json`) return null
      const response = await fetch(address(value, '/health'), {
        headers: authorization(value), signal: AbortSignal.any([signal, AbortSignal.timeout(700)]), redirect: 'error',
      })
      if (!response.ok) return null
      const health: unknown = await response.json()
      if (!record(health) || health.version !== 1 || health.instance !== value.instance || health.pid !== value.pid
        || !Array.isArray(health.targets) || !health.targets.includes(target)) return null
      return value
    } catch (error) { log.debug('忽略不可用的发现记录 %s: %s', file, errorMessage(error)); return null }
  }))
  return candidates.filter((value): value is Endpoint => value !== null)
}
export async function waitForEndpoint(directory: string, target: Target, instance: string | undefined, signal: AbortSignal, log: Log): Promise<Endpoint> {
  log.info('等待 %s 界面的插件通道就绪', target)
  while (!signal.aborted) {
    const candidates = await discover(directory, target, instance, signal, log)
    if (candidates.length > 1) {
      throw new Error(`发现多个 ${target} Host 实例, 请用 --instance 选择: ${candidates.map(row => `${row.instance} (pid=${row.pid})`).join(', ')}`)
    }
    if (candidates[0]) return candidates[0]
    await delay(250, undefined, { signal })
  }
  signal.throwIfAborted()
  throw new Error('没有可用的插件实例')
}
