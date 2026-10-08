import { inject, runClient, type ClientContext } from './runner.ts'
import { PACKAGE_NAME, errorMessage } from '../shared/protocol.ts'

interface Loader { load(entry: { id: string; factory: (require: (id: string) => unknown) => { inject: string[]; apply(ctx: ClientContext): void } }): void }

;(window as unknown as { __ModuleLoader__: Loader }).__ModuleLoader__.load({
  id: PACKAGE_NAME,
  factory: () => ({
    inject,
    apply(ctx) {
      const target = location.protocol === 'dsh-app:' ? 'desktop' : 'web'
      ctx.effect(() => {
        const lifetime = new AbortController()
        ctx.logger.info('目录打开通道已启动, target=%s', target)
        void runClient(ctx, target, lifetime.signal, ctx.logger).catch(error => ctx.logger.error('目录打开通道异常退出: %s', errorMessage(error)))
        return () => lifetime.abort()
      }, 'dsh-open-dir: client request loop')
    },
  }),
})
