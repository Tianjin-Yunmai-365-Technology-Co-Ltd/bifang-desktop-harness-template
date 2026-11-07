//! NSH Mixed desktop host; the TSX bundle is loaded into independent native windows.
#![cfg_attr(all(target_os = "windows", not(debug_assertions)), windows_subsystem = "windows")]

__PLATFORM_MODULES__
__DEEP_LINK_MOD__
__MAC_AUTOSTART_MOD__

__PLATFORM_MAINS__

__UNSELECTED_PLATFORM_CFG__
fn main() {
    eprintln!("This NSH desktop host is not selected for the current operating system.");
}
