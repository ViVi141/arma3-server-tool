export interface ModMeta {
  workshopId: number;
  name: string;
  path: string;
  enabled: boolean;
  isServerMod: boolean;
  isClientMod?: boolean;
  isHcMod?: boolean;
  isLocalMod?: boolean;
  bikeyPresent?: boolean;
  sizeBytes?: number;
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
