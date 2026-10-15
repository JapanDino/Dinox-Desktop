//! Pure policy: no Windows calls, so failure decisions can be tested without touching Explorer.
pub const HEARTBEAT_TIMEOUT_MS: u64 = 15_000;
pub const REJOIN_STABLE_MS: u64 = 8_000;

pub fn retryable_recovery(reason: &str) -> bool {
    matches!(reason, "Interface heartbeat stopped" | "Recovered after process exit or interface timeout" |
        "Explorer window replaced" | "Explorer restarted; compatibility mode active" |
        "Previous session did not restore the taskbar")
}

/// A saved replacement preference is reapplied only after both renderers have
/// been responsive for a full grace period. Recovery never changes that preference.
#[derive(Default)]
pub struct RejoinWindow { healthy_since: Option<u64> }
impl RejoinWindow {
    pub fn observe(&mut self, requested: bool, enabled: bool, retryable: bool, now: u64, main: u64, dock: u64) -> bool {
        let fresh = |beat| beat > 0 && beat <= now && now - beat < 6_000;
        if !requested || !enabled || !retryable || !fresh(main) || !fresh(dock) {
            self.healthy_since = None;
            return false;
        }
        let since = self.healthy_since.get_or_insert(now);
        if now < *since { *since = now; }
        now - *since >= REJOIN_STABLE_MS
    }
}

pub fn replacement_allowed(requested: bool, dock_enabled: bool, ready: bool, recovered: bool) -> bool {
    requested && dock_enabled && ready && !recovered
}

pub fn should_recover(process_alive: bool, now: u64, heartbeat: u64) -> bool {
    !process_alive || now.saturating_sub(heartbeat) > HEARTBEAT_TIMEOUT_MS
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacement_requires_every_precondition() {
        for flags in 0..16 {
            let (request, enabled, ready, recovered) = (flags & 1 != 0, flags & 2 != 0, flags & 4 != 0, flags & 8 != 0);
            assert_eq!(replacement_allowed(request, enabled, ready, recovered), flags == 7);
        }
    }
    #[test]
    fn crash_and_renderer_hang_recover_but_short_delays_do_not() {
        assert!(should_recover(false, 1, 1));
        assert!(!should_recover(true, 15_000, 0));
        assert!(should_recover(true, 15_001, 0));
        assert!(!should_recover(true, 2, 3));
    }
    #[test]
    fn sleep_gap_requires_both_panels_and_a_stable_grace_period() {
        let mut window=RejoinWindow::default();
        assert!(!window.observe(true,true,true,100_000,1,1));
        assert!(!window.observe(true,true,true,101_000,101_000,1));
        assert!(!window.observe(true,true,true,102_000,102_000,102_000));
        assert!(!window.observe(true,true,true,109_999,109_999,109_999));
        assert!(window.observe(true,true,true,110_000,110_000,110_000));
    }
    #[test]
    fn interrupted_recovery_user_choices_and_clock_changes_reset_the_grace_period() {
        let mut window=RejoinWindow::default();
        assert!(!window.observe(true,true,true,10_000,10_000,10_000));
        assert!(!window.observe(true,true,true,18_000,18_000,10_000));
        assert!(!window.observe(true,true,true,20_000,20_000,20_000));
        assert!(!window.observe(false,true,true,28_000,28_000,28_000));
        assert!(!window.observe(true,false,true,30_000,30_000,30_000));
        assert!(!window.observe(true,true,false,40_000,40_000,40_000));
        assert!(!window.observe(true,true,true,50_000,50_000,50_000));
        assert!(!window.observe(true,true,true,45_000,45_000,45_000));
        assert!(window.observe(true,true,true,53_000,53_000,53_000));
    }
    #[test]
    fn legacy_and_unknown_recovery_are_not_retried_automatically() {
        assert!(retryable_recovery("Interface heartbeat stopped"));
        assert!(retryable_recovery("Explorer restarted; compatibility mode active"));
        assert!(retryable_recovery("Previous session did not restore the taskbar"));
        assert!(!retryable_recovery("Legacy recovery: select compatibility mode"));
        assert!(!retryable_recovery("unknown failure"));
    }
}
