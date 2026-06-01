Arma 3 Server Tools — Release Package
========================================

System requirements
-------------------
- Windows 10/11 x64
- .NET 10 Desktop Runtime (x64), unless this build is marked self-contained

If the program fails to start with a runtime error, install:
  .NET Desktop Runtime 10.x (x64)
  https://dotnet.microsoft.com/download/dotnet/10.0

Quick start
-----------
1. Extract this folder to a path WITHOUT Chinese or full-width characters.
2. Run Arma3ServerTools.exe
3. Use menu: Tools -> First Server Wizard (首服向导)
4. After editing settings: Save to tool, then Apply to server directory, then Start

Documentation (in docs/ folder)
--------------------------------
- README.md — documentation index
- config-workflow.md — save / apply / start (v1.5+)
- first-server-guide.txt — step-by-step setup (Chinese, Notepad)
- first-server-guide.md — same content (Markdown)
- openclaw-integration.md / deployment-ab-openclaw.md — Agent + OpenClaw

Monitoring (optional)
---------------------
- Requires monitoring-server/DestinyServerMonitoring.dll and mod/@a3st_monitor
- MonitoringHost runs from monitoring/Arma3ServerTools.MonitoringHost.exe

Automation Agent (OpenClaw / remote control)
--------------------------------------------
- Included in the same installer as the main GUI (no separate download)
- Executable: agent/Arma3ServerTools.Agent.Host.exe
- Shares server configs with Arma3ServerTools.exe (see docs/deployment-ab-openclaw.md)
- First run creates config/agent/settings.json under user data
- Optional: enable "Start Agent on logon" during setup

Support
-------
https://github.com/ViVi141/arma3-server-tool
