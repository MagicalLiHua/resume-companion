import type { ActParams, ObserveParams, ResolvedActParams, UndoParams, WaitParams } from '../protocol.js';

export type DriverKind = 'devtools';
export type ProfileMode = 'dedicated' | 'isolated' | 'auto_connect';
export type DriverStatus = {
  kind: DriverKind;
  ready: boolean;
  connected: boolean;
  compatible: boolean;
  profile_mode: ProfileMode;
  permission_state: 'not_required' | 'unknown' | 'required' | 'granted';
  capabilities: Record<string, unknown>;
  message: string;
  [key: string]: unknown;
};
export type ListTabsInput = { current_window_only?: boolean; url_contains?: string };
export type ActivateTabInput = { tab_id: number };

export interface BrowserDriver {
  readonly kind: DriverKind;
  status(signal?: AbortSignal): Promise<DriverStatus>;
  listTabs(input: ListTabsInput, signal?: AbortSignal): Promise<unknown>;
  activateTab(input: ActivateTabInput, signal?: AbortSignal): Promise<unknown>;
  observe(input: ObserveParams, signal?: AbortSignal): Promise<unknown>;
  act(input: ResolvedActParams, signal?: AbortSignal): Promise<unknown>;
  wait(input: WaitParams, signal?: AbortSignal): Promise<unknown>;
  undo(input: UndoParams, signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}

export type BrowserMethod = 'tabs' | 'activate_tab' | 'observe' | 'act' | 'wait' | 'undo_operations';
export type BrowserMethodParams = ListTabsInput | ActivateTabInput | ObserveParams | ActParams | WaitParams | UndoParams;
