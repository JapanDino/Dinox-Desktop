# Development

## Requirements

Windows 11 x64, Bun 1.4, Rust stable, Visual Studio C++ build tools, a Windows SDK and WebView2. Dependencies are pinned by `bun.lock` and `src-tauri/Cargo.lock`.

```powershell
bun install --frozen-lockfile
bun test
bun run build
cargo check --locked --manifest-path src-tauri/Cargo.toml --bin bloom
```

## Browser demo

```powershell
bun run dev -- --host 127.0.0.1 --port 1439
```

Open `http://127.0.0.1:1439/personal-preview.html?workspace&notifications-allowed` for the synthetic workspace, or `?settings` for preferences. Browser controls use fixtures: they cannot prove Windows Wi-Fi, Bluetooth, notifications or shell operations work on hardware.

## Native build

```powershell
bun run tauri dev
# A release build additionally requires the original updater signing key:
bun run tauri build --bundles nsis --ci -- --locked
```

Set `TAURI_SIGNING_PRIVATE_KEY` through a secure local environment or the CI secret. Do not put it in source or command output. The Rust package and executable remain named `bloom` for compatibility, while the product is Dinox Desktop.

Native launch can alter shell placement according to saved preferences. Keep **Ctrl+Alt+B** and the native Windows taskbar available during testing. Do not run two development/installed instances simultaneously.
