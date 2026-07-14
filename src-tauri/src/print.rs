//! Native printing. `window.print()` is a silent no-op in macOS WKWebView,
//! so the Quiz view invokes this command instead; wry's `print()` opens the
//! macOS print dialog (which includes "Save as PDF").

use crate::error::Result;

/// Open the native print dialog for the webview's current content.
/// Returns `true` when handled natively; `false` tells the frontend to fall
/// back to `window.print()` (which works on non-macOS platforms).
#[tauri::command]
pub fn print_page(webview: tauri::Webview) -> Result<bool> {
    #[cfg(target_os = "macos")]
    {
        webview.print()?;
        Ok(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = webview;
        Ok(false)
    }
}
