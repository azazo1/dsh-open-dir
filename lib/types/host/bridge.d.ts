import { Broker } from './broker.ts';
import { type Endpoint, type Log } from '../shared/protocol.ts';
/** CLI 专用回环接口, 不允许浏览器跨源访问, 不借用用户浏览器 Cookie. */
export declare function startBridge(broker: Broker, directory: string, log: Log): Promise<{
    endpoint: Endpoint;
    dispose(): Promise<void>;
}>;
