# Arma3 Server Tools

Windows GUI for **Arma 3 dedicated server** management (.NET 10).

**Current version: v1.5.0** · Maintainer: [ViVi141/arma3-server-tool](https://github.com/ViVi141/arma3-server-tool)

For full documentation (Chinese), see **[README.md](README.md)**.

## Highlights (v1.5.0)

- Per-server **A3ST config package** under `config/{uuid}/` (split JSON; legacy `config/{uuid}.json` auto-migrates).
- **Save to tool** vs **Apply to server directory** vs **Start** are separate; start does not auto-write `server.cfg`.
- Large mod lists: faster save/apply via snapshot and scan optimizations.

## Build

```powershell
dotnet restore Arma3ServerTools.sln
dotnet build Arma3ServerTools.sln -c Release
dotnet test Arma3ServerTools.sln -c Release
```

## License

[Apache License 2.0](LICENSE)
