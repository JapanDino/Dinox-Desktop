# Quick settings: design and direct controls

Replaced the uniform row treatment with connection tiles, wide filled sliders,
a battery graphic and a keyboard keycap. Colours inherit the actual dock palette,
including separately configured light/dark palettes. No decorative gradients or
new continuously running animations.

Primary actions stay inside Dinox:

- Wi-Fi networks and Bluetooth devices use the existing native subpanels.
- Master volume, mute and display brightness retain their confirmed-write logic.
- Audio devices select an output or microphone; endpoint volume/mute is available
  for both. Calls devices change only with the explicit calls checkbox.
- The app mixer, keyboard layouts and hidden tray remain available.
- Power shows real battery/source/runtime information and existing Windows plans.
  It does not invent or create extra plans on Modern Standby computers.
- Dinox resource saving reuses `bloom-personal-eco`, separately from Windows plans.
- Do Not Disturb saves the existing Dinox setting; it does not alter Windows DND.
- Notifications open the existing Dinox notification centre in the main island.
  Existing access/opt-in requirements remain in effect.

Windows quick settings, display options, VPN and Windows notifications moved into
the collapsed additional-options disclosure. The emergency restore-taskbar action
remains accessible. No account, calendar, pin or preference migration is performed.

Native endpoint controls validate endpoint identity/direction and finite ranges,
read back changes, and verify default-device rollback after partial failures.
Default endpoint selection uses the same Windows compatibility COM interface as
the existing mixer; unsupported systems show an error. Power uses PowrProf APIs,
validates existing GUIDs, reads back the active plan, and bounds worker concurrency.
UI errors cause readback rather than speculative success or automatic write retries.

## Verification

- TypeScript and production frontend build passed.
- Cargo native check passed (two pre-existing dead-code warnings).
- Three audio validation tests and four power validation tests passed.
- 54 browser checks: themes, RU/EN, small viewports, placement on three dock edges,
  keyboard sliders, mute, navigation, disabled/missing devices and focus return.
- 24 browser checks: own device/power controls, DND persistence, failed writes,
  missing hardware, one-plan systems and no Windows settings launches.
- Six gallery/integration checks: eight images,390px layout, auto-open demo link,
  notification centre inside Dinox.
- A separate native read-only harness used the new source modules directly:
  one output and one input, both with defaults; one active power plan;
  no warnings. No device, mute, volume or power policy was changed by this probe.

Browser interactions use synthetic fixtures. Actual native mutation through a
packaged WebView is not yet verified. Installed Dinox was not replaced or launched.

Review gallery: `http://127.0.0.1:1440/output/review/quick-settings-gallery.html`.
Screenshots: `output/playwright/quick-tools-{dark,light}-{quick,audio,microphone,power}.png`.
