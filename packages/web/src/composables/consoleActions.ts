import type { ComputedRef, InjectionKey, Ref } from "vue";

export interface ConsoleActionsContext {
  execAction: (action: string) => Promise<void>;
  execSave: () => Promise<void>;
  isRunning: Ref<boolean>;
  hasDirtyChanges: Ref<boolean>;
  instanceLabel: ComputedRef<string>;
  cfgWritten: ComputedRef<boolean>;
  openWizard: () => void;
}

export const CONSOLE_ACTIONS_KEY: InjectionKey<ConsoleActionsContext> = Symbol("consoleActions");
