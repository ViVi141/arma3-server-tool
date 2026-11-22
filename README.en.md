# Arma3 Server Tools v2

Cross-platform **Arma 3 dedicated server** management. Full-stack **TypeScript**.

**Current version: `v2.0.0-beta.1` (Beta)** — Phase 2 goals met (mission switch, mods, remote console). APIs and installers may still change based on feedback.

| Role | Notes |
|------|--------|
| **Game host** | Windows or Linux (Dedicated + SteamCMD) |
| **Console** | Browser / Electron desktop / Android controller shell |
| **Backend** | Node.js + Fastify + SQLite (sql.js) |
| **Frontend** | Vue 3 + Element Plus + Pinia |

Linux hosts can use the Release portable tarball (Service + embedded Web UI). See [docs/linux-server.md](docs/linux-server.md).

Full documentation is in Chinese: **[README.md](README.md)**.

## Highlights

- Multi-instance start / stop / restart with two-step config apply
- Workshop mod scan / download / bikey deploy
- Mission switch, PBO upload, SteamCMD install & update
- BattlEye RCon, bans, cron, maintenance workflows
- Bearer-token HTTP API for LAN / Tailscale remote control
- Windows Setup, Linux portable pack, Android controller APK

## Quick start (dev)

```powershell
npm install
npm run build:service
npm run start:service
```

```powershell
npm run dev:web
```

- Local CI: `powershell -ExecutionPolicy Bypass -File scripts/ci-local.ps1`
- Guide: [docs/v2-quickstart.md](docs/v2-quickstart.md)
- Releases: https://github.com/ViVi141/arma3-server-tool/releases

## Credits

- Maintainer: [ViVi141](https://github.com/ViVi141)
- Upstream: [airmoer/arma3-server-tool](https://github.com/airmoer/arma3-server-tool)
- Original authors: destiny studio (Blue, 七龙)

## License

[Apache License 2.0](LICENSE)
