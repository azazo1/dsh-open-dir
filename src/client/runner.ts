import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/types'

/** 仅声明本插件使用的服务方法, 数据类型仍取自官方 API, 不引入整套 UI 槽位声明. */
export interface NavigationServices {
  workspaces: { create(input: { path: string }): Promise<WorkspaceView> }
  uiWorkspace: { openWorkspace(id: WorkspaceId, beforeOpen?: () => void): Promise<void> }
}
export type ClientContext = Context & NavigationServices
import { API, errorMessage, isDelivery, type Delivery, type Log, type OpenResult, type Target } from '../shared/protocol.ts'

export const inject = ['workspaces', 'uiWorkspace']

/** 通过宿主 API 复用工作区, 并检测 openWorkspace 被其他导航取消的情况. */
export async function navigate(ctx: NavigationServices, delivery: Delivery, signal: AbortSignal): Promise<OpenResult> {
  const check = () => {
    signal.throwIfAborted()
    if (Date.now() >= delivery.deadline) throw new Error('打开请求已过期')
  }
  try {
    check()
    const workspace = await ctx.workspaces.create({ path: delivery.path })
    check()
    let opened = false
    await ctx.uiWorkspace.openWorkspace(workspace.workspaceId, () => { check(); opened = true })
    if (!opened) throw new Error('工作区导航被其他操作取消')
    return { ok: true, workspaceId: workspace.workspaceId, path: workspace.path }
  } catch (error) { return { ok: false, error: errorMessage(error) } }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/** 长轮询只通过同源认证接口, Desktop 的 dsh-app 协议由宿主转发. */
export async function runClient(ctx: NavigationServices, target: Target, signal: AbortSignal, log: Log, send: typeof fetch = fetch): Promise<void> {
  let backoff = 500
  while (!signal.aborted) {
    try {
      const response = await send(`${API}/next?target=${target}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]), cache: 'no-store' })
      if (!response.ok) throw new Error(`领取请求失败: HTTP ${response.status}`)
      const value: unknown = await response.json()
      if (value === null) { backoff = 500; continue }
      if (!isDelivery(value)) throw new Error('Host 返回了不合法的打开请求')
      log.info('开始打开目录, request=%s, path=%s', value.id, value.path)
      const result = await navigate(ctx, value, signal)
      // ACK 丢失时只重试 ACK, 不重放工作区导航.
      while (!signal.aborted && Date.now() < value.deadline) {
        try {
          const ack = await send(`${API}/ack`, {
            method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.min(5000, value.deadline - Date.now())))]), headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: value.id, lease: value.lease, result }),
          })
          if (ack.status === 409) { log.warn('打开确认已经过期, request=%s', value.id); break }
          if (!ack.ok) throw new Error(`发送确认失败: HTTP ${ack.status}`)
          log.info('工作区打开结果已确认, request=%s, ok=%s', value.id, result.ok)
          break
        } catch (error) {
          if (signal.aborted) break
          log.warn('打开确认暂时未送达: %s', errorMessage(error))
          await pause(500, signal)
        }
      }
      backoff = 500
    } catch (error) {
      if (signal.aborted) return
      log.warn('打开目录通道暂时不可用: %s', errorMessage(error))
      await pause(backoff, signal)
      backoff = Math.min(backoff * 2, 5000)
    }
  }
}
