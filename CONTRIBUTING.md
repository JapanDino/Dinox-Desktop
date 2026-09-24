# Contributing

Please describe the problem, your Windows version, display scale and steps to reproduce. Redact private calendars, messages and account information from screenshots and logs.

See [development](docs/DEVELOPMENT.md) to run the browser demo or native build. Run `bun test` and `bun run build`; native changes also need `cargo check --locked --manifest-path src-tauri/Cargo.toml --bin bloom` on Windows. Explain which behavior was tested on hardware and which was simulated.

Prefer small changes, consistent Russian/English translations, keyboard-accessible controls and recovery paths for failed OS actions. Preserve GPL licensing and upstream attribution. Never commit generated installers, credentials, signing keys or personal settings.
