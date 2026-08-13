// GestiEcole desktop shell (Tauri v2). Loads the bundled web app (frontendDist
// = ../dist) — same code as the web/PWA, works offline.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
