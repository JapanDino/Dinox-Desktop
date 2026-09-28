# Telegram connection helper (experimental)

Open **Settings → Telegram → Help Telegram connect**, then **Connect Telegram**.
Telegram Desktop asks you to confirm a local MTProto proxy. No Telegram login,
API key, subscription, or administrator service is required by Dinox.

The feature is off by default. Once enabled, it starts alongside Dinox. To start
Dinox on Windows login, enable **General → Launch at Login** separately.

## Network scope and lifecycle

- Binds only `127.0.0.1`, default port 1443; an occupied port produces an error.
  Choose another port in Advanced settings while stopped, then reconnect Telegram.
- Uses Telegram WebSocket DC endpoints with normal TLS certificate/hostname validation.
  Direct Telegram TCP is the fallback. Flowseal's CF domain pool, CF workers,
  remote domain-list updates, SNI fronting and idle connection pools are disabled.
- Windows system proxy, hosts, firewall and antivirus settings are untouched.
- The random per-install proxy secret is stored through Windows DPAPI in
  `telegram-proxy.bin`; it is passed over inherited stdin, never command arguments.
  It is not returned by the status command, exported with general settings or logged.
- The helper is an independent process, without a GUI or on-disk network logs.
  Dinox receives bounded JSON counters. Closing/crashing Dinox closes stdin and
  stops the helper. Normal shutdown allows two seconds before terminating it.
- **Disable the proxy in Telegram before turning this feature off or closing Dinox.**
  Dinox cannot silently restore Telegram's connection setting through the public
  proxy deep-link mechanism. No modifications of Telegram's private `tdata` files.
- Unexpected helper termination is shown when settings refresh; **Start again**
  retries. No endless process restart loop. A running process or an opened deep link
  is not proof Telegram is reachable.

## Build

Source: Flowseal/tg-ws-proxy at commit
`caa949bee0873d2b95dfb4fbeb1b7868b0ee3843`; unchanged transport files and checksums
are under `vendor/tg-ws-proxy`. MIT license is retained. Dinox's constrained host
is `dinox_helper.py`. No upstream tray executable is downloaded.

On Windows with Python 3.12:

```powershell
./scripts/build-telegram-proxy.ps1 -Python 'path/to/python.exe'
bun run tauri build --bundles nsis --ci
```

The script verifies vendored source hashes, uses a local venv, builds a headless
PyInstaller **onedir, no UPX** component, collects dependency license notices and
tests the packaged executable. Tauri includes the helper directory as resources.
The release workflow runs this before building the installer. Python does not need
to be installed on the recipient's computer. Source-only builds without the helper
show “Component not installed” and do not pretend to enable the feature.

## Verification and limits

Tests cover rejected configuration, forced loopback-only/direct-only policy,
occupied ports, packaged startup, parent stdin closure, port release and no secret
in helper output. Native tests cover the generated deep link and status redaction.
Browser fixtures test the settings independently without modifying real Telegram.

This does **not** establish successful messaging, media downloads or calls on a
particular network. Those require an opt-in real Telegram Desktop session. No
claim of guaranteed bypass, anonymity, zero overhead, or complete security audit.
The Python helper adds approximately 32 MB uncompressed before installer compression;
CPU, memory and battery usage under actual traffic have not been benchmarked.

The local experimental installer is not a published GitHub release. All prior
calendar/Google pilot changes in this worktree remain included in the local build.
