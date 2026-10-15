# AI usage indicators

Optional widgets: Settings → Top bar → AI usage limits. Each provider has its own toggle.
The compact indicator is the smallest remaining percentage among unexpired windows;
the popup retains every reported window and its reset time. Missing, failed, expired,
or older-than-ten-minute data is shown as unknown, never as a fresh zero/full quota.
The source duration is preserved: a five-hour window appears only when supplied.

## Codex with a ChatGPT account

Requires the official Codex CLI native executable. Dinox discovers PATH and standard
per-user npm installs. Existing CLI authentication can be used for read-only quotas.
The Connect button uses the official browser login through `codex app-server`;
Dinox-managed sign-ins use a separate CODEX_HOME under its app config directory,
so changing this connection does not replace the user's ordinary CLI login.
Credentials are managed by Codex, never passed to the frontend. Do not describe
these quotas as all ChatGPT chat/model limits.

Uses initialize / initialized, account/read and account/rateLimits/read. Reads
rateLimitsByLimitId when available, with the legacy single-bucket fallback.
Refresh every five minutes, including error backoff; manual refresh has a ten-second
cooldown. No prompts, sessions or model requests are created. Subprocesses are hidden,
run outside the project workspace, have bounded I/O, and are stopped on completion.

Official source: https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt

## Claude Code

Connect Claude Code adds a local statusLine bridge to its user settings (including
CLAUDE_CONFIG_DIR installations). The previous statusLine setting is backed up;
its existing command continues receiving the original stdin and its output is
preserved. Disconnect restores it only if the current setting still belongs to
Dinox; external changes are never overwritten during disconnect.

The bridge copies only checked, five_hour/seven_day percentages and reset timestamps
to a local atomic cache. It does not save the full stdin, session ID, transcript path,
prompts, tokens or cookies. Concurrent Claude sessions can publish the same account's
latest snapshot. Windows without rate_limits clear previous cached percentages.

Claude Code supplies subscription quotas for Pro/Max after the first model response.
Dinox does not make model requests to generate usage data. When Claude Code isn't
running/producing updates, the last sample can become stale; refreshing Dinox reads
the local cache and cannot force Anthropic to refresh it. No browser-only Claude
quota scraping or direct third-party use of subscription OAuth tokens is implemented.

Official source: https://code.claude.com/docs/en/statusline#rate-limit-usage

## Validation (2026-10-12)

- TypeScript and Vite production build passed.
- Five model tests cover both windows, unknown data, expiry and invalid percentages.
- Browser fixture: 41 checks passed for four quota bars, missing/stale/error data,
  expiry, refresh, Escape, calendar navigation, sizes/scales and settings actions.
- Actual installed Codex app-server returned the authenticated account's weekly
  bucket (10080 minutes); it did not supply a five-hour bucket in this sample.
- Native code passed cargo check including test compilation. Seven native tests
  cover quota parsing, backup/restore, unrelated settings, external changes and
  corrupted Claude settings.
- Claude bridge was exercised with synthetic stdin: both windows, missing fields,
  sensitive metadata exclusion, stale timer preservation and forwarding the
  existing statusLine passed.
- A real Claude subscription reply and the interactive browser sign-in have not
  been exercised through a newly installed Dinox build. Installed shell unchanged.

Demo: http://127.0.0.1:1440/personal-preview.html?app&ai-limits-demo&shell-polish
