import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { API, isResult, record, errorMessage } from './shared/protocol.ts'
import { runtimeDirectory } from './shared/paths.ts'
import { Broker } from './host/broker.ts'
import { startBridge } from './host/bridge.ts'

export const name = 'dsh-open-dir'
export const inject = ['connection']

/** 挂载认证过的 Client 路由和独立的 CLI 回环桥. */
export async function apply(ctx: Context): Promise<void> {
  const broker = new Broker(ctx.logger)
  // 初始化未完成时卸载也等待资源创建并清理, 防止异步启动泄漏监听端口.
  let startup: ReturnType<typeof startBridge> | undefined
  ctx.effect(() => async () => {
    broker.dispose()
    await startup?.then(bridge => bridge.dispose(), () => {})
  }, 'dsh-open-dir: CLI bridge lifetime')
  ctx.connection.fetch.register({
    path: `${API}/next`, methods: ['GET'], requestBody: 'buffered',
    fetch: async request => {
      const target = new URL(request.url).searchParams.get('target')
      if (target !== 'desktop' && target !== 'web') return Response.json({ error: 'target 不合法' }, { status: 400 })
      try { return Response.json(await broker.poll(target, request.signal)) }
      catch (error) { return Response.json({ error: errorMessage(error) }, { status: 503 }) }
    },
  })
  ctx.connection.fetch.register({
    path: `${API}/ack`, methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      let value: unknown
      try { value = await request.json() }
      catch { return Response.json({ error: '不是合法 JSON' }, { status: 400 }) }
      if (!record(value) || typeof value.id !== 'string' || typeof value.lease !== 'string' || !isResult(value.result)) {
        return Response.json({ error: '确认格式不合法' }, { status: 400 })
      }
      const accepted = broker.acknowledge({ id: value.id, lease: value.lease, result: value.result })
      return Response.json({ accepted }, { status: accepted ? 200 : 409 })
    },
  })
  startup = startBridge(broker, runtimeDirectory(), ctx.logger)
  await startup
}
