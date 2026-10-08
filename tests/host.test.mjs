import test from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import * as plugin from '../lib/index.js'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { sandbox, deferred } from './helpers.mjs'

test('真实 Cordis 挂载 Host 和 Client 产物, CLI 等待导航后退出, 卸载撤回接口', { timeout: 10_000 }, async t => {
  const home = await sandbox('composition-home')
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome })
  const ctx = new Context()
  const opened = deferred()
  const allowOpen = deferred()
  const connectionFiber = ctx.plugin(serviceCtx => {
    new HostConnectionService(serviceCtx, [], {})
    new class extends Service {
      constructor() { super(serviceCtx, 'workspaces') }
      async create({ path }) { return { workspaceId: 'composed-workspace', path } }
    }()
    new class extends Service {
      constructor() { super(serviceCtx, 'uiWorkspace') }
      async openWorkspace(id, beforeOpen) { opened.resolve(id); await allowOpen.promise; beforeOpen() }
    }()
  })
  await connectionFiber.await()
  t.after(() => connectionFiber.dispose())
  const fiber = ctx.plugin(plugin)
  await fiber.await()
  t.after(() => fiber.dispose())
  const connection = ctx.get('connection')
  const carrier = connection.createSharedFetchHandler('/api')
  const send = (path, options) => carrier.fetch(new Request(new URL(path, 'http://host'), options))
  let registration
  runInNewContext(await readFile('lib/client.js', 'utf8'), {
    window: { __ModuleLoader__: { load(entry) { registration = entry } } },
    location: { protocol: 'http:' }, fetch: send,
    AbortController, AbortSignal, Date, setTimeout, clearTimeout,
  })
  const client = ctx.plugin(registration.factory(() => { throw new Error('未声明的模块依赖') }))
  await client.await()
  t.after(() => { allowOpen.resolve(); return client.dispose() })
  const child = spawn(process.execPath, [resolve('lib/cli.js'), '--target', 'web', '--no-launch', '--timeout', '5', '.'], {
    env: { ...process.env, DSH_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => { if (child.exitCode === null) child.kill() })
  let stderr = ''
  child.stderr.on('data', value => { stderr += value })
  child.stdout.resume()
  const exit = once(child, 'close')
  assert.equal(await opened.promise, 'composed-workspace')
  assert.equal(child.exitCode, null)
  allowOpen.resolve()
  assert.equal((await exit)[0], 0, stderr)
  await client.dispose()
  await fiber.dispose()
  assert.equal((await send('/api/plugins/azazo1-open-dir/next?target=web')).status, 404)
  assert.deepEqual(await readdir(join(home, 'runtime', 'dsh-open-dir')), [])
})
