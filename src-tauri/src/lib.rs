use tauri::Manager;

/// Called by the main window once it is rendered: show it, close the splash
#[tauri::command]
fn close_splash(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
        main.set_focus().map_err(|e| e.to_string())?;
    }
    if let Some(splash) = app.get_webview_window("splashscreen") {
        splash.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// PNG bytes of a file the user picked in the open dialog
#[tauri::command]
fn read_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// Writes the PNG bytes to the path the user picked in the save dialog
#[tauri::command]
fn write_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![close_splash, read_file, write_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
