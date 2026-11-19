import type { ComputedRef, InjectionKey, Ref } from "vue";

export interface ConsoleActionsContext {
  execAction: (action: string) => Promise<boolean>;
  execSave: () => Promise<void>;
  execApplyChanges: () => Promise<boolean>;
  /** 模组等页面即时保存后，刷新外壳的「需写入/已写入」状态。 */
  refreshSync: () => Promise<void>;
  isRunning: Ref<boolean>;
  hasDirtyChanges: Ref<boolean>;
  instanceLabel: ComputedRef<string>;
  cfgWritten: ComputedRef<boolean>;
  openWizard: () => void;
}

export const CONSOLE_ACTIONS_KEY: InjectionKey<ConsoleActionsContext> = Symbol("consoleActions");
