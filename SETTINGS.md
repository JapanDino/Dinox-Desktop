# Settings

Dinox offers appearance, island, dock, indicators, notification and application preferences. Labels are available in Russian and English. Use the UI to change settings; editing files while the application is running can race with saved state.

Existing Bloom Personal settings remain under `%APPDATA%\com.japandino.bloompersonal`. This compatibility name is intentional. Existing internal setting names are retained; the new `dinox-auto-update` preference defaults to off independently of earlier Bloom update preferences.

## Recommended first setup

1. Choose the interface language and coordinated theme.
2. Configure dock pins, size and visibility before enabling Windows taskbar replacement.
3. Choose island visibility and the date/status indicators you want to see.
4. Add a read-only ICS feed in calendar settings and choose its refresh interval.
5. Enable notifications only after Windows grants access. Test using a real Windows notification from the source application.
6. In About, leave updates as offers or enable automatic installation at startup.

If shell placement becomes unusable, press **Ctrl+Alt+B** to restore the native taskbar. See [performance](docs/PERFORMANCE.md) for reducing background work.
