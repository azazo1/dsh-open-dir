import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/** 只用固定协议地址唤起 Desktop, 目录不进入 shell 命令或协议 URL. */
export async function wakeDesktop(signal: AbortSignal): Promise<void> {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open'
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', 'dsh://open'] : ['dsh://open']
  await promisify(execFile)(command, args, { signal, timeout: 10_000, windowsHide: true })
}
