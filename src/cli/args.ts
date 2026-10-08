import { realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expandHomePath } from '@deepseek-ai/dsh-home-paths'
import type { Target } from '../shared/protocol.ts'

export const HELP = `用法: dsh-open [选项] [目录]

省略目录时打开当前目录, 成功退出前等待 DSH 界面完成工作区导航.

选项:
  --target desktop|web  选择界面, 默认 desktop
  --instance <ID>       选择具体 Host 实例, 有多个实例时使用
  --timeout <秒>        总等待时间, 默认 30, 范围 1..300
  --no-launch           不唤起 Desktop, 连接已经运行的实例
  --verbose             输出阶段和诊断日志
  --help, -h            显示帮助
  --version             显示 CLI 版本
  --                    后面的参数按目录处理

示例:
  dsh-open .
  dsh-open ~/projects/my-project
  dsh-open --target web --no-launch .
`
export interface Options { path: string; target: Target; timeout: number; launch: boolean; instance?: string; verbose: boolean; action: 'open' | 'help' | 'version' }
export function parseArgs(args: string[]): Options {
  const result: Options = { path: '.', target: 'desktop', timeout: 30_000, launch: true, verbose: false, action: 'open' }
  let positional = false
  let literal = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    const take = () => { const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少参数`); return value }
    if (!literal && arg === '--') { literal = true; continue }
    if (!literal && ['--help', '-h'].includes(arg)) { result.action = 'help'; continue }
    if (!literal && arg === '--version') { result.action = 'version'; continue }
    if (!literal && arg === '--verbose') { result.verbose = true; continue }
    if (!literal && arg === '--no-launch') { result.launch = false; continue }
    if (!literal && arg === '--target') {
      const value = take()
      if (value !== 'desktop' && value !== 'web') throw new Error('--target 只能是 desktop 或 web')
      result.target = value
      continue
    }
    if (!literal && arg === '--instance') {
      const value = take()
      if (!/^[a-f0-9-]{36}$/.test(value)) throw new Error('--instance 需要 Host 实例 UUID')
      result.instance = value
      continue
    }
    if (!literal && arg === '--timeout') {
      const value = take()
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 300) throw new Error('--timeout 需要 1..300 的整数秒数')
      result.timeout = Number(value) * 1000
      continue
    }
    if (!literal && arg.startsWith('-')) throw new Error(`未知选项 ${arg}, 使用 --help 查看用法`)
    if (positional) throw new Error('一次只能打开一个目录')
    result.path = arg
    positional = true
  }
  return result
}
export async function canonicalDirectory(path: string): Promise<string> {
  const canonical = await realpath(resolve(expandHomePath(path)))
  if (!(await stat(canonical)).isDirectory()) throw new Error('目标路径不是目录')
  return canonical
}
