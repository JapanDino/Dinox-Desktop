# Island and dock interaction review

This change is source and browser-preview work. The installed Dinox executable,
connections, tokens, notification package and saved user preferences were not
replaced or modified.

## Design decisions

- Compact island keeps the user's selected clock/date/metrics. Section controls
  appear only when expanded; unavailable music/calendar sections are hidden.
- Overview does not repeat CPU/battery already pinned to the header. Profiles
  live in a disclosure. Unknown native metrics show a dash instead of a fake zero.
- Calendar, music and system controls have separate, meaningful surfaces using
  the existing palette and spacing. System actions use the same native controls
  as the dock. Inline controls let keyboard focus return to section navigation.
- Section navigation is capped at 366 CSS pixels so switching from the wide
  calendar to a compact tool does not move the panel away from the cursor.
- On narrow, short panels calendar chrome compresses to keep a usable grid.
- Notification banners size to their content. Closing history stops visibility
  tracking; cards need continuous visibility before becoming read. Closing in
  Dinox still leaves Windows notifications intact.

## Dock behavior

- Optional proximity magnification is off by default, bounded by icon spacing,
  updated at most once per animation frame and disabled during drag, eco mode,
  or reduced motion. Icon centers remain fixed.
- External file drag leases dock visibility. Hovering a running window for
  650 ms activates it without minimizing it. Multiple-window icons show previews
  so the user can choose the exact destination.
- The bridge never reads, copies or consumes file data and never starts a closed
  application. Move the file into the destination window to drop it. A drop on
  the dock is not accepted. Escape, leaving the dock and native button release
  cancel the temporary target.
- Native hot-edge detection also covers held left/right-button drags; native
  release clears the lease when Windows OLE omits a DOM mouseup. Existing
  internal pin reorder remains a separate interaction.

## Reference behavior

- [macOS Desktop & Dock settings](https://support.apple.com/en-gb/guide/mac-help/mchlp1119/mac): optional magnification and auto hide.
- [Microsoft mouse interactions](https://learn.microsoft.com/en-us/windows/apps/develop/input/mouse-interactions): hover details, deliberate activation.
- [Microsoft drag and drop](https://learn.microsoft.com/en-us/windows/apps/design/input/drag-and-drop): source-owned cross-application transfers.
- [Tauri configuration](https://v2.tauri.app/reference/config/): disabling the native drag handler is required for frontend HTML5 drag events on Windows. Only the dock's relevant configuration was changed in this task.

## Evidence and limits

- 126 Bun tests passed, including spacing invariants for magnification.
- TypeScript and production Vite build passed.
- Native `cargo check --locked --tests` passed after hot-edge/release changes.
- 208 browser checks passed across suites covering island section navigation in Russian/English, small and
  large viewports, stable clock position, inline focus, media contrast,
  notification dismissal, six island placements, dock file-drag fixtures,
  window-preview activation, magnification/reduced motion, dialogs and shared
  quick controls. Capture artifacts live under ignored `output/playwright`.
- These are synthetic browser events and window handles. Real Windows OLE
  transfer, native focus through an actual file drag, Windows scaling, and
  post-sleep behavior still require testing in a packaged executable. No claim
  of installed runtime verification is made here.
