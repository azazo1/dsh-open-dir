import type { Ack, Delivery, Log, OpenRequest, OpenResult, Target } from '../shared/protocol.ts';
/** 所有窗口共享一条串行队列, 请求只交给一个前端, 失败后不自动重放导航. */
export declare class Broker {
    private readonly log;
    private readonly pollMs;
    private readonly pending;
    private readonly waiters;
    private readonly presence;
    private closed;
    get targets(): Target[];
    constructor(log: Log, pollMs?: number);
    submit(request: OpenRequest, signal: AbortSignal): Promise<OpenResult>;
    poll(target: Target, signal: AbortSignal): Promise<Delivery | null>;
    acknowledge(ack: Ack): boolean;
    dispose(): void;
    private dispatch;
    private finish;
}
