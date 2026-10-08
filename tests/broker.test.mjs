import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { log, sandbox, source } from './helpers.mjs'

const { Broker } = await source('src/host/broker.ts', await sandbox('broker'))
const request = target => ({ id: randomUUID(), target, path: process.cwd(), deadline: Date.now() + 2000 })

test('只交付一次, 确认后才完成, 错误租约不能确认', async t => {
  const broker = new Broker(log)
  t.after(() => broker.dispose())
  const first = request('desktop')
  let done = false
  const result = broker.submit(first, new AbortController().signal).then(value => { done = true; return value })
  const delivery = await broker.poll('desktop', new AbortController().signal)
  assert.equal(done, false)
  assert.equal(delivery.id, first.id)
  assert.equal(broker.acknowledge({ id: first.id, lease: randomUUID(), result: { ok: true, workspaceId: 'one', path: first.path } }), false)
  const waiting = new AbortController()
  const duplicate = broker.poll('desktop', waiting.signal)
  waiting.abort()
  assert.equal(await duplicate, null)
  assert.equal(broker.acknowledge({ id: first.id, lease: delivery.lease, result: { ok: true, workspaceId: 'one', path: first.path } }), true)
  assert.equal((await result).ok, true)
  assert.equal(broker.acknowledge({ id: first.id, lease: delivery.lease, result: { ok: true, workspaceId: 'one', path: first.path } }), false)
})

test('串行队列按目标领取, 断开当前 CLI 后推进后续请求', async t => {
  const broker = new Broker(log)
  t.after(() => broker.dispose())
  const cancel = new AbortController()
  const first = broker.submit(request('desktop'), cancel.signal)
  const secondRequest = request('web')
  const second = broker.submit(secondRequest, new AbortController().signal)
  let received = false
  const poll = broker.poll('web', new AbortController().signal).then(value => { received = true; return value })
  await Promise.resolve()
  assert.equal(received, false)
  cancel.abort()
  assert.equal((await first).ok, false)
  const delivery = await poll
  assert.equal(delivery.id, secondRequest.id)
  broker.acknowledge({ id: delivery.id, lease: delivery.lease, result: { ok: false, error: 'test' } })
  assert.equal((await second).ok, false)
})

test('超时和卸载结束等待, 过期 ACK 不产生成功', async () => {
  const broker = new Broker(log)
  const item = { ...request('desktop'), deadline: Date.now() + 25 }
  const result = broker.submit(item, new AbortController().signal)
  const delivery = await broker.poll('desktop', new AbortController().signal)
  assert.equal((await result).ok, false)
  assert.equal(broker.acknowledge({ id: item.id, lease: delivery.lease, result: { ok: true, workspaceId: 'one', path: item.path } }), false)
  const pending = broker.submit(request('web'), new AbortController().signal)
  const waiting = broker.poll('desktop', new AbortController().signal)
  broker.dispose()
  assert.equal((await pending).ok, false)
  assert.equal(await waiting, null)
  assert.equal((await broker.submit(request('web'), new AbortController().signal)).ok, false)
})
