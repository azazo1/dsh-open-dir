import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { Broker } from './broker.ts'
import { errorMessage, record, type Endpoint, type Log, type OpenRequest } from '../shared/protocol.ts'

function respond(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed) return
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
async function body(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk as Uint8Array)
    size += bytes.length
    if (size > 16_384) throw new Error('请求体超过 16 KiB')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

/** CLI 专用回环接口, 不允许浏览器跨源访问, 不借用用户浏览器 Cookie. */
export async function startBridge(broker: Broker, directory: string, log: Log): Promise<{ endpoint: Endpoint; dispose(): Promise<void> }> {
  const token = randomBytes(32).toString('hex')
  const instance = randomUUID()
  const server = createServer((req, res) => {
    void handle(req, res).catch(error => {
      log.warn('CLI 接口失败: %s', errorMessage(error))
      respond(res, 400, { ok: false, error: errorMessage(error) })
    })
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 10_000
  const endpoint: Endpoint = { version: 1, instance, pid: process.pid, port: 0, token }
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const auth = Buffer.from(req.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (req.headers.origin !== undefined || auth.length !== expected.length || !timingSafeEqual(auth, expected)
      || req.headers.host !== `127.0.0.1:${endpoint.port}`) {
      respond(res, 403, { ok: false, error: '拒绝未经认证的本地请求' })
      return
    }
    if (req.method === 'GET' && req.url === '/health') {
      respond(res, 200, { version: 1, instance, pid: process.pid, targets: broker.targets })
      return
    }
    if (req.method !== 'POST' || req.url !== '/open') { respond(res, 404, { ok: false, error: '接口不存在' }); return }
    const value = await body(req)
    if (!record(value) || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id)
      || typeof value.path !== 'string' || value.path.length > 8192 || !isAbsolute(value.path)
      || !['desktop', 'web'].includes(String(value.target)) || typeof value.deadline !== 'number'
      || !Number.isFinite(value.deadline) || value.deadline <= Date.now() || value.deadline > Date.now() + 300_000) {
      throw new Error('打开请求格式不正确')
    }
    const canonical = await realpath(value.path)
    if (!(await stat(canonical)).isDirectory()) throw new Error('目标路径不是目录')
    const controller = new AbortController()
    const abort = () => controller.abort()
    res.once('close', abort)
    try {
      const result = await broker.submit({ ...value, path: canonical } as unknown as OpenRequest, controller.signal)
      respond(res, result.ok ? 200 : 409, result)
    } finally { res.off('close', abort) }
  }
  let published = false
  const file = join(directory, `${instance}.json`)
  const dispose = async (): Promise<void> => {
    broker.dispose()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    if (published) {
      // 文件名由本实例 UUID 生成, 仅删除本实例自己发布的发现记录.
      await unlink(file).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error })
      published = false
    }
    log.info('CLI 本地接口已关闭, instance=%s', instance)
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
    })
    endpoint.port = (server.address() as AddressInfo).port
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeFile(file, JSON.stringify(endpoint), { mode: 0o600, flag: 'wx' })
    published = true
    server.on('error', error => log.error('CLI 本地接口异常: %s', errorMessage(error)))
    log.info('CLI 本地接口就绪, instance=%s, port=%s', instance, endpoint.port)
    return { endpoint, dispose }
  } catch (error) { await dispose(); throw error }
}
