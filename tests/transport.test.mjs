import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { realpath, writeFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { log, sandbox, source } from './helpers.mjs'

const { Broker } = await source('src/host/broker.ts', await sandbox('http-broker'))
const { startBridge } = await source('src/host/bridge.ts', await sandbox('http-bridge'))
const { discover } = await source('src/cli/discovery.ts', await sandbox('discovery'))
const { parseArgs, canonicalDirectory } = await source('src/cli/args.ts', await sandbox('args'))

function cli(args, home) {
  const child = spawn(process.execPath, [resolve('lib/cli.js'), ...args], { env: { ...process.env, DSH_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''; let stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  const result = once(child, 'close').then(([code]) => ({ code, stdout, stderr }))
  return { child, result }
}

test('本地接口拒绝未认证和浏览器跨源请求, 发布记录只保留本实例', async t => {
  const directory = await sandbox('http')
  const broker = new Broker(log)
  const bridge = await startBridge(broker, directory, log)
  t.after(() => bridge.dispose())
  const base = `http://127.0.0.1:${bridge.endpoint.port}`
  assert.equal((await fetch(`${base}/health`)).status, 403)
  const headers = { Authorization: `Bearer ${bridge.endpoint.token}` }
  assert.equal((await fetch(`${base}/health`, { headers: { ...headers, Origin: 'http://malicious.invalid' } })).status, 403)
  const body = { id: randomUUID(), target: 'desktop', path: './relative', deadline: Date.now() + 1000 }
  assert.equal((await fetch(`${base}/open`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 400)
  const health = await (await fetch(`${base}/health`, { headers })).json()
  assert.equal(health.instance, bridge.endpoint.instance)
  await writeFile(join(directory, 'unrelated.txt'), 'keep')
  await bridge.dispose()
  assert.deepEqual(await readdir(directory), ['unrelated.txt'])
})

test('实际 CLI 进程通过发现和 HTTP 提交, 只有 ACK 后才成功退出', async t => {
  const home = await sandbox('cli-home')
  const directory = join(home, 'runtime', 'dsh-open-dir')
  const broker = new Broker(log)
  const bridge = await startBridge(broker, directory, log)
  t.after(() => bridge.dispose())
  const poll = broker.poll('web', new AbortController().signal)
  const running = cli(['--target', 'web', '--no-launch', '--timeout', '5', '.'], home)
  t.after(() => { if (running.child.exitCode === null) running.child.kill() })
  const delivery = await poll
  assert.equal(delivery.path, await realpath(process.cwd()))
  assert.equal(running.child.exitCode, null)
  assert.equal(broker.acknowledge({ id: delivery.id, lease: delivery.lease, result: { ok: true, workspaceId: 'workspace-one', path: delivery.path } }), true)
  const result = await running.result
  assert.equal(result.code, 0, result.stderr)
  assert.ok(result.stdout.includes(delivery.path))
})

test('发现握手排除其他目标和伪造实例, 多实例保持显式选择', async t => {
  const directory = await sandbox('multi')
  const one = new Broker(log)
  const two = new Broker(log)
  const first = await startBridge(one, directory, log)
  const second = await startBridge(two, directory, log)
  t.after(() => Promise.all([first.dispose(), second.dispose()]))
  const cancel = new AbortController()
  one.poll('web', cancel.signal)
  two.poll('web', cancel.signal)
  assert.equal((await discover(directory, 'desktop', undefined, cancel.signal, log)).length, 0)
  assert.equal((await discover(directory, 'web', undefined, cancel.signal, log)).length, 2)
  assert.equal((await discover(directory, 'web', first.endpoint.instance, cancel.signal, log))[0].instance, first.endpoint.instance)
  const fake = { ...first.endpoint, instance: randomUUID() }
  await writeFile(join(directory, `${fake.instance}.json`), JSON.stringify(fake), { mode: 0o600 })
  assert.equal((await discover(directory, 'web', undefined, cancel.signal, log)).length, 2)
  cancel.abort()
})

test('CLI 错误路径和未就绪界面非零退出, 参数边界得到验证', async () => {
  const home = await sandbox('no-host')
  const invalid = await cli(['--no-launch', join(home, 'absent')], home).result
  assert.notEqual(invalid.code, 0)
  const timeout = await cli(['--no-launch', '--timeout', '1', '.'], home).result
  assert.notEqual(timeout.code, 0)
  assert.equal(parseArgs(['--', '-directory']).path, '-directory')
  assert.throws(() => parseArgs(['--timeout', 'NaN']))
  assert.throws(() => parseArgs(['--target', 'other']))
  assert.throws(() => parseArgs(['one', 'two']))
  const file = join(home, 'file.txt')
  await writeFile(file, 'data')
  await assert.rejects(() => canonicalDirectory(file))
})
