//! GPUI 主窗口的原生显示/隐藏：关闭到托盘需要真正隐藏 HWND，并在恢复时处理最小化与前台限制。
//!
//! 只声明用到的 Win32 ABI；托盘由 `tray-icon` 提供，这里不再有消息循环。

use gpui_kit::Window;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::{ffi::c_void, io, mem::size_of};

type Handle = *mut c_void;

const SW_HIDE: i32 = 0;
const SW_SHOW: i32 = 5;
const SW_RESTORE: i32 = 9;
const FLASHW_ALL: u32 = 3;

#[repr(C)]
struct FlashInfo {
    size: u32,
    window: Handle,
    flags: u32,
    count: u32,
    timeout: u32,
}

// 布局不一致会让原生代码越界读取结构体。
#[cfg(target_pointer_width = "64")]
const _: () = assert!(size_of::<FlashInfo>() == 32);
#[cfg(target_pointer_width = "32")]
const _: () = assert!(size_of::<FlashInfo>() == 20);

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCurrentThreadId() -> u32;
    fn GetCurrentProcessId() -> u32;
}

#[link(name = "user32")]
unsafe extern "system" {
    fn SetForegroundWindow(window: Handle) -> i32;
    fn SetActiveWindow(window: Handle) -> Handle;
    fn SetFocus(window: Handle) -> Handle;
    fn BringWindowToTop(window: Handle) -> i32;
    fn FlashWindowEx(info: *const FlashInfo) -> i32;
    fn ShowWindow(window: Handle, command: i32) -> i32;
    fn IsIconic(window: Handle) -> i32;
    fn IsWindow(window: Handle) -> i32;
    fn GetWindowThreadProcessId(window: Handle, process: *mut u32) -> u32;
}

/// 捕捉已经创建的 GPUI 主窗；原始指针使此类型不能跨线程移动。
#[derive(Clone, Copy)]
pub(crate) struct MainWindow {
    window: Handle,
    thread: u32,
}

impl MainWindow {
    /// 从仍然存活的 GPUI 窗口提取 HWND，不依赖后端的窗口类名。
    pub(crate) fn capture(window: &Window) -> io::Result<Self> {
        let handle = HasWindowHandle::window_handle(window)
            .map_err(|error| io::Error::other(error.to_string()))?;
        let RawWindowHandle::Win32(handle) = handle.as_raw() else {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "GPUI window did not provide a Win32 handle",
            ));
        };
        // SAFETY: 窗口仍由 GPUI 持有；保存的 HWND 仅在 UI 线程上使用，
        // 每次操作前均重新校验线程、进程与句柄有效性。
        let window = handle.hwnd.get() as Handle;
        let thread = unsafe { GetCurrentThreadId() };
        let native = Self { window, thread };
        if !native.is_valid() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "GPUI window handle is not owned by this UI thread and process",
            ));
        }
        Ok(native)
    }

    /// 只隐藏仍属于当前进程和 UI 线程的主窗口。
    pub(crate) fn hide(&self) {
        if !self.is_valid() {
            return;
        }
        // SAFETY: validated GPUI HWND is accessed from its owning UI thread.
        unsafe {
            ShowWindow(self.window, SW_HIDE);
        }
    }

    /// 恢复最小化并请求聚焦；Windows 拒绝前台时以闪烁提示。
    pub(crate) fn show(&self) {
        if !self.is_valid() {
            return;
        }
        // SAFETY: all calls operate on the validated HWND on its UI thread.
        // SW_SHOW preserves maximization; SW_RESTORE also undoes minimization.
        unsafe {
            ShowWindow(
                self.window,
                if IsIconic(self.window) != 0 {
                    SW_RESTORE
                } else {
                    SW_SHOW
                },
            );
            BringWindowToTop(self.window);
            SetActiveWindow(self.window);
            SetFocus(self.window);
            if SetForegroundWindow(self.window) == 0 {
                let info = FlashInfo {
                    size: size_of::<FlashInfo>() as u32,
                    window: self.window,
                    flags: FLASHW_ALL,
                    count: 3,
                    timeout: 0,
                };
                FlashWindowEx(&info);
            }
        }
    }

    /// 每次访问前复核线程、进程与句柄，拒绝已销毁或复用窗口。
    fn is_valid(&self) -> bool {
        // SAFETY: HWND queries safely reject a destroyed handle. Also confirm
        // thread and process ownership so an accidentally recycled HWND is not
        // used to hide another application's window.
        unsafe {
            if GetCurrentThreadId() != self.thread || IsWindow(self.window) == 0 {
                return false;
            }
            let mut process = 0;
            GetWindowThreadProcessId(self.window, &mut process) == self.thread
                && process == GetCurrentProcessId()
        }
    }
}
