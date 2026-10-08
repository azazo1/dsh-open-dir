import type { Log } from '../shared/protocol.ts';
/** CLI 日志统一带阶段级别, NODE_DEBUG=dsh-open 或 --verbose 可开启细节. */
export declare function cliLog(verbose: boolean): Log;
