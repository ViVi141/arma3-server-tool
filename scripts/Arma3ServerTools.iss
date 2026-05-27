; Inno Setup script for Arma3 Server Tools.
; Compile via scripts/build-release.ps1 (generates _build-metadata.iss).

#include "_build-metadata.iss"

#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

#ifndef MyBuildStamp
  #define MyBuildStamp "local"
#endif

#ifndef MyAppVersionInfo
  #define MyAppVersionInfo "1.0.0.0"
#endif

#ifndef PublishDir
  #define PublishDir "..\artifacts\_publish"
#endif

#define MyAppName "Arma3 Server Tools"
#define MyAppExeName "Arma3ServerTools.exe"
#define MyAppIconFile "Assets\1_arma3server_x64.ico"
#define MyAppPublisher "ViVi141"
#define MyAppUrl "https://github.com/ViVi141/arma3-server-tool"

#ifndef MyAppCopyright
  #define MyAppCopyright "Copyright (C) 2026 ViVi141. Based on original work copyright 2022 destiny studio (Blue, 七龙)."
#endif

#ifndef MyAppDescription
  #define MyAppDescription "Arma 3 dedicated server configuration and management tool for Windows."
#endif

[Setup]
AppId={{A3ST-7E4B-4F91-9C2D-1B8E6F3A5D0C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppUrl}
AppSupportURL={#MyAppUrl}
AppUpdatesURL={#MyAppUrl}/releases
AppCopyright={#MyAppCopyright}
DefaultDirName={autopf}\Arma3 Server Tools
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile={#PublishDir}\LICENSE
OutputDir=..\artifacts
OutputBaseFilename=Arma3ServerTools-Setup-{#MyAppVersion}-{#MyBuildStamp}
SetupIconFile=..\src\Arma3ServerTools.App.WinForms\Assets\1_arma3server_x64.ico
UninstallDisplayIcon={app}\{#MyAppIconFile}
UninstallDisplayName={#MyAppName}
VersionInfoVersion={#MyAppVersionInfo}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Setup
VersionInfoCopyright={#MyAppCopyright}
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersionInfo}
VersionInfoTextVersion={#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
#ifexist "compiler:Languages\ChineseSimplified.isl"
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
#endif

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppIconFile}"; Comment: "{#MyAppDescription}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppIconFile}"; Tasks: desktopicon; Comment: "{#MyAppDescription}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Messages]
english.BeveledLabel=Install path must not contain Chinese characters.
#ifexist "compiler:Languages\ChineseSimplified.isl"
chinesesimplified.BeveledLabel=安装路径不能包含中文字符。
#endif
