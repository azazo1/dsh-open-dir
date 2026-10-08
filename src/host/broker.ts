import { randomUUID } from 'node:crypto'
import type { Ack, Delivery, Log, OpenRequest, OpenResult, Target } from '../shared/protocol.ts'

interface Pending {
  request: OpenRequest
  resolve: (result: OpenResult) => void
  timer: ReturnType<typeof setTimeout>
  cleanup: () => void
  startedAt: number
  lease?: string
}
interface Waiter { target: Target; resolve: (value: Delivery | null) => void; cleanup: () => void }

/** 所有窗口共享一条串行队列, 请求只交给一个前端, 失败后不自动重放导航. */
export class Broker {
  private readonly pending: Pending[] = []
  private readonly waiters = new Set<Waiter>()
  private readonly presence = new Map<Target, number>()
  private closed = false
  get targets(): Target[] {
    return [...this.presence].filter(([, time]) => Date.now() - time < 45_000).map(([target]) => target)
  }
  constructor(private readonly log: Log, private readonly pollMs = 20_000) {}

  submit(request: OpenRequest, signal: AbortSignal): Promise<OpenResult> {
    if (this.closed) return Promise.resolve({ ok: false, error: '插件已经卸载' })
    if (this.pending.length >= 32) return Promise.resolve({ ok: false, error: '打开请求队列已满' })
    if (this.pending.some(row => row.request.id === request.id)) return Promise.resolve({ ok: false, error: '请求 ID 重复' })
    if (signal.aborted || request.deadline <= Date.now()) return Promise.resolve({ ok: false, error: '请求已过期' })
    return new Promise(resolve => {
      const cancel = () => this.finish(row, { ok: false, error: 'CLI 已断开连接' })
      const timer = setTimeout(() => this.finish(row, { ok: false, error: '等待界面完成导航超时, 请确认目标宿主已安装插件并打开界面' }), request.deadline - Date.now())
      const row: Pending = { request, resolve, timer, startedAt: Date.now(), cleanup: () => signal.removeEventListener('abort', cancel) }
      signal.addEventListener('abort', cancel, { once: true })
      this.pending.push(row)
      this.log.info('接收打开请求 %s, target=%s, path=%s', request.id, request.target, request.path)
      this.dispatch()
    })
  }

  poll(target: Target, signal: AbortSignal): Promise<Delivery | null> {
    if (this.closed || signal.aborted) return Promise.resolve(null)
    this.presence.set(target, Date.now())
    if (this.waiters.size >= 32) return Promise.reject(new Error('前端连接数量超出限制'))
    return new Promise(resolve => {
      const finish = () => {
        this.waiters.delete(waiter)
        waiter.cleanup()
        resolve(null)
      }
      const timer = setTimeout(finish, this.pollMs)
      const waiter: Waiter = { target, resolve, cleanup: () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', finish)
      } }
      signal.addEventListener('abort', finish, { once: true })
      this.waiters.add(waiter)
      this.dispatch()
    })
  }

  acknowledge(ack: Ack): boolean {
    const row = this.pending.find(row => row.request.id === ack.id && row.lease === ack.lease)
    if (!row || row.request.deadline <= Date.now()) return false
    this.finish(row, ack.result)
    return true
  }

  dispose(): void {
    this.closed = true
    for (const row of [...this.pending]) this.finish(row, { ok: false, error: '插件已卸载或宿主正在关闭' })
    for (const waiter of this.waiters) { waiter.cleanup(); waiter.resolve(null) }
    this.waiters.clear()
  }

  private dispatch(): void {
    const row = this.pending[0]
    if (!row || row.lease || this.closed) return
    const waiter = [...this.waiters].find(waiter => waiter.target === row.request.target)
    if (!waiter) return
    this.waiters.delete(waiter)
    waiter.cleanup()
    row.lease = randomUUID()
    this.log.debug('向 %s 前端分发请求 %s', waiter.target, row.request.id)
    waiter.resolve({ ...row.request, lease: row.lease })
  }

  private finish(row: Pending, result: OpenResult): void {
    const index = this.pending.indexOf(row)
    if (index < 0) return
    this.pending.splice(index, 1)
    clearTimeout(row.timer)
    row.cleanup()
    if (result.ok) this.log.info('完成打开请求 %s, workspace=%s, 耗时=%sms', row.request.id, result.workspaceId, Date.now() - row.startedAt)
    else this.log.warn('打开请求 %s 失败: %s', row.request.id, result.error)
    row.resolve(result)
    this.dispatch()
  }
}
