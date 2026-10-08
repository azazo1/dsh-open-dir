import { debuglog, format } from 'node:util'
import { channel } from 'node:diagnostics_channel'
import type { Log } from '../shared/protocol.ts'

const diagnostic = channel('dsh-open-dir/cli-log')
const debug = debuglog('dsh-open')
/** CLI 日志统一带阶段级别, NODE_DEBUG=dsh-open 或 --verbose 可开启细节. */
export function cliLog(verbose: boolean): Log {
  const write = (level: string, message: string, args: unknown[]) => {
    const text = format(message, ...args)
    diagnostic.publish({ level, message: text, time: Date.now() })
    if (verbose || level === 'warn' || level === 'error') process.stderr.write(`[${level}] ${text}\n`)
    else debug('[%s] %s', level, text)
  }
  return {
    debug: (message, ...args) => write('debug', message, args),
    info: (message, ...args) => write('info', message, args),
    warn: (message, ...args) => write('warn', message, args),
    error: (message, ...args) => write('error', message, args),
  }
}
