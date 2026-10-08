import test from 'node:test'
import assert from 'node:assert/strict'
import { deferred, log, sandbox, source } from './helpers.mjs'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const { navigate, runClient } = await source('src/client/runner.ts', await sandbox('client'))
const delivery = () => ({ id: 'test', lease: 'lease', path: process.cwd(), target: 'web', deadline: Date.now() + 5000 })

test('导航完成后才发送成功确认, ACK 失败只重试确认', async () => {
  const lifetime = new AbortController()
  const navigation = deferred()
  const started = deferred()
  let opens = 0
  let acks = 0
  const context = {
    workspaces: { async create({ path }) { return { workspaceId: 'one', path } } },
    uiWorkspace: { async openWorkspace(id, beforeOpen) { opens++; started.resolve(); await navigation.promise; beforeOpen('session') } },
  }
  const item = delivery()
  const send = async (url, options) => {
    if (url.includes('/next')) return Response.json(item)
    acks++
    assert.equal(JSON.parse(options.body).result.ok, true)
    if (acks === 1) throw new Error('模拟确认响应丢失')
    lifetime.abort()
    return Response.json({ accepted: true })
  }
  const loop = runClient(context, 'web', lifetime.signal, log, send)
  await started.promise
  assert.equal(acks, 0)
  navigation.resolve()
  await loop
  assert.equal(opens, 1)
  assert.equal(acks, 2)
})

test('导航取消, 工作区创建失败和请求过期都不能报告成功', async () => {
  let opens = 0
  const context = {
    workspaces: { async create({ path }) { return { workspaceId: 'one', path } } },
    uiWorkspace: { async openWorkspace() { opens++ } },
  }
  assert.equal((await navigate(context, delivery(), new AbortController().signal)).ok, false)
  assert.equal(opens, 1)
  assert.equal((await navigate(context, { ...delivery(), deadline: Date.now() - 1 }, new AbortController().signal)).ok, false)
  assert.equal(opens, 1)
  context.workspaces.create = async () => { throw new Error('目录失效') }
  assert.equal((await navigate(context, delivery(), new AbortController().signal)).ok, false)
})

test('Client 产物以正确 ID 注册并声明真实服务依赖', async () => {
  let registration
  runInNewContext(await readFile('lib/client.js', 'utf8'), { window: { __ModuleLoader__: { load(value) { registration = value } } } })
  assert.equal(registration.id, 'dsh-open-dir')
  const plugin = registration.factory(() => { throw new Error('Client 不应在运行时加载未提供的模块') })
  assert.deepEqual(Array.from(plugin.inject), ['workspaces', 'uiWorkspace'])
  assert.equal(typeof plugin.apply, 'function')
})
