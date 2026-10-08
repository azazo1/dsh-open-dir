#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { HELP, canonicalDirectory, parseArgs } from './args.ts'
import { cliLog } from './log.ts'
import { wakeDesktop } from './launch.ts'
import { address, authorization, waitForEndpoint } from './discovery.ts'
import { runtimeDirectory } from '../shared/paths.ts'
import { errorMessage, isResult } from '../shared/protocol.ts'
declare const __DSH_OPEN_VERSION__: string

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.action === 'help') { process.stdout.write(HELP); return }
  if (options.action === 'version') { process.stdout.write(`${__DSH_OPEN_VERSION__}\n`); return }
  const log = cliLog(options.verbose)
  const path = await canonicalDirectory(options.path)
  const startedAt = Date.now()
  const deadline = startedAt + options.timeout
  const cancel = new AbortController()
  const timeout = AbortSignal.timeout(options.timeout)
  const signal = AbortSignal.any([cancel.signal, timeout])
  const interrupt = () => cancel.abort(new Error('打开请求已取消'))
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    log.info('目标目录已验证: %s', path)
    if (options.target === 'desktop' && options.launch) {
      log.info('唤起 Desktop')
      try { await wakeDesktop(signal) }
      catch (error) { throw new Error(`无法唤起 Desktop: ${errorMessage(error)}. 可先手动打开 Desktop, 再用 --no-launch 重试`) }
    }
    const endpoint = await waitForEndpoint(runtimeDirectory(), options.target, options.instance, signal, log)
    const id = randomUUID()
    log.info('向 Host 提交打开请求, instance=%s, request=%s', endpoint.instance, id)
    const response = await fetch(address(endpoint, '/open'), {
      method: 'POST', signal, redirect: 'error',
      headers: { ...authorization(endpoint), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, path, target: options.target, deadline }),
    })
    const result: unknown = await response.json()
    if (!isResult(result)) throw new Error(`Host 返回了不合法的结果: HTTP ${response.status}`)
    if (!result.ok) throw new Error(result.error)
    if (!response.ok) throw new Error(`Host 确认失败: HTTP ${response.status}`)
    log.info('界面导航完成, workspace=%s, 耗时=%sms', result.workspaceId, Date.now() - startedAt)
    process.stdout.write(`已打开工作区: ${result.path}\n`)
  } catch (error) {
    if (timeout.aborted) throw new Error(`等待 ${options.timeout / 1000}s 后超时. 请确认 ${options.target} 已启动, 已安装并启用 dsh-open-dir, 且界面已经加载. CLI 和宿主必须使用相同的 DSH_HOME`)
    if (cancel.signal.aborted) { process.exitCode = 130; throw cancel.signal.reason }
    throw error
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
  }
}
main().catch(error => { cliLog(false).error('%s', errorMessage(error)); process.exitCode ||= 1 })
