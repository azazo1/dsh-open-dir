import { type Endpoint, type Log, type Target } from '../shared/protocol.ts';
export declare function address(endpoint: Endpoint, route: string): string;
export declare function authorization(endpoint: Endpoint): Record<string, string>;
/** 只读取本插件的发现记录, 通过身份握手忽略崩溃后留下的过期文件. */
export declare function discover(directory: string, target: Target, instance: string | undefined, signal: AbortSignal, log: Log): Promise<Endpoint[]>;
export declare function waitForEndpoint(directory: string, target: Target, instance: string | undefined, signal: AbortSignal, log: Log): Promise<Endpoint>;
