export type ModBikeyStatus =
  | "unsigned" | "partial" | "no_key" | "not_copied" | "key_mismatch"
  | "ready" | "unknown" | "read_error";

/** 文件证据，不执行密码学验证，也不证明客户端可以加入。 */
export interface ModSignatureEvidence {
  checkedAt: string;
  pboCount: number;
  signedPboCount: number;
  missingPbos: string[];
  keyCount: number;
  deployedKeyCount: number;
  missingKeys: string[];
  mismatchedKeys: string[];
  readErrors: string[];
  canDeployKeys: boolean;
  reason: string;
  cryptographicVerified: false;
}

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
  signatureEvidence?: ModSignatureEvidence;
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
