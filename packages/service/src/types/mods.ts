export type ModBikeyStatus = "unsigned" | "no_key" | "not_copied" | "ready";

export interface ModMeta {
  workshopId: number;
  name: string;
  dirName: string;
  path: string;
  enabled: boolean;
  isServerMod: boolean;
  isClientMod?: boolean;
  isHcMod?: boolean;
  isLocalMod?: boolean;
  inputLocalMod?: boolean;
  bikeyPresent?: boolean;
  bikeyStatus?: ModBikeyStatus;
  bikeyLabel?: string;
  scanOrder: number;
  sizeBytes?: number;
  updatedAt?: string;
  updatedTime?: string;
}

export interface LocalModEntry {
  path: string;
  name?: string;
  enabled?: boolean;
  isServerMod?: boolean;
  isClientMod?: boolean;
  isHcMod?: boolean;
}

export interface ModScanResult {
  mods: ModMeta[];
  error?: string;
}
