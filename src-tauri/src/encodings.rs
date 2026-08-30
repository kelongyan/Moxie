use encoding_rs::{Encoding, GB18030, UTF_16BE, UTF_16LE, WINDOWS_1252};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EncodingId {
    Utf8,
    Utf16Le,
    Utf16Be,
    Gb18030,
    IsoLatin1,
    WinLatin1,
}

impl EncodingId {
    pub fn parse(id: &str) -> Option<EncodingId> {
        match id {
            "utf-8" => Some(EncodingId::Utf8),
            "utf-16le" => Some(EncodingId::Utf16Le),
            "utf-16be" => Some(EncodingId::Utf16Be),
            "utf-16" => Some(EncodingId::Utf16Le),
            "gb18030" => Some(EncodingId::Gb18030),
            "iso-8859-1" => Some(EncodingId::IsoLatin1),
            "windows-1252" => Some(EncodingId::WinLatin1),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            EncodingId::Utf8 => "utf-8",
            EncodingId::Utf16Le => "utf-16le",
            EncodingId::Utf16Be => "utf-16be",
            EncodingId::Gb18030 => "gb18030",
            EncodingId::IsoLatin1 => "iso-8859-1",
            EncodingId::WinLatin1 => "windows-1252",
        }
    }

    fn rs(&self) -> Option<&'static Encoding> {
        match self {
            EncodingId::Utf8 => Some(encoding_rs::UTF_8),
            EncodingId::Utf16Le => Some(UTF_16LE),
            EncodingId::Utf16Be => Some(UTF_16BE),
            EncodingId::Gb18030 => Some(GB18030),
            EncodingId::IsoLatin1 => None,
            EncodingId::WinLatin1 => Some(WINDOWS_1252),
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum CodecError {
    DecodeFailed,
    Unrepresentable,
}

pub fn detect_utf16_variant(bytes: &[u8]) -> (EncodingId, &[u8]) {
    if bytes.len() >= 2 {
        if bytes[0] == 0xFF && bytes[1] == 0xFE {
            return (EncodingId::Utf16Le, &bytes[2..]);
        }
        if bytes[0] == 0xFE && bytes[1] == 0xFF {
            return (EncodingId::Utf16Be, &bytes[2..]);
        }
    }
    (EncodingId::Utf16Le, bytes)
}

pub fn decode_strict(encoding: EncodingId, bytes: &[u8]) -> Result<String, CodecError> {
    if encoding == EncodingId::IsoLatin1 {
        return Ok(bytes.iter().map(|&b| b as char).collect());
    }
    let (variant, payload) = match encoding {
        EncodingId::Utf16Le | EncodingId::Utf16Be => detect_utf16_variant(bytes),
        other => (other, bytes),
    };
    let rs = variant.rs().ok_or(CodecError::DecodeFailed)?;
    let (text, had_errors) = rs.decode_without_bom_handling(payload);
    if had_errors {
        return Err(CodecError::DecodeFailed);
    }
    Ok(text.into_owned())
}

fn encode_utf16(text: &str, big_endian: bool) -> Vec<u8> {
    let mut out = Vec::with_capacity(2 + text.len() * 2);
    if big_endian {
        out.extend_from_slice(&[0xFE, 0xFF]);
    } else {
        out.extend_from_slice(&[0xFF, 0xFE]);
    }
    for unit in text.encode_utf16() {
        if big_endian {
            out.push((unit >> 8) as u8);
            out.push(unit as u8);
        } else {
            out.push(unit as u8);
            out.push((unit >> 8) as u8);
        }
    }
    out
}

pub fn encode_strict(encoding: EncodingId, text: &str) -> Result<Vec<u8>, CodecError> {
    use encoding_rs::EncoderResult;

    match encoding {
        EncodingId::Utf16Le => return Ok(encode_utf16(text, false)),
        EncodingId::Utf16Be => return Ok(encode_utf16(text, true)),
        EncodingId::Utf8 => {
            return Ok(text.as_bytes().to_vec());
        }
        EncodingId::IsoLatin1 => {
            let mut out = Vec::with_capacity(text.len());
            for c in text.chars() {
                let code = c as u32;
                if code > 0xFF {
                    return Err(CodecError::Unrepresentable);
                }
                out.push(code as u8);
            }
            return Ok(out);
        }
        _ => {}
    }

    let mut output: Vec<u8> = Vec::new();
    let rs = encoding.rs().ok_or(CodecError::DecodeFailed)?;
    let mut encoder = rs.new_encoder();
    let mut consumed = 0usize;
    loop {
        let remaining = &text[consumed..];
        let dst_len = encoder
            .max_buffer_length_from_utf8_without_replacement(remaining.len())
            .ok_or(CodecError::Unrepresentable)?;
        let mut dst = vec![0u8; dst_len];
        let (result, read, written) =
            encoder.encode_from_utf8_without_replacement(remaining, &mut dst, true);
        output.extend_from_slice(&dst[..written]);
        consumed += read;
        match result {
            EncoderResult::InputEmpty => return Ok(output),
            EncoderResult::OutputFull => continue,
            EncoderResult::Unmappable(_) => return Err(CodecError::Unrepresentable),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    Lf,
    Cr,
    Crlf,
}

impl LineEnding {
    pub fn as_str(&self) -> &'static str {
        match self {
            LineEnding::Lf => "lf",
            LineEnding::Cr => "cr",
            LineEnding::Crlf => "crlf",
        }
    }

    pub fn sequence(&self) -> &'static str {
        match self {
            LineEnding::Lf => "\n",
            LineEnding::Cr => "\r",
            LineEnding::Crlf => "\r\n",
        }
    }
}

pub fn detect_line_ending(text: &str) -> LineEnding {
    let bytes = text.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        match b {
            b'\r' => {
                return if bytes.get(i + 1) == Some(&b'\n') {
                    LineEnding::Crlf
                } else {
                    LineEnding::Cr
                }
            }
            b'\n' => return LineEnding::Lf,
            _ => {}
        }
    }
    LineEnding::Lf
}

pub fn normalize_to_lf(text: &str) -> String {
    if !text.contains('\r') {
        return text.to_string();
    }
    text.replace("\r\n", "\n").replace('\r', "\n")
}

pub fn apply_line_ending(text: &str, ending: LineEnding) -> String {
    match ending {
        LineEnding::Lf => text.to_string(),
        other => text.replace('\n', other.sequence()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_round_trip() {
        let text = "Moxie 中文 🚀\nsecond line";
        let bytes = encode_strict(EncodingId::Utf8, text).unwrap();
        assert_eq!(decode_strict(EncodingId::Utf8, &bytes).unwrap(), text);
    }

    #[test]
    fn gb18030_round_trip_is_byte_identical() {
        let text = "简体中文文本:你好,世界!";
        let bytes = encode_strict(EncodingId::Gb18030, text).unwrap();
        assert_eq!(decode_strict(EncodingId::Gb18030, &bytes).unwrap(), text);
    }

    #[test]
    fn utf16le_round_trip_with_bom() {
        let text = "abc 中文";
        let bytes = encode_strict(EncodingId::Utf16Le, text).unwrap();
        assert_eq!(&bytes[..2], &[0xFF, 0xFE]);
        let (variant, _) = detect_utf16_variant(&bytes);
        assert_eq!(variant, EncodingId::Utf16Le);
        assert_eq!(decode_strict(EncodingId::Utf16Le, &bytes).unwrap(), text);
    }

    #[test]
    fn utf16be_bom_is_detected() {
        let text = "hi";
        let bytes = encode_strict(EncodingId::Utf16Be, text).unwrap();
        let (variant, _) = detect_utf16_variant(&bytes);
        assert_eq!(variant, EncodingId::Utf16Be);
        assert_eq!(decode_strict(EncodingId::Utf16Be, &bytes).unwrap(), text);
    }

    #[test]
    fn unrepresentable_characters_are_rejected() {
        let text = "emoji not in latin-1: 🚀";
        assert!(matches!(
            encode_strict(EncodingId::IsoLatin1, text),
            Err(CodecError::Unrepresentable)
        ));
        let representable = "caf\u{e9}";
        assert!(encode_strict(EncodingId::IsoLatin1, representable).is_ok());
    }

    #[test]
    fn invalid_gb18030_bytes_fail_decoding() {
        assert!(matches!(
            decode_strict(EncodingId::Gb18030, &[0xFF]),
            Err(CodecError::DecodeFailed)
        ));
    }

    #[test]
    fn line_ending_detection_and_conversion() {
        assert_eq!(detect_line_ending("a\r\nb"), LineEnding::Crlf);
        assert_eq!(detect_line_ending("a\rb"), LineEnding::Cr);
        assert_eq!(detect_line_ending("a\nb"), LineEnding::Lf);
        assert_eq!(detect_line_ending("abc"), LineEnding::Lf);
        assert_eq!(normalize_to_lf("a\r\nb\rc\nd"), "a\nb\nc\nd");
        assert_eq!(apply_line_ending("a\nb", LineEnding::Crlf), "a\r\nb");
        assert_eq!(apply_line_ending("a\nb", LineEnding::Cr), "a\rb");
    }
}
