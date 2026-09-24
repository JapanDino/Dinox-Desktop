# Performance and battery

Dinox uses a Rust background process and WebView2-rendered surfaces. Its actual cost depends on visible windows, animations, media activity, polling, calendar feeds, notifications, display scale and GPU/driver behavior. There is no representative measured CPU/RAM/battery benchmark for this public release yet.

To reduce work, choose the available power-saving settings, reduce animated effects and frequent indicators, disable unused integrations, increase calendar refresh intervals and hide surfaces you do not need. Do not assume that an invisible WebView costs zero resources.

For a useful comparison, measure the entire Dinox process tree including WebView2, at the same brightness and power profile. Compare at least idle desktop, media playback and frequent notifications, both with Dinox closed and with it running. Use repeated 15–30 minute CPU/RAM observations and longer unplugged battery runs. Report hardware, Windows version, configuration, duration and uncertainty with results; a single Task Manager reading does not measure battery impact.
