export declare const PACKAGE_NAME = "dsh-open-dir";
export declare const API = "/api/plugins/azazo1-open-dir";
export declare const PROTOCOL_VERSION = 1;
export type Target = 'desktop' | 'web';
export interface OpenRequest {
    id: string;
    path: string;
    target: Target;
    deadline: number;
}
export interface Delivery extends OpenRequest {
    lease: string;
}
export type OpenResult = {
    ok: true;
    workspaceId: string;
    path: string;
} | {
    ok: false;
    error: string;
};
export interface Ack {
    id: string;
    lease: string;
    result: OpenResult;
}
export interface Endpoint {
    version: 1;
    instance: string;
    pid: number;
    port: number;
    token: string;
}
export interface Log {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
export declare function record(value: unknown): value is Record<string, unknown>;
export declare function isResult(value: unknown): value is OpenResult;
export declare function isDelivery(value: unknown): value is Delivery;
export declare function errorMessage(error: unknown): string;
