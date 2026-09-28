# Release readiness — 2026-09-28

The application release and public Google OAuth approval are separate milestones.
Do not describe the current build as verified for every Windows computer.

## Available without public Google verification

- Dock, island, launcher, local notes and widgets.
- Read-only HTTPS ICS subscriptions, including supported Google and Yandex feeds.
- Google Calendar/Tasks OAuth public pilot, limited to 100 users until verification.

Google Cloud now confirms **In production**, External, **1 / 100 user cap**.
Users no longer need to be added to a testing allowlist. Google verification is
still outstanding, so the unverified-app warning and lifetime cap remain.
Production mode removes the special seven-day Testing token rule for new grants;
previous testing grants may still require a reconnect. Revocation, account policy
and other Google expiration rules still apply. ICS does not expose Google Tasks
or write access and is independent of the OAuth pilot cap.

The free website and privacy policy are published at
https://japandino.github.io/Dinox-Desktop/ and saved in Google Auth Branding.
`japandino.github.io` was accepted as an authorized domain; this is not proof of
domain ownership or completed Google verification. No billing or paid service
was enabled by this work.

## Completed integration checks

See [Google live validation](GOOGLE-LIVE-VALIDATION.md). The authorized live check
read calendars and tasks, created four labelled records, verified dates and task
completion, refreshed the token after a process restart and deleted the test
records. This tested native provider code, not the installed UI or updater.

The release workflow now supplies Google publisher configuration and refuses to
build a release without it. The corresponding GitHub Actions secrets have been
configured. The amended workflow passed for v4.2.0 on September 28, 2026: https://github.com/JapanDino/Dinox-Desktop/actions/runs/36429979722 . The published installer was downloaded and independently verified against the embedded updater public key; its SHA-256 and manifest checksums matched, and a modified copy was rejected. This does not establish installed UI or hardware compatibility.

OAuth errors distinguish a revoked grant, incomplete consent, publisher
configuration failures, rate limits and temporary service failures. Cached
calendar data remains available when a refresh fails.

## Still required for public Google connection

- Homepage and privacy policy: published (see above).
- Ownership verification of a domain under the publisher's control.
- Google branding and sensitive-scope review, including a real demonstration.
- Release build, installed UI and update-path acceptance checks.

GitHub Pages can host the site. However, Google's current domain-verification
instructions require a DNS-level Domain Property, not URL-prefix verification.
The default `japandino.github.io` address does not give this publisher DNS control.
A custom domain can later point to the same Pages site. No domain has been
purchased, and no public Google approval is claimed.

## Other distribution limits

- Direct Yandex OAuth/CalDAV is gated off until provider compatibility is proven;
  Yandex ICS is the supported connection.
- Creating Google events/tasks and completing tasks are implemented. Editing and
  deleting events are not product features yet.
- Google Tasks exposes due dates without exact times through its public API.
- Notification capture needs Windows package identity and permission. A local
  development certificate is not a general-public trust solution.
- Updater signatures are separate from Windows Authenticode publisher trust.
- Clean Windows installation and full multi-window behavior remain unverified.

## References

- [Google domain verification](https://support.google.com/cloud/answer/13804266?hl=en)
- [Google homepage requirements](https://support.google.com/cloud/answer/13807376?hl=en)
- [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)

