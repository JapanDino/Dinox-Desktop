#[derive(Clone, Copy)]
pub enum Surface { Main, Dock }

/// Dock popups belong only to the dock HWND. They must not make the large,
/// transparent main HWND intercept input over the popup or another app.
pub fn ignore_cursor(surface: Surface, own_content_hit: bool, dock_menu_open: bool) -> bool {
    !(own_content_hit || (matches!(surface,Surface::Dock) && dock_menu_open))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dock_popup_is_clickable_through_the_overlapping_transparent_main_window() {
        // Bluetooth lies inside the dock popup, below the clock, but within
        // both native window rectangles. Only the dock must accept the click.
        assert!(ignore_cursor(Surface::Main,false,true));
        assert!(!ignore_cursor(Surface::Dock,true,true));
        assert!(!ignore_cursor(Surface::Main,true,true)); // Clock still works.
        assert!(ignore_cursor(Surface::Main,false,false));
        assert!(ignore_cursor(Surface::Dock,false,false)); // Desktop remains usable.
    }
}
