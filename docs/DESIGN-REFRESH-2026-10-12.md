# Dinox visual refresh — 2026-10-12

User brief: add provider logos to AI quotas and rework the entire application's
design with a design/UX agent team. Preserve the calm monochrome Bloom identity,
custom palettes, existing connections and native shell behavior.

## Design direction

The visual focus is the content: time, events, apps and messages. Panels behave as
tools rather than repeated presentation cards. Segoe UI Variable follows Windows
metrics. Main UI text is 12–14px, section titles 15–18px, workspace heading 26px
(22/20px on small screens). Settings use sentence case and clear help text.

Unified palette: black base; #101012 raised surface; #141416 input; #1a1a1e control;
#26262b hover; #303034 decorative boundary. Text remains #f5f5f5 and muted #a3a3a3.
Fields retain stronger contrast borders; keyboard focus remains visible. Custom
and light themes continue to supply semantic colours. Radii: controls8, cards12,
dialogs18. Spacing roles:4/8/12/16/24.

## Agent review and implementation

- Shell/UI agent: island, dock, customization previews and AI usage panels.
  Findings: dense quota metadata, decorative gradients, inconsistent tooltip/menu
  colours. Fixed typography, control grouping, neutral surfaces and focus states.
- Settings/UX agent: settings, layout editor, app pinning, system controls and mixer.
  Findings: too many nested borders, tiny descriptions, custom-theme drift. Fixed
  grouped lists, clearer controls, responsive wrapping and theme-aware colours.
- Workspace/visual agent: calendar, event/task forms, widgets, notes, launcher and
  notifications. Findings: oversized workspace title/corners, boxed app artwork,
  repeated panels and inconsistent typography. Fixed hierarchy, paper/list styling,
  transparent artwork and sender/message presentation.
- Root: shared semantic tokens, local vector provider marks, integration and
  browser verification. Logos identify OpenAI/Codex and Claude integrations only.

Native command behavior, calendar grid calculations, shell recovery and existing
connection/settings files are outside this design change. Installed Dinox remains
unchanged; production rollout requires rebuilding and installing the new binary.

## UX declutter

Fresh widget boards show four tools: tasks, notes, calendar and focus. Projects,
music and the separate Today card are optional. Explicit saved toggle values and
layout remain authoritative. All widgets stay in the catalog.

Removed always-visible successful-save repetitions, local task empty-state prose,
idle timer commentary, duplicated shortcut/persistence footer and calendar
navigation hints. Errors, retry actions, local-vs-synced distinction, connection
states and unsaved changes remain available. AI setup and scope explanations now
live in accessible disclosure sections; live provider timestamps appear only when
stale or failed. Calendar polling/timezone details are a footer tooltip. Search
privacy details moved to preferences; shortcut conflicts stay visible.

Notification read visibility now uses the viewport IntersectionObserver root so
clipping by short-panel scroll containers is respected. Browser checks await the
actual read state rather than a fixed animation delay.

## Verification

Verification results and screenshots are recorded in output/review and
output/playwright. Final browser checks cover quota states, modal focus, calendar,
notes, launcher, notifications, controls and theme/size variants. Synthetic fixture
values must not be represented as live account usage or real notification delivery.

Passed: TypeScript, Vite production build, CSS parsing, diff checks, 15 model/contrast
tests, 66 integration browser checks, 9 focus/dialog checks, 42 settings/calendar
checks, 12 notification policy checks, 41 quota UI checks, 16 declutter checks and
compact/short-window/gallery geometry checks. All 14 dark/light screenshots were
rendered, and three agents independently reviewed their owned surfaces. Current
capture gallery: http://127.0.0.1:1440/output/review/design-gallery.html
