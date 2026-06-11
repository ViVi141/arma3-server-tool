export interface ModMeta {
  workshopId: number;
  name: string;
  path: string;
  enabled: boolean;
  isServerMod: boolean;
  bikeyPresent?: boolean;
  sizeBytes?: number;
}

export interface ModScanResult {
  mods: ModMeta[];
  error?: string;
}
