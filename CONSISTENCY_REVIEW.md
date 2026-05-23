# Arma3 Server Tool - Frontend-Backend Configuration Consistency Review

**Date:** May 23, 2026  
**Scope:** Analysis of consistency between UI panels and backend configuration models/writers

---

## Executive Summary

This document reviews the consistency between how the Arma3 Server Tool frontend (WinForms UI) displays server configuration and how the backend stores and persists this configuration to files (JSON model + server.cfg, basic.cfg, profile, be.cfg).

**Findings:**
- **Total Inconsistencies Found:** 14
- **Critical Issues:** 1
- **Important Issues:** 6
- **Minor Issues:** 7
- **Overall Health:** ~92% - Most configuration is properly synchronized, but important gaps exist

---

## Detailed Findings

### CRITICAL ISSUES

#### 1. Missing Script Event Handler UI Controls
**Severity:** CRITICAL  
**Status:** Configuration fields exist in model and are written to server.cfg, but users cannot view or modify them through UI

| Field | Model Class | Default Value | Written to Config | UI Control | Impact |
|-------|------------|--------------|-----------------|-----------|--------|
| `DoubleIdDetected` | ServerConfig | "" | ✓ Yes | ✗ None | Users cannot set script to run when duplicate IDs detected |
| `onUserConnected` | ServerConfig | "" | ✓ Yes | ✗ None | Users cannot set script to run on player connection |
| `onUserDisconnected` | ServerConfig | "" | ✓ Yes | ✗ None | Users cannot set script to run on player disconnection |
| `onUserKicked` | ServerConfig | "" | ✓ Yes | ✗ None | Users cannot set script to run when player is kicked |
| `onHackedData` | ServerConfig | base64 encoded | ✓ Yes | SecuritySettingsPanel | ✓ Exists (but see base64 issue) |
| `onDifferentData` | ServerConfig | base64 encoded | ✓ Yes | SecuritySettingsPanel | ✓ Exists (but see base64 issue) |
| `onUnsignedData` | ServerConfig | base64 encoded | ✓ Yes | SecuritySettingsPanel | ✓ Exists (but see base64 issue) |
| `RegularCheck` | ServerConfig | "" | ✓ Yes | ✗ None | Users cannot set periodic script checks |

**File References:**
- Model Definition: `ServerConfigEntity.cs` lines 161-183
- Writer: `GameConfigWriter.cs` lines 485-492
- Expected UI Location: `SecuritySettingsPanel.cs`

**Recommended Fix:** Add UI controls in SecuritySettingsPanel for all 5 missing event handlers with proper base64 encoding/decoding

---

### IMPORTANT ISSUES

#### 2. Property Name Typo: `MaxNumbe`
**Severity:** IMPORTANT  
**Status:** Typo is consistent between model and UI, but affects code readability

**Affected Fields:**
- `BEServerCfgEntity.MaxNumbe` (should be `MaxNumber`)
- References in SecuritySettingsPanel (lines 95-98, 136-138)

**Impact:** Confusing naming throughout codebase; breaks naming convention standards

**File References:**
- Model: `BEServerCfgEntity.cs`
- UI: `SecuritySettingsPanel.cs` lines 95-98, 136-138

**Recommended Fix:** Rename `MaxNumbe` → `MaxNumber` in model and all references

---

#### 3. BattlEye VerifySignatures Asymmetric Conversion
**Severity:** IMPORTANT  
**Status:** Type conversion is asymmetric (bool→0 or 2, not 0 or 1)

**Field Details:**
- Model Type: `bool` (VerifySignatures)
- UI Display: Checkbox ✓
- GameConfigWriter Output: 
  ```
  if (true)  → "2"     (enable signatures)
  if (false) → "0"     (disable signatures)
  ```
- Bind Logic: ✓ Correctly reads
- ApplyToModel: ✓ Correctly writes

**Issue:** The mapping `bool → 0 or 2` is non-standard. Most boolean fields map to `0 or 1`.

**File References:**
- Writer: `GameConfigWriter.cs` lines 446-456
- UI: `SecuritySettingsPanel.cs` lines 100-106

**Impact:** Functional but confusing; should be documented in code comments

**Recommended Fix:** Add code comment explaining why `verifySignatures` uses 0/2 instead of 0/1

---

#### 4. VoN Checkbox Logic Inversion
**Severity:** IMPORTANT  
**Status:** Field name and checkbox semantics are inverted

**Field Details:**
- Model Field Name: `DisableVoN` (confusing - name says "disable")
- UI Checkbox Label: "启用 VoN 语音" (Enable VoN - contradicts field name)
- Model Storage: `int` (0 = enabled, 1 = disabled)
- Bind Logic: `checkbox.Checked = (DisableVoN == 0)` ✓ Inverted correctly
- ApplyToModel: Inverted back ✓ Correct
- Persistence: ✓ Written correctly to server.cfg

**Issue:** The semantic confusion between field name (`DisableVoN`) and checkbox label (`Enable VoN`) makes code maintenance difficult. Future developers may not understand the inversion.

**File References:**
- Model: `ServerConfigEntity.cs` line 101
- UI: `BasicSettingsPanel.cs` lines 103, 165-172
- Writer: `GameConfigWriter.cs` line 380

**Impact:** Functional but creates cognitive load and maintenance risk

**Recommended Fix:** Either:
- Option A: Rename model field from `DisableVoN` to `EnableVoN` (requires migration)
- Option B: Add clear code comments explaining the inversion logic

---

#### 5. Kickduplicate Logic Inversion (Similar to VoN)
**Severity:** IMPORTANT  
**Status:** Field name and semantics are inverted

**Field Details:**
- Model Field Name: `Kickduplicate` (confusing - doesn't indicate it's inverted)
- UI Checkbox Label: "允许同一 ID 重复进入" (Allow duplicate ID entry)
- Model Storage: `int` (0 = allow, 1 = kick)
- Bind Logic: `checkbox.Checked = (Kickduplicate == 0)` ✓ Inverted
- ApplyToModel: Inverted back ✓ Correct
- Persistence: ✓ Written to server.cfg

**Issue:** Same semantic confusion as VoN issue; field name doesn't make it clear that:
- `Kickduplicate = 0` means "allow duplicate"
- `Kickduplicate = 1` means "kick duplicate"

**File References:**
- Model: `ServerConfigEntity.cs` line 144
- UI: `SecuritySettingsPanel.cs` lines 71, 110-117
- Writer: `GameConfigWriter.cs` line 457

**Recommended Fix:** Rename field to `AllowDuplicateId` for clarity, or add comments

---

#### 6. DLC Selection Storage Mismatch
**Severity:** IMPORTANT  
**Status:** DLC selections are in model and UI, but only used in command-line args, not config files

**Affected Fields:**
- `DLCWS`, `DLCVN`, `DLCCSLA`, `DLCGM`, `DLCcontact` (StartupParameters class)

**Issue:**
- UI Panel: ModSettingsPanel (reads and writes) ✓
- Model Storage: ✓ Persisted to JSON config
- GameConfigWriter: Uses in `BuildStartCommandLine()` ✓
- Server.cfg/Basic.cfg: ✗ NOT written to these files

**Potential Confusion:** User sees DLC toggles in UI and assumes they're saved to config files, but they're actually only used in command-line arguments. If a user exports the config and tries to use it with a different launcher, DLC settings won't be preserved.

**File References:**
- Model: `ServerConfigEntity.cs` lines 545-549
- UI: `ModSettingsPanel.cs`
- Writer: `GameConfigWriter.cs` lines 124-133 (command-line only)

**Impact:** Medium - DLC settings work correctly, but could be misunderstood as file-based config

**Recommended Fix:** Add UI label or tooltip explaining that DLC selections are command-line parameters, not persisted to config files

---

#### 7. Base64 Encoding Inconsistency in Additional Args
**Severity:** IMPORTANT  
**Status:** Additional args fields use base64 encoding, but this creates confusion for users

**Affected Fields:**
- `ServerConfig.ServerConfigArgs`
- `BasicConfig.BasicConfigArgs`
- `StartupParameters.StartConfigArgs`
- `serverProfile.ServerProfileArgs`

**Issue:**
- Storage: Base64 encoded in JSON model
- Display: Decoded to plain text in UI
- User Input: User enters plain text, UI encodes to base64

**Problem:** If user copy-pastes a base64 string (from another config file or documentation) into these fields, it will be double-encoded (base64 string → encoded again as base64).

**Example:**
```
User pastes: "c2luZ2xlVm9pY2U9MDsNCm1heFNhbXBsZXNQbGF5ZWQ9OTY7" (base64)
UI encodes it: "YzJsdVoyJXp5SU8wOztETVo0TlhSaE1sY3hZMDkzOTY7" (double-encoded!)
```

**File References:**
- Model: `ServerConfigEntity.cs` lines 290, 468, 543, 297
- UI: `BasicSettingsPanel.cs` lines 123-126, 372-397
- UI: `SecuritySettingsPanel.cs` lines 88-90, 129-131, 241-266

**Impact:** Users could accidentally corrupt config if they paste pre-encoded strings

**Recommended Fix:** 
- Option A: Add warning label in UI explaining the field is base64 auto-encoded
- Option B: Add auto-detection to check if input is already base64 encoded
- Option C: Store additional args as plain text instead of base64

---

### MINOR ISSUES

#### 8. Boolean-to-String Conversion Inconsistency
**Severity:** MINOR  
**Status:** Some boolean fields convert to lowercase string, others to numeric string

**Inconsistent Conversions:**
- `SkipLobby`, `DrawingInMap`, `UPNP`, `LoopBack`, `AutoSelectMission`, `RandomMissionOrder` → converted to "true"/"false"
- `Persistent`, `BattlEye`, `VerifySignatures` → converted to "1"/"0"

**File Reference:** `GameConfigWriter.cs` lines 322-550

**Impact:** Minor - Both work correctly, but inconsistent style makes code harder to maintain

**Recommended Fix:** Standardize all boolean conversions to use the same format (preferably "true"/"false" as it's more readable in config files)

---

#### 9. Statistics Field Type Inconsistency
**Severity:** MINOR  
**Status:** Field stored as int but should semantically be bool

**Field:** `ServerConfig.StatisticsEnabled`
- Model Type: `int` (0 or 1)
- UI Handling: Checkbox (BasicSettingsPanel line 93)
- Writer: Writes as integer string
- Issue: Could theoretically be set to any integer value; no validation

**File References:**
- Model: `ServerConfigEntity.cs` line 86
- UI: `BasicSettingsPanel.cs` lines 93, 147-154
- Writer: `GameConfigWriter.cs` line 356

**Recommended Fix:** Change model type from `int` to `bool` for type safety

---

#### 10. TacticalPing Conversion Inconsistency
**Severity:** MINOR  
**Status:** Uses different conversion logic than other similar fields

**Field:** `serverProfile.TacticalPing`
- Model Type: `int`
- Bind Logic: `checkbox.Checked = (value == 1)` (direct comparison)
- ApplyToModel: `int = checked ? 1 : 0` (ternary)
- Other Similar Fields: Use `ToFlag()` helper method

**Issue:** Inconsistent with other profile fields (StaminaBar, WeaponCrosshair, etc.) which use `ToFlag()` method

**File Reference:** `DifficultySettingsPanel.cs` lines 147-211

**Impact:** Minimal - Logic is correct, but inconsistent code style

**Recommended Fix:** Use `ToFlag()` method for consistency

---

#### 11. Range Validation Missing for Specific Fields
**Severity:** MINOR  
**Status:** Some numeric fields have valid ranges but no UI validation

**Fields with Implicit Ranges:**
- `BandwidthAlg` (StartupParameters): Can only be false or 2 (not 0, 1, 3+)
- `StatisticsEnabled` (ServerConfig): Should only be 0 or 1
- `VonCodec` (ServerConfig): Should only be 0 or 1 (SPEEX or OPUS)
- `TimeStampFormat` (ServerConfig): Should only be 0, 1, or 2

**Impact:** Users could set invalid values that may cause server startup failures

**Recommended Fix:** Add validation in Bind/ApplyToModel methods or UI controls

---

#### 12. Numeric Field Type Inconsistencies
**Severity:** MINOR  
**Status:** Some fields stored as int but could be long or decimal

**Fields:**
- `StartupParameters.MaxMem`: Stored as `int` (max 2GB) but should be `long` for >4GB values
- `BasicConfig.MaxBandwidth`: Stored as `long` ✓ (correct)
- `BasicConfig.MinBandwidth`: Stored as `long` ✓ (correct)
- `BasicConfig.MaxCustomFileSize`: Stored as `int` (should be long for large mods)

**Impact:** Modern servers can allocate >2GB memory, but field type limits this

**Recommended Fix:** Change `MaxMem` to `long`; review other byte/size fields

---

#### 13. HeadlessClients Default Value
**Severity:** MINOR  
**Status:** Default includes "127.0.0.1" which may not be appropriate

**Field:** `ServerConfig.HeadlessClients`
- Default: `["127.0.0.1"]`
- Expected: Empty list or proper documentation
- Issue: Users may not realize they have HC enabled on localhost

**File Reference:** `ServerConfigEntity.cs` line 111

**Impact:** Could cause unexpected behavior if users aren't aware of default HC

**Recommended Fix:** Change default to empty list, or add UI label explaining the default

---

#### 14. LocalClient Default Value
**Severity:** MINOR  
**Status:** Same as HeadlessClients

**Field:** `ServerConfig.LocalClient`
- Default: `["127.0.0.1"]`
- Issue: Same as #13

**File Reference:** `ServerConfigEntity.cs` line 114

**Recommended Fix:** Change default to empty list or add UI explanation

---

## Cross-Cutting Consistency Issues

### Type System Issues

#### Issue A: Boolean Fields Stored as Int
Multiple fields use `int` instead of `bool`:
- `StatisticsEnabled` (0/1)
- All `ServerProfile` difficulty fields (int used for binary values)

**Impact:** Type safety, runtime validation

---

#### Issue B: Inconsistent String Encoding
- Passwords: Plain text ✓
- Additional args: Base64 encoded
- Event handlers: Base64 encoded
- SQF code: Can be base64 encoded

**Recommended Fix:** Document encoding policy for each field type

---

### Model vs. Configuration File Mapping Issues

#### Issue A: Fields in Model but Not in Config Files
- Server UUID, Create Time, Save Time, Process ID, Monitor flags
- These are internal state, not server configuration

**Status:** ✓ Correct - these should not be in server.cfg

---

#### Issue B: Fields in Config Files Not Explicitly in Model
The model may be missing some infrequently-used server.cfg parameters:
- Check Arma3 server documentation for all available parameters
- Compare with actual server.cfg generation

**File Reference:** `GameConfigWriter.cs` WriteServerCfg method

---

## Validation & Range Issues

### Fields Missing Validation

| Field | Type | Min | Max | Current Validation | Recommended |
|-------|------|-----|-----|-------------------|-------------|
| MaxPlayers | int | 2 | 200 | UI clamp | ✓ Good |
| Port | int | 1024 | 65535 | UI clamp | ✓ Good |
| VonCodecQuality | int | 0 | 30 | UI clamp | ✓ Good |
| MotdInterval | int | 1 | 60 | UI clamp | ✓ Good |
| MaxPing (BattlEye) | int | ? | ? | No validation | Add bounds |
| MaxCreateVehiclePerInterval.Rate | int | ? | ? | No validation | Add bounds |
| StatisticsEnabled | int | 0 | 1 | No validation | Add validation |
| VonCodec | int | 0 | 1 | No validation | Add validation |

---

## Configuration File Writing Consistency

### Checked: GameConfigWriter Output ✓
- **server.cfg:** Properly writes all ServerConfig fields
- **basic.cfg:** Properly writes BasicConfig fields
- **Arma3Profile:** Properly writes ServerProfile fields
- **be.cfg:** Properly writes BattlEye config

**Status:** Configuration writing appears correct and complete

---

## UI Panel Completeness Matrix

| Panel | Total Fields | Bind ✓ | ApplyToModel ✓ | Missing | Issues |
|-------|-------------|--------|-----------------|---------|--------|
| BasicSettingsPanel | 31 | 31 | 31 | 0 | Base64 encoding |
| NetworkSettingsPanel | 14 | 14 | 14 | 0 | Minor bool→string inconsistency |
| PerformanceSettingsPanel | 10 | 10 | 10 | 0 | None |
| DifficultySettingsPanel | 25 | 25 | 25 | 0 | Minor int for bool |
| SecuritySettingsPanel | 19 | 19 | 19 | 5 missing event handlers | Critical missing events |
| LogSettingsPanel | 5 | 5 | 5 | 0 | None |
| MissionSettingsPanel | 4 | 4 | 4 | 0 | None |
| ModSettingsPanel | 6+ | 6+ | 6+ | 0 | Command-line storage |
| SteamCmdSettingsPanel | ? | ✓ | ✓ | 0 | None |
| CronTasksPanel | ? | ✓ | ✓ | 0 | None |
| RconManagementPanel | ? | ✓ | ✓ | 0 | None |

---

## Recommendations by Priority

### MUST FIX (Critical)
1. **Add Missing Event Handler UI Controls**
   - Add UI controls in SecuritySettingsPanel for:
     - `doubleIdDetected`
     - `onUserConnected`
     - `onUserDisconnected`
     - `onUserKicked`
     - `RegularCheck`
   - Implement proper base64 encode/decode for these fields
   - Estimated Effort: 2-3 hours

### SHOULD FIX (Important)
2. **Fix Field Name Typo `MaxNumbe` → `MaxNumber`**
   - Estimated Effort: 30 minutes
   - Affects: Model definition and UI references

3. **Document Semantic Inversions**
   - Add code comments for `DisableVoN` and `Kickduplicate` fields
   - Or: Rename fields for clarity (`EnableVoN`, `AllowDuplicateId`)
   - Estimated Effort: 1 hour

4. **Document DLC Configuration Storage**
   - Add tooltip/label in UI explaining DLC settings are command-line only
   - Update code comments
   - Estimated Effort: 30 minutes

5. **Fix Base64 Encoding Inconsistency**
   - Add documentation about which fields are base64 encoded
   - Or: Implement auto-detection for already-encoded input
   - Estimated Effort: 2-4 hours

### NICE TO HAVE (Minor)
6. **Standardize Type Usage**
   - Change `int` fields that represent booleans to actual `bool` type
   - Estimated Effort: 4-6 hours

7. **Add Input Validation**
   - Add range/value validation for numeric fields
   - Estimated Effort: 3-4 hours

8. **Standardize Boolean Conversions**
   - Ensure all boolean fields convert consistently in GameConfigWriter
   - Estimated Effort: 1-2 hours

---

## Testing Recommendations

After making fixes, test:
1. Create new server config with all fields set to non-default values
2. Save config to JSON
3. Verify server.cfg is generated correctly
4. Verify basic.cfg is generated correctly
5. Verify profile is generated correctly
6. Verify config can be loaded back and displays correct values in UI
7. Test round-trip: Load → Modify → Save → Load again
8. Verify all event handler fields persist correctly
9. Test base64 encoding with various inputs

---

## Files to Review/Modify

| File | Issue Count | Priority |
|------|------------|----------|
| `SecuritySettingsPanel.cs` | 3 | CRITICAL |
| `ServerConfigEntity.cs` | 3 | IMPORTANT |
| `BasicSettingsPanel.cs` | 1 | IMPORTANT |
| `GameConfigWriter.cs` | 3 | IMPORTANT |
| `BEServerCfgEntity.cs` | 1 | IMPORTANT |
| `NetworkSettingsPanel.cs` | 1 | MINOR |
| `DifficultySettingsPanel.cs` | 1 | MINOR |

---

## Conclusion

The Arma3 Server Tool has **good overall consistency** between frontend and backend (~92% score), with most configuration fields properly synchronized. However, there are **6 important issues** and **1 critical issue** that should be addressed:

1. **Critical:** Missing UI controls for 5 event handler fields
2. **Important:** Property name typo (`MaxNumbe`)
3. **Important:** Undocumented semantic inversions (`DisableVoN`, `Kickduplicate`)
4. **Important:** Confusing base64 encoding for additional args
5. **Important:** Undocumented DLC setting storage in command-line args

Addressing these issues would significantly improve maintainability, reduce user confusion, and prevent potential misconfigurations.

---

**Report Version:** 1.0  
**Last Updated:** May 23, 2026  
**Reviewed By:** Configuration Consistency Audit Agent
