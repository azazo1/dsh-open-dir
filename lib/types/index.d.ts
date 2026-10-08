import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-open-dir";
export declare const inject: string[];
/** 挂载认证过的 Client 路由和独立的 CLI 回环桥. */
export declare function apply(ctx: Context): Promise<void>;
