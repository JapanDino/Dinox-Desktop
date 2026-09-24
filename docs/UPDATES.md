# Signed releases and updates

## For users

The About page checks for updates and offers installation. Automatic installation is **off by default**. If enabled, it installs a newer stable release after the next application startup; periodic six-hour checks only announce updates during the current session. Installation restarts the application.

A network error is displayed as an error, not as “up to date”. Downloads must pass Tauri's cryptographic signature verification before the installer runs. The app rechecks the latest release before downloading, and prevents concurrent installs. Existing install location and settings are retained. Shell cleanup restores Windows work areas before updater exit.

Since 4.0.2, updater installation is quiet and the NSIS language selector is disabled. Change the application language in Settings. Interactive installer dialogs must not be added to the unattended update path.

## For the maintainer

1. Merge and test the desired code on `main`.
2. Run `bun run bump 4.0.3` (substitute the next stable version).
3. Update `RELEASE_NOTES.md`, run tests/build, and commit the release changes.
4. Push the commit, then create and push the exact version tag:

```powershell
git tag v4.0.3
git push origin main
git push origin v4.0.3
```

An ordinary source push runs CI but **does not** update users. The tagged release workflow verifies version consistency, tests, builds an NSIS installer and signs it with `TAURI_SIGNING_PRIVATE_KEY`. It creates a draft, uploads all four artifacts, then publishes the completed release:

- `Dinox-Desktop_<version>_x64-setup.exe`
- detached `.exe.sig`
- `latest.json` with the Windows x64 URL and signature
- `SHA256SUMS.txt`

The app reads `https://github.com/JapanDino/Dinox-Desktop/releases/latest/download/latest.json`. Keep stable releases monotonically increasing. Do not manually overwrite a published installer/signature or re-point a published tag. Fix a bad release with a newer tested version; withdraw it if necessary. The updater does not silently downgrade users.

## Key handling

Use the original signing key for every release. Back it up securely outside Git. The public key is embedded in `src-tauri/tauri.conf.json`; only the private key belongs in the Actions secret. A key change requires a planned trust migration. This signing is separate from optional Windows Authenticode signing.

## Verification

The native executable provides two windowless, read-only probes:

```powershell
.\bloom.exe --verify-release C:\Temp\dinox-valid.json
.\bloom.exe --verify-release-tampered C:\Temp\dinox-invalid.json
```

They download the configured published release without installing it. The first must report `signatureVerified: true`; the deliberately altered signature must fail. These probes establish metadata/download/signature behavior, **not installation success**. Also test an older installed version upgrading to a newer one, then confirm the process version, settings, taskbar recovery and notification access.
