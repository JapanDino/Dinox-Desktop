# Dinox Desktop 4.0.1

Maintenance update: the release version helper now handles Windows CRLF files and updates all native manifests consistently. This release also exercises the signed upgrade path from 4.0.0.

The first public Dinox Desktop release continues the Bloom Personal desktop fork.

- Dinox branding, coordinated dark UI and Russian/English preferences.
- Customizable dock and island, read-only calendar subscriptions, device controls and optional Windows notification integration.
- Dedicated signed update channel. Updates are offered by default; automatic installation at startup is optional.
- Taskbar restoration before updater exit; existing settings, install directory and notification identity are retained.

Windows 11 x64 is the primary target. Fresh EXE installs need an additional package identity and Windows permission to read other applications' notifications. Telegram's custom popups are not Windows notifications. ICS calendars are read-only. Device support and shell behavior vary; see the README and security notes before enabling optional integrations.
