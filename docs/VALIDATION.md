# Release validation

Validation performed on 25 September 2026. These checks cover the Dinox rename and update channel; they are not certification of every Windows integration or device.

## Automated checks

- 38 frontend/domain tests, 1,008 assertions: passed locally and in GitHub Actions, including the regression check for unattended installer prompts.
- TypeScript and production Vite build: passed.
- Native Windows Cargo check: passed in GitHub Actions.
- Signed NSIS 4.0.0 and 4.0.2 releases: built and published by the tagged GitHub Actions workflow.
- Version helper exercised against CRLF fixtures: all six version files changed consistently, without changing the source checkout.

## Browser UI

The About page was checked at desktop size and 390 × 844. The update offer, install-error recovery, persisted automatic-update checkbox and failed-save behavior were exercised with fixtures. Failed saves preserve the previous checkbox value; errors do not report “up to date”. No horizontal overflow was observed at the narrow size.

## Published release trust

The native windowless probe downloaded the published 4.0.0 installer and verified its signature. An invalid signature was rejected. A separate Ed25519/Minisign verification checked the installer, signed comment and SHA-256 checksums; flipping one byte in the installer caused verification to fail. No altered installer was executed.

The native signature probe, independent verification and modified-file rejection were repeated against the published 4.0.2 installer. The installer downloaded by the live updater matched the published SHA-256 checksum.

## Local installation

Dinox 4.0.0 was installed over the existing Bloom Personal directory with a backup retained outside Git. Windows reported the new product/version and retained package identity and notification access. The main process and recovery guardian started successfully.

The first real automatic upgrade exposed a blocking NSIS language selector in 4.0.1. That release was withdrawn. Version 4.0.2 disables the installer language selector and uses quiet updater installation. This failure illustrates why download and signature checks alone do not prove an upgrade completes.

The local legacy autostart entry was migrated to the installed Dinox path. A duplicate legacy uninstall entry and shortcut for that same directory were removed after backup.

## Completed automatic upgrade

The actual installed 4.0.0 application downloaded 4.0.2 from the public release feed, verified it, invoked the installer and restarted into 4.0.2 without a language selection prompt or manual installer interaction. The executable remained in the original installation directory.

- All 18 persisted preferences compared equal after excluding the explicitly changed update toggle and the live weather temperature cache.
- Pinned applications were unchanged. Calendar connection configuration matched after decrypting both local snapshots in memory; private URLs and calendar content were not printed or uploaded.
- Windows notification package identity and `allowed` access were retained.
- Autostart still targeted the installed Dinox executable.
- The new main process and recovery guardian remained running, the shell journal belonged to the new process, and no recovery warning was present.
- Automatic installation was turned off after the test, restoring the default offer-based behavior.

The stale legacy Windows Installed Apps version label was normalized separately after the local migration; the application's own executable and About version are authoritative.

Production code for this validation is tagged [v4.0.2](https://github.com/JapanDino/Dinox-Desktop/releases/tag/v4.0.2). See [source checks](https://github.com/JapanDino/Dinox-Desktop/actions/runs/36063773136) and [signed release workflow](https://github.com/JapanDino/Dinox-Desktop/actions/runs/36063793893). Later documentation and demo-version changes do not alter the tagged native binary.

## Limits

Browser fixtures do not prove hardware Wi-Fi/Bluetooth operations. Existing notification access does not prove Telegram uses Windows notifications. A passing update test is not a complete security audit, and representative battery-life measurements remain outstanding.
