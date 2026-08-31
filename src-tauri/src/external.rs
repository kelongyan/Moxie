/// 外部链接与系统委托能力。
///
/// 应用自身不发起任何网络连接；打开链接仅通过系统浏览器委托，
/// 且只放行 http/https 两类 URL。
pub fn is_openable_url(url: &str) -> bool {
    let rest = if let Some(r) = url.strip_prefix("https://") {
        r
    } else if let Some(r) = url.strip_prefix("http://") {
        r
    } else {
        return false;
    };
    if rest.len() > 8192 {
        return false;
    }
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() {
        return false;
    }
    !rest
        .chars()
        .any(|c| c.is_whitespace() || c.is_control() || matches!(c, '"' | '<' | '>' | '\\'))
}

#[cfg(windows)]
pub fn open_url(url: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;

    if !is_openable_url(url) {
        return Err("unsupported-url".to_string());
    }
    let file: Vec<u16> = std::ffi::OsStr::new(url)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let verb: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
    // SW_SHOWNORMAL = 1；返回句柄 ≤ 32 表示失败
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };
    if (result as usize) <= 32 {
        return Err("open-failed".to_string());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn open_url(_url: &str) -> Result<(), String> {
    Err("当前平台不支持".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_plain_http_urls() {
        assert!(is_openable_url("https://example.com"));
        assert!(is_openable_url("http://example.com/a/b?c=1#d"));
        assert!(is_openable_url("https://例子.中国/路径"));
    }

    #[test]
    fn rejects_non_http_schemes() {
        assert!(!is_openable_url("file:///C:/Windows/system.ini"));
        assert!(!is_openable_url("javascript:alert(1)"));
        assert!(!is_openable_url("vbscript:msgbox(1)"));
        assert!(!is_openable_url("https:example.com"));
        assert!(!is_openable_url(""));
    }

    #[test]
    fn rejects_hostless_or_malformed_urls() {
        assert!(!is_openable_url("https://"));
        assert!(!is_openable_url("http:///path"));
        assert!(!is_openable_url("https://a b.com"));
        assert!(!is_openable_url("https://example.com/\u{0000}"));
        assert!(!is_openable_url(&format!("https://example.com/{}", "a".repeat(9000))));
    }
}
