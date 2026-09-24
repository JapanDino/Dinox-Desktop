# Security

Please report suspected vulnerabilities through GitHub's private vulnerability reporting when available. Do not post private calendar URLs, notification content, credentials or signing keys in issues.

## Update trust

The application accepts stable releases from `JapanDino/Dinox-Desktop`. Tauri verifies a detached signature against the public key embedded in the application **before** invoking the installer. A missing or incorrect signature prevents installation. SHA256SUMS helps compare files but is not a substitute for signature verification.

The private updater key belongs outside the repository and is supplied to the release job through a GitHub Actions secret. Pull-request checks have no signing secret. Keep a protected offline backup of the original key: replacing it arbitrarily breaks updates for existing installations.

Updater signatures are distinct from Windows Authenticode certificates. A correctly signed updater package can still show Windows publisher or reputation warnings. Never disable Defender to install Dinox.

## Local data and permissions

Private calendar links and application settings must not be committed. Notification access is optional and controlled by Windows. Notification text is used locally; a notification package identity is required. The standard installer does not add a certificate to Trusted People or Trusted Root stores.

The legacy application identifier and executable name are deliberately retained for existing installations. The guardian and emergency taskbar restoration shortcut remain available. These are recovery measures, not a guarantee against all Windows shell conflicts.

Builds and tests cannot establish that software is absolutely safe. Release notes should distinguish automated tests, browser previews and behavior actually observed on Windows.
