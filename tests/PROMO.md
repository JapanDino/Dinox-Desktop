# Promotional captures

Dev-only compositions are in `tests/Promo.tsx` and `tests/promo.css`.
Open `/personal-preview.html?promo=cover&notifications-allowed` on the Vite dev server.
Other `promo` values: `calendar`, `dock`, `notices`, `connections`, `appearance`.
These entrypoints are excluded from the production build. They use the existing mock Tauri bridge, never the native app or personal configuration.

Capture with a fresh Playwright context, viewport 1920×1080, timezone Europe/Moscow, locale ru-RU, deviceScaleFactor 2. Before navigation call `page.clock.setFixedTime(new Date('2026-09-23T10:40:00+03:00'))`. Await the artboard and component data, fonts, and the dock entrance animation. For the week capture, set `.cal-week-scroll.scrollTop = 9 * 40`. Take screenshots with `scale: 'css'` for Full HD and `scale: 'device'` for 4K. Hide hover/focus states by moving the pointer outside components and blurring the active element.

The export has six scenes, each in both resolutions. All panel bounds were checked against the artboard, all scenes visually reviewed, and the capture reported no page errors. `bun run build` passed. This verifies the promotional rendering; it is not a new native integration test.

Panels are actual components. Surrounding presentation text/layout and the cover clock header are promotional framing, not a new application screen. All content is synthetic. Keep the demo label when publishing. Calendar copy must preserve read-only ICS scope; notification and Bluetooth limitations remain as described by the app.
