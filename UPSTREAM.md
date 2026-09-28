# Upstream and compatibility

Dinox Desktop is a modified continuation of **Bloom by sehaz**, distributed under the original GNU GPL v3 license. The upstream project is linked from [bloom.sehaz.space](https://bloom.sehaz.space/). This fork adds personal desktop integrations, calendar subscriptions, customization, recovery changes and its own release channel.

The original `LICENSE` is retained. JapanDino's modifications do not remove upstream authorship. Historical names in source, manifests and internal settings are not evidence that this fork is an official Bloom release.

`bloom.exe`, the `com.japandino.bloompersonal` identifier and the existing notification package identity remain intentionally stable. Changing them would separate settings and could invalidate a previously registered notification component. User-facing branding and the update repository are Dinox Desktop.

## Telegram transport bundled in 4.2.0

The optional transport comes from [Flowseal/tg-ws-proxy](https://github.com/Flowseal/tg-ws-proxy), pinned to commit `caa949bee0873d2b95dfb4fbeb1b7868b0ee3843`. Its source, license and integrity map are in `vendor/tg-ws-proxy`. Dinox adds its own restricted helper entry point; upstream files retain their original bytes. Dependency and Python license notices accompany the packaged helper. See [the integration guide](docs/TELEGRAM-PROXY.md).
