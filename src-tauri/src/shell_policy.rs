//! Pure policy: no Windows calls, so failure decisions can be tested without touching Explorer.
pub const HEARTBEAT_TIMEOUT_MS: u64 = 15_000;

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
}
