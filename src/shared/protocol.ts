export const PACKAGE_NAME = 'dsh-open-dir'
export const API = '/api/plugins/azazo1-open-dir'
export const PROTOCOL_VERSION = 1
export type Target = 'desktop' | 'web'
export interface OpenRequest { id: string; path: string; target: Target; deadline: number }
export interface Delivery extends OpenRequest { lease: string }
export type OpenResult = { ok: true; workspaceId: string; path: string } | { ok: false; error: string }
export interface Ack { id: string; lease: string; result: OpenResult }
export interface Endpoint { version: 1; instance: string; pid: number; port: number; token: string }
export interface Log {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function isResult(value: unknown): value is OpenResult {
  return record(value) && (value.ok === true
    ? typeof value.workspaceId === 'string' && typeof value.path === 'string'
    : value.ok === false && typeof value.error === 'string')
}
export function isDelivery(value: unknown): value is Delivery {
  return record(value) && typeof value.id === 'string' && typeof value.path === 'string'
    && (value.target === 'desktop' || value.target === 'web') && typeof value.lease === 'string'
    && typeof value.deadline === 'number' && Number.isFinite(value.deadline)
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
