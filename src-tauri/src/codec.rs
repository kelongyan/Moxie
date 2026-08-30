pub const WARNING_BYTES: usize = 8 * 1024 * 1024;
pub const LIMIT_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug)]
pub struct CodecError {
    pub message: String,
    pub needs_confirmation: bool,
}

impl CodecError {
    fn new(message: &str) -> Self {
        CodecError {
            message: message.to_string(),
            needs_confirmation: false,
        }
    }

    fn confirmation(message: &str) -> Self {
        CodecError {
            message: message.to_string(),
            needs_confirmation: true,
        }
    }
}

pub type CodecResult = Result<String, CodecError>;

fn check_size(text: &str, confirmed: bool) -> Result<(), CodecError> {
    let bytes = text.len();
    if bytes > LIMIT_BYTES {
        return Err(CodecError::new("内容超过 32MB 上限,无法处理"));
    }
    if bytes > WARNING_BYTES && !confirmed {
        return Err(CodecError::confirmation("选区超过 8MB,确认要继续吗?"));
    }
    Ok(())
}

const HEX_DIGITS: &[u8; 16] = b"0123456789ABCDEF";

fn is_unreserved(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')')
}

pub fn url_component_encode(text: &str) -> CodecResult {
    let mut out = String::with_capacity(text.len());
    for &b in text.as_bytes() {
        if is_unreserved(b) {
            out.push(b as char);
        } else {
            out.push('%');
            out.push(HEX_DIGITS[(b >> 4) as usize] as char);
            out.push(HEX_DIGITS[(b & 0x0F) as usize] as char);
        }
    }
    Ok(out)
}

fn percent_decode(bytes: &[u8], plus_as_space: bool) -> CodecResult {
    let mut decoded: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' => {
                if i + 2 >= bytes.len() {
                    return Err(CodecError::new("百分号转义不完整"));
                }
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                match (hi, lo) {
                    (Some(h), Some(l)) => {
                        decoded.push((h * 16 + l) as u8);
                        i += 3;
                    }
                    _ => return Err(CodecError::new("百分号转义包含非法字符")),
                }
            }
            b'+' if plus_as_space => {
                decoded.push(b' ');
                i += 1;
            }
            b => {
                decoded.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(decoded).map_err(|_| CodecError::new("解码结果不是有效的 UTF-8"))
}

pub fn url_component_decode(text: &str) -> CodecResult {
    percent_decode(text.as_bytes(), false)
}

pub fn url_form_decode(text: &str) -> CodecResult {
    percent_decode(text.as_bytes(), true)
}

const BASE64_STD: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

fn base64_encode_with(text: &str, alphabet: &[u8; 64], padding: bool) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(alphabet[((triple >> 18) & 63) as usize] as char);
        out.push(alphabet[((triple >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(alphabet[((triple >> 6) & 63) as usize] as char);
        } else if padding {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(alphabet[(triple & 63) as usize] as char);
        } else if padding {
            out.push('=');
        }
    }
    out
}

pub fn base64_encode(text: &str) -> CodecResult {
    Ok(base64_encode_with(text, BASE64_STD, true))
}

pub fn base64url_encode(text: &str) -> CodecResult {
    Ok(base64_encode_with(text, BASE64_URL, false))
}

fn base64_decode_with(text: &str, alphabet: &[u8; 64]) -> CodecResult {
    let cleaned: Vec<u8> = text
        .bytes()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();
    let mut values: Vec<u8> = Vec::with_capacity(cleaned.len());
    let mut pad = 0usize;
    for &b in cleaned.iter() {
        if b == b'=' {
            pad += 1;
            continue;
        }
        let pos = alphabet.iter().position(|&a| a == b);
        match pos {
            Some(v) => values.push(v as u8),
            None => return Err(CodecError::new("Base64 包含非法字符")),
        }
        if pad > 0 {
            return Err(CodecError::new("Base64 填充位置错误"));
        }
    }
    if pad > 2 {
        return Err(CodecError::new("Base64 填充过多"));
    }
    let full = values.len() / 4;
    let remainder = values.len() % 4;
    if remainder == 1 {
        return Err(CodecError::new("Base64 长度无效"));
    }
    let mut out: Vec<u8> = Vec::with_capacity(full * 3 + 2);
    for chunk in values.chunks(4) {
        let len = chunk.len();
        let v0 = chunk[0] as u32;
        let v1 = *chunk.get(1).unwrap_or(&0) as u32;
        let v2 = *chunk.get(2).unwrap_or(&0) as u32;
        let v3 = *chunk.get(3).unwrap_or(&0) as u32;
        let triple = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
        out.push(((triple >> 16) & 0xFF) as u8);
        if len > 2 {
            out.push(((triple >> 8) & 0xFF) as u8);
        }
        if len > 3 {
            out.push((triple & 0xFF) as u8);
        }
    }
    String::from_utf8(out).map_err(|_| CodecError::new("解码结果不是有效的 UTF-8"))
}

pub fn base64_decode(text: &str) -> CodecResult {
    base64_decode_with(text, BASE64_STD)
}

pub fn base64url_decode(text: &str) -> CodecResult {
    base64_decode_with(text, BASE64_URL)
}

pub fn html_encode(text: &str) -> CodecResult {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            other => out.push(other),
        }
    }
    Ok(out)
}

pub fn html_decode(text: &str) -> CodecResult {
    let mut out = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '&' {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        let rest: String = chars[i..].iter().collect();
        let semi = rest.find(';');
        match semi {
            Some(end) if end >= 2 && end <= 10 => {
                let entity = &rest[1..end];
                let decoded = if let Some(num) = entity.strip_prefix("#x").or_else(|| entity.strip_prefix("#X")) {
                    u32::from_str_radix(num, 16)
                        .ok()
                        .and_then(char::from_u32)
                } else if let Some(num) = entity.strip_prefix('#') {
                    num.parse::<u32>().ok().and_then(char::from_u32)
                } else {
                    match entity {
                        "amp" => Some('&'),
                        "lt" => Some('<'),
                        "gt" => Some('>'),
                        "quot" => Some('"'),
                        "apos" => Some('\''),
                        "nbsp" => Some('\u{00A0}'),
                        _ => None,
                    }
                };
                match decoded {
                    Some(c) => {
                        out.push(c);
                        i += end + 1;
                    }
                    None => {
                        return Err(CodecError::new(&format!("无法识别 HTML 实体 &{};", entity)))
                    }
                }
            }
            _ => return Err(CodecError::new("HTML 实体缺少分号")),
        }
    }
    Ok(out)
}

pub fn unicode_escape(text: &str) -> CodecResult {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        let code = c as u32;
        if code >= 0x80 {
            let mut buf = [0u16; 2];
            for unit in c.encode_utf16(&mut buf).iter() {
                out.push_str(&format!("\\u{:04x}", unit));
            }
        } else if c == '\\' {
            out.push_str("\\\\");
        } else {
            out.push(c);
        }
    }
    Ok(out)
}

pub fn unicode_unescape(text: &str) -> CodecResult {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '\\' {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        if i + 1 >= chars.len() {
            return Err(CodecError::new("反斜杠转义不完整"));
        }
        match chars[i + 1] {
            '\\' => {
                out.push('\\');
                i += 2;
            }
            'u' => {
                if i + 6 > chars.len() {
                    return Err(CodecError::new("\\u 转义不完整"));
                }
                let hex: String = chars[i + 2..i + 6].iter().collect();
                let unit = u16::from_str_radix(&hex, 16)
                    .map_err(|_| CodecError::new("\\u 转义包含非法字符"))?;
                if (0xD800..=0xDBFF).contains(&unit) {
                    if chars.len() >= i + 12 && chars[i + 6] == '\\' && chars[i + 7] == 'u' {
                        let hex2: String = chars[i + 8..i + 12].iter().collect();
                        if let Ok(low) = u16::from_str_radix(&hex2, 16) {
                            if (0xDC00..=0xDFFF).contains(&low) {
                                let combined = 0x10000
                                    + ((unit as u32 - 0xD800) << 10)
                                    + (low as u32 - 0xDC00);
                                if let Some(c) = char::from_u32(combined) {
                                    out.push(c);
                                    i += 12;
                                    continue;
                                }
                            }
                        }
                    }
                    return Err(CodecError::new("孤立的 UTF-16 代理项"));
                }
                match char::from_u32(unit as u32) {
                    Some(c) => {
                        out.push(c);
                        i += 6;
                    }
                    None => return Err(CodecError::new("\\u 转义不是有效字符")),
                }
            }
            other => {
                return Err(CodecError::new(&format!("无法识别的转义 \\{}", other)))
            }
        }
    }
    Ok(out)
}

pub fn smart_decode(text: &str) -> CodecResult {
    let trimmed = text.trim();
    if trimmed.contains('%') {
        if let Ok(out) = url_component_decode(trimmed) {
            return Ok(out);
        }
    }
    if trimmed.contains('&') {
        if let Ok(out) = html_decode(trimmed) {
            return Ok(out);
        }
    }
    if trimmed.contains("\\u") {
        if let Ok(out) = unicode_unescape(trimmed) {
            return Ok(out);
        }
    }
    let compact: String = trimmed.chars().filter(|c| !c.is_whitespace()).collect();
    if !compact.is_empty() && compact.len() % 4 != 1 {
        if compact.bytes().all(|b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'+' | b'/' | b'=')) {
            if let Ok(out) = base64_decode(&compact) {
                return Ok(out);
            }
        }
        if compact.bytes().all(|b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'=')) {
            if let Ok(out) = base64url_decode(&compact) {
                return Ok(out);
            }
        }
    }
    Err(CodecError::new("无法识别编码格式"))
}

pub fn run_operation(operation: &str, text: &str, confirmed: bool) -> CodecResult {
    check_size(text, confirmed)?;
    match operation {
        "url-encode" => url_component_encode(text),
        "url-decode" => url_component_decode(text),
        "url-form-decode" => url_form_decode(text),
        "base64-encode" => base64_encode(text),
        "base64-decode" => base64_decode(text),
        "base64url-encode" => base64url_encode(text),
        "base64url-decode" => base64url_decode(text),
        "html-encode" => html_encode(text),
        "html-decode" => html_decode(text),
        "unicode-escape" => unicode_escape(text),
        "unicode-unescape" => unicode_unescape(text),
        "smart-decode" => smart_decode(text),
        other => Err(CodecError::new(&format!("未知操作 {}", other))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_component_round_trip() {
        let text = "a b&c=中/?#";
        let encoded = url_component_encode(text).unwrap();
        assert!(encoded.contains("%20"));
        assert!(encoded.contains("%E4%B8%AD"));
        assert_eq!(url_component_decode(&encoded).unwrap(), text);
    }

    #[test]
    fn url_form_decode_turns_plus_into_space() {
        assert_eq!(url_form_decode("a+b%20c").unwrap(), "a b c");
    }

    #[test]
    fn invalid_percent_sequence_rejected() {
        assert!(url_component_decode("50%").is_err());
        assert!(url_component_decode("%ZZ").is_err());
    }

    #[test]
    fn base64_round_trip_with_padding() {
        for text in ["a", "ab", "abc", "中文 🚀"] {
            let encoded = base64_encode(text).unwrap();
            assert_eq!(base64_decode(&encoded).unwrap(), text);
        }
        assert_eq!(base64_encode("a").unwrap(), "YQ==");
    }

    #[test]
    fn base64url_has_no_padding() {
        let encoded = base64url_encode("a").unwrap();
        assert_eq!(encoded, "YQ");
        assert_eq!(base64url_decode("YQ").unwrap(), "a");
    }

    #[test]
    fn base64_rejects_invalid_input() {
        assert!(base64_decode("$$$").is_err());
        assert!(base64_decode("YQ===").is_err());
    }

    #[test]
    fn html_round_trip() {
        let text = "<div class=\"a\">A & B's</div>";
        let encoded = html_encode(text).unwrap();
        assert!(encoded.contains("&lt;") && encoded.contains("&amp;"));
        assert_eq!(html_decode(&encoded).unwrap(), text);
    }

    #[test]
    fn html_numeric_entities() {
        assert_eq!(html_decode("&#x4e2d;&#25991;").unwrap(), "中文");
        assert!(html_decode("&unknown;").is_err());
    }

    #[test]
    fn unicode_escape_round_trip() {
        let text = "a中\\文🚀";
        let escaped = unicode_escape(text).unwrap();
        assert!(escaped.contains("\\u4e2d"));
        assert!(escaped.contains("\\\\"));
        assert_eq!(unicode_unescape(&escaped).unwrap(), text);
    }

    #[test]
    fn unicode_surrogate_pair() {
        assert_eq!(unicode_unescape("\\ud83d\\ude80").unwrap(), "🚀");
        assert_eq!(unicode_escape("🚀").unwrap(), "\\ud83d\\ude80");
    }

    #[test]
    fn smart_decode_detects_formats() {
        assert_eq!(smart_decode("%E4%B8%AD%E6%96%87").unwrap(), "中文");
        assert_eq!(smart_decode("5Lit5paH").unwrap(), "中文");
        assert_eq!(smart_decode("&#20013;&#25991;").unwrap(), "中文");
        assert_eq!(smart_decode("\\u4e2d\\u6587").unwrap(), "中文");
        assert!(smart_decode("plain text!").is_err());
    }

    #[test]
    fn size_limits_enforced() {
        let big = "x".repeat(WARNING_BYTES + 10);
        let err = run_operation("url-encode", &big, false).unwrap_err();
        assert!(err.needs_confirmation);
        assert!(run_operation("url-encode", &big, true).is_ok());
        let huge = "x".repeat(LIMIT_BYTES + 10);
        let err = run_operation("url-encode", &huge, true).unwrap_err();
        assert!(!err.needs_confirmation);
    }
}
