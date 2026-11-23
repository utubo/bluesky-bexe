use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::WindowEvent;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

static SHOW_TRAY: AtomicBool = AtomicBool::new(true);

// ==========================================
// Tauri Commands
// ==========================================

#[tauri::command]
fn greet(name: &str) -> String {
    if name.trim().is_empty() {
        return "Hello, Friend! You've been greeted from Rust!".to_string();
    }
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn update_global_shortcut(app: AppHandle, shortcut_str: String) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister: {}", e))?;

    if shortcut_str.trim().is_empty() {
        return Ok(());
    }

    let shortcut = shortcut_str
        .parse::<Shortcut>()
        .map_err(|e| format!("Invalid shortcut format: {}", e))?;

    app.global_shortcut()
        .register(shortcut)
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    Ok(())
}

#[tauri::command]
fn update_tray_texts(app: AppHandle, toggle_text: String, quit_text: String) {
    let _ = update_tray_menu_text(&app, &toggle_text, &quit_text);
}

#[tauri::command]
fn set_tray_visible(app: AppHandle, visible: bool) {
    SHOW_TRAY.store(visible, Ordering::SeqCst);
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_visible(visible);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(visible);
    }
}

/// Validates that the RGBA byte vector matches the expected dimensions.
fn validate_tray_icon_rgba(rgba: &[u8], width: u32, height: u32) -> Result<(), String> {
    let expected_len = (width as usize) * (height as usize) * 4;
    if rgba.len() != expected_len {
        return Err(format!(
                "Invalid RGBA length: expected {}, got {}",
                expected_len,
                rgba.len()
        ));
    }
    Ok(())
}

#[tauri::command]
fn update_tray_icon_pixels(
    app: AppHandle,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
) -> Result<(), String> {
    validate_tray_icon_rgba(&rgba, width, height)?;

    if let Some(tray) = app.tray_by_id("main-tray") {
        let image = tauri::image::Image::new_owned(rgba, width, height);
        tray.set_icon(Some(image))
            .map_err(|e| format!("Failed to set tray icon pixels: {}", e))?;
    }
    Ok(())
}

// ==========================================
// Helper Functions
// ==========================================

/// Safely show, unminimize, and focus the main window.
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn update_tray_menu_text(app: &AppHandle, toggle_text: &str, quit_text: &str) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "toggle", toggle_text, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", quit_text, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

fn toggle_window_visibility(window: &WebviewWindow) {
    let is_minimized = window.is_minimized().unwrap_or(false);
    let is_visible = window.is_visible().unwrap_or(false);

    if is_minimized || !is_visible {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        let _ = window.hide();
    }
}

#[cfg(windows)]
fn is_mouse_btn_pressed() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON,
    };
    let mask = 0x8000u16.cast_signed();
    unsafe {
        (GetAsyncKeyState(VK_LBUTTON as i32) & mask) != 0
            || (GetAsyncKeyState(VK_RBUTTON as i32) & mask) != 0
            || (GetAsyncKeyState(VK_MBUTTON as i32) & mask) != 0
    }
}

#[cfg(not(windows))]
fn is_mouse_btn_pressed() -> bool {
    use device_query::{DeviceQuery, DeviceState};
    let device_state = DeviceState::new();
    let mouse = device_state.get_mouse();
    // Check if left, right, or middle mouse buttons are pressed
    // index [1] = Left, [2] = Right, [3] = Middle (depending on device_query implementation)
    mouse.button_pressed.iter().any(|&pressed| pressed)
}

// ==========================================
// Application Entry Point
// ==========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
// ==========================================
// Application Entry Point
// ==========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_clipboard_manager::init());
    let is_waiting = Arc::new(AtomicBool::new(false));

    if !std::env::args().any(|arg| arg == "--allow-multiple") {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
    }

    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    show_main_window(app);
                    let _ = app.emit("shortcut-activated", ());
                }
            })
            .build(),
        )
        .setup(|app_mut| {
            // Immediately extract the 'static AppHandle and never reference `app_mut` again
            let app_handle = app_mut.handle();

            // Build the tray icon
            TrayIconBuilder::with_id("main-tray")
                .icon(app_handle.default_window_icon().unwrap().clone())
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            toggle_window_visibility(&window);
                        }
                    }
                    _ => {}
                })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        toggle_window_visibility(&window);
                    }
                }
            })
            .build(app_handle)?;

            // Initialize tray menu texts
            let _ = update_tray_menu_text(&app_handle, "Show / Hide", "Quit");

            if let Some(window) = app_handle.get_webview_window("main") {
                let win_clone = window.clone();
                let event_app_handle = app_handle.clone();

                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        if SHOW_TRAY.load(Ordering::SeqCst) {
                            api.prevent_close();
                            let _ = win_clone.hide();
                        }
                    }
                    WindowEvent::Focused(focused) => {
                        if *focused {
                            if is_mouse_btn_pressed() {
                                is_waiting.store(true, Ordering::SeqCst);
                                let is_waiting_thread = is_waiting.clone();
                                let inner_app_handle = event_app_handle.clone();

                                thread::spawn(move || {
                                    while is_mouse_btn_pressed() {
                                        thread::sleep(Duration::from_millis(10));
                                    }
                                    if is_waiting_thread.swap(false, Ordering::SeqCst) {
                                        let _ = inner_app_handle.emit("event-focus", ());
                                    }
                                });
                            } else {
                                is_waiting.store(false, Ordering::SeqCst);
                                let _ = event_app_handle.emit("event-focus", ());
                            }
                        } else {
                            is_waiting.store(false, Ordering::SeqCst);
                            let _ = event_app_handle.emit("event-blur", ());
                        }
                    }
                    _ => {}
                });

                show_main_window(&app_handle);
            }

            Ok(())
        })
    .invoke_handler(tauri::generate_handler![
        greet,
        update_global_shortcut,
        update_tray_texts,
        set_tray_visible,
        update_tray_icon_pixels
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    }

// ==========================================
// Unit Tests & Logic Helpers
// ==========================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet_normal() {
        let result = greet("Rust");
        assert_eq!(result, "Hello, Rust! You've been greeted from Rust!");
    }

    #[test]
    fn test_greet_empty() {
        let result = greet("");
        assert_eq!(result, "Hello, Friend! You've been greeted from Rust!");
    }

    #[test]
    fn test_shortcut_parsing_valid() {
        assert!("Ctrl+Shift+I".parse::<Shortcut>().is_ok());
        assert!("CmdOrCtrl+Alt+T".parse::<Shortcut>().is_ok());
    }

    #[test]
    fn test_shortcut_parsing_invalid() {
        assert!("InvalidShortcut".parse::<Shortcut>().is_err());
    }

    #[test]
    fn test_validate_tray_icon_rgba_success() {
        let rgba = vec![0; 16];
        let result = validate_tray_icon_rgba(&rgba, 2, 2);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_tray_icon_rgba_mismatch() {
        let rgba = vec![0; 10];
        let result = validate_tray_icon_rgba(&rgba, 2, 2);
        assert!(result.is_err());
    }
}
