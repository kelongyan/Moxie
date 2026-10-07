//! 系统托盘：图标 + 右键菜单（显示 Moxie / 退出）。
//! "退出"走主窗口的 app:quit 事件，由前端保存工作区后调 app_exit 正常收尾。

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIcon,
    Emitter, Manager,
};

static TRAY: Mutex<Option<TrayIcon>> = Mutex::new(None);

pub fn build_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let show = MenuItem::with_id(app, "show", "显示 Moxie", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&show, &quit]).map_err(|e| e.to_string())?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| "缺少应用图标".to_string())?;
    let tray = tauri::tray::TrayIconBuilder::with_id("moxie-tray")
        .icon(icon)
        .tooltip("Moxie")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                for (_, win) in app.webview_windows() {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            "quit" => {
                let _ = app.emit_to("main", "app:quit", ());
            }
            _ => {}
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    *TRAY.lock().unwrap_or_else(|e| e.into_inner()) = Some(tray);
    Ok(())
}

pub fn destroy_tray() {
    *TRAY.lock().unwrap_or_else(|e| e.into_inner()) = None;
}
