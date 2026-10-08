import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** 按 DSH_HOME 隔离发现信息, 不绑定任何 profile 或宿主端口. */
export function runtimeDirectory(): string {
  return join(resolveDshHome(), 'runtime', 'dsh-open-dir')
}
