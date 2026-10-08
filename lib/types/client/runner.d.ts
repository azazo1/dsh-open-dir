import type { Context } from '@deepseek-ai/cordis';
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/types';
/** 仅声明本插件使用的服务方法, 数据类型仍取自官方 API, 不引入整套 UI 槽位声明. */
export interface NavigationServices {
    workspaces: {
        create(input: {
            path: string;
        }): Promise<WorkspaceView>;
    };
    uiWorkspace: {
        openWorkspace(id: WorkspaceId, beforeOpen?: () => void): Promise<void>;
    };
}
export type ClientContext = Context & NavigationServices;
import { type Delivery, type Log, type OpenResult, type Target } from '../shared/protocol.ts';
export declare const inject: string[];
/** 通过宿主 API 复用工作区, 并检测 openWorkspace 被其他导航取消的情况. */
export declare function navigate(ctx: NavigationServices, delivery: Delivery, signal: AbortSignal): Promise<OpenResult>;
/** 长轮询只通过同源认证接口, Desktop 的 dsh-app 协议由宿主转发. */
export declare function runClient(ctx: NavigationServices, target: Target, signal: AbortSignal, log: Log, send?: typeof fetch): Promise<void>;
