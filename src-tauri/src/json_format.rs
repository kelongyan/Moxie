#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JsonMode {
    Pretty,
    Minify,
}

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
    depth: usize,
    output: String,
    mode: JsonMode,
}

struct FormatError {
    index: usize,
    message: String,
}

const MAX_DEPTH: usize = 512;

impl<'a> Parser<'a> {
    fn new(bytes: &'a [u8], mode: JsonMode) -> Self {
        Parser {
            bytes,
            pos: 0,
            depth: 0,
            output: String::with_capacity(bytes.len() + bytes.len() / 8),
            mode,
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn skip_ws(&mut self) {
        while let Some(b) = self.peek() {
            if matches!(b, b' ' | b'\t' | b'\n' | b'\r') {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    fn err(&self, index: usize, message: &str) -> FormatError {
        FormatError {
            index,
            message: message.to_string(),
        }
    }

    fn newline_indent(&mut self, level: usize) {
        if matches!(self.mode, JsonMode::Pretty) {
            self.output.push('\n');
            for _ in 0..level {
                self.output.push_str("  ");
            }
        }
    }

    fn copy_range(&mut self, start: usize, end: usize) {
        self.output
            .push_str(std::str::from_utf8(&self.bytes[start..end]).unwrap_or(""));
    }

    fn parse_string_raw(&mut self) -> Result<(), FormatError> {
        let start = self.pos;
        self.pos += 1;
        loop {
            match self.peek() {
                None => return Err(self.err(start, "字符串未闭合")),
                Some(b) if b < 0x20 => {
                    return Err(self.err(self.pos, "字符串包含未转义的控制字符"))
                }
                Some(b'"') => {
                    self.pos += 1;
                    self.copy_range(start, self.pos);
                    return Ok(());
                }
                Some(b'\\') => {
                    self.pos += 1;
                    match self.peek() {
                        Some(b'"') | Some(b'\\') | Some(b'/') | Some(b'b') | Some(b'f')
                        | Some(b'n') | Some(b'r') | Some(b't') => {
                            self.pos += 1;
                        }
                        Some(b'u') => {
                            self.pos += 1;
                            for _ in 0..4 {
                                match self.peek() {
                                    Some(h) if h.is_ascii_hexdigit() => self.pos += 1,
                                    _ => {
                                        return Err(self.err(self.pos, "\\u 转义不完整"))
                                    }
                                }
                            }
                        }
                        _ => return Err(self.err(self.pos, "无效的转义字符")),
                    }
                }
                Some(_) => {
                    self.pos += 1;
                }
            }
        }
    }

    fn parse_number(&mut self) -> Result<(), FormatError> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        match self.peek() {
            Some(b'0') => {
                self.pos += 1;
                if matches!(self.peek(), Some(b'0'..=b'9')) {
                    return Err(self.err(start, "数字含前导零"));
                }
            }
            Some(b'1'..=b'9') => {
                while matches!(self.peek(), Some(b'0'..=b'9')) {
                    self.pos += 1;
                }
            }
            _ => return Err(self.err(start, "无效的数字")),
        }
        if self.peek() == Some(b'.') {
            self.pos += 1;
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(self.err(self.pos, "小数点后缺少数字"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        if matches!(self.peek(), Some(b'e') | Some(b'E')) {
            self.pos += 1;
            if matches!(self.peek(), Some(b'+') | Some(b'-')) {
                self.pos += 1;
            }
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(self.err(self.pos, "指数部分缺少数字"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        self.copy_range(start, self.pos);
        Ok(())
    }

    fn parse_literal(&mut self, literal: &'static str) -> Result<(), FormatError> {
        let end = self.pos + literal.len();
        if self.bytes.len() >= end && &self.bytes[self.pos..end] == literal.as_bytes() {
            self.output.push_str(literal);
            self.pos = end;
            Ok(())
        } else {
            Err(self.err(self.pos, "无效的值"))
        }
    }

    fn parse_value(&mut self) -> Result<(), FormatError> {
        match self.peek() {
            Some(b'{') => self.parse_container(b'{', b'}'),
            Some(b'[') => self.parse_container(b'[', b']'),
            Some(b'"') => self.parse_string_raw(),
            Some(b't') => self.parse_literal("true"),
            Some(b'f') => self.parse_literal("false"),
            Some(b'n') => self.parse_literal("null"),
            Some(b'-') | Some(b'0'..=b'9') => self.parse_number(),
            Some(_) => Err(self.err(self.pos, "无效的值")),
            None => Err(self.err(self.pos, "缺少值")),
        }
    }

    fn parse_container(&mut self, open: u8, close: u8) -> Result<(), FormatError> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return Err(self.err(self.pos, "嵌套层数超过 512 层"));
        }
        let level = self.depth;
        self.output.push(open as char);
        self.pos += 1;
        self.skip_ws();

        if self.peek() == Some(close) {
            self.output.push(close as char);
            self.pos += 1;
            self.depth -= 1;
            return Ok(());
        }

        let is_object = open == b'{';
        let mut first = true;
        loop {
            self.skip_ws();
            if self.peek() == Some(close) {
                return Err(self.err(self.pos, "不允许末尾多余逗号"));
            }
            if !first {
                self.output.push(',');
            }
            self.newline_indent(level);

            if is_object {
                if self.peek() != Some(b'"') {
                    return Err(self.err(self.pos, "对象键必须是字符串"));
                }
                self.parse_string_raw()?;
                self.skip_ws();
                if self.peek() != Some(b':') {
                    return Err(self.err(self.pos, "缺少冒号"));
                }
                self.pos += 1;
                if matches!(self.mode, JsonMode::Pretty) {
                    self.output.push_str(": ");
                } else {
                    self.output.push(':');
                }
                self.skip_ws();
            }

            self.parse_value()?;
            first = false;

            self.skip_ws();
            match self.peek() {
                Some(b',') => {
                    self.pos += 1;
                }
                Some(b) if b == close => {
                    self.pos += 1;
                    self.newline_indent(level - 1);
                    self.output.push(close as char);
                    self.depth -= 1;
                    return Ok(());
                }
                Some(_) => {
                    return Err(self.err(self.pos, "缺少逗号或结束括号"))
                }
                None => return Err(self.err(self.pos, "容器未闭合")),
            }
        }
    }
}

fn user_facing_error(bytes: &[u8], error: FormatError) -> String {
    let prefix = &bytes[..error.index.min(bytes.len())];
    let line = prefix.iter().filter(|&&b| b == b'\n').count() + 1;
    let column = prefix
        .iter()
        .rposition(|&b| b == b'\n')
        .map(|p| error.index - p)
        .unwrap_or(error.index + 1);
    format!("JSON 无效:第 {} 行,第 {} 列。{}", line, column, error.message)
}

pub fn format_json(input: &str, mode: JsonMode) -> Result<String, String> {
    let bytes = input.as_bytes();
    let mut parser = Parser::new(bytes, mode);
    parser.skip_ws();
    if parser.peek().is_none() {
        return Err("JSON 无效:内容为空。".to_string());
    }
    parser
        .parse_value()
        .map_err(|e| user_facing_error(bytes, e))?;
    parser.skip_ws();
    if parser.pos != bytes.len() {
        return Err(user_facing_error(
            bytes,
            FormatError {
                index: parser.pos,
                message: "值之后存在多余内容".to_string(),
            },
        ));
    }
    if matches!(mode, JsonMode::Pretty) {
        Ok(format!("{}\n", parser.output))
    } else {
        Ok(parser.output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pretty_preserves_key_order_and_literals() {
        let input = r#"{"b":1.2300e+04,"a":"\u0041","c":0}"#;
        let out = format_json(input, JsonMode::Pretty).unwrap();
        assert_eq!(
            out,
            "{\n  \"b\": 1.2300e+04,\n  \"a\": \"\\u0041\",\n  \"c\": 0\n}\n"
        );
    }

    #[test]
    fn duplicate_keys_are_preserved() {
        let input = r#"{"k":1,"k":2}"#;
        let out = format_json(input, JsonMode::Pretty).unwrap();
        assert_eq!(out, "{\n  \"k\": 1,\n  \"k\": 2\n}\n");
    }

    #[test]
    fn minify_removes_whitespace_only() {
        let input = "{\n  \"a\" : [ 1 , 2.50 , \"x\\/y\" ],\n  \"b\": null\n}";
        let out = format_json(input, JsonMode::Minify).unwrap();
        assert_eq!(out, r#"{"a":[1,2.50,"x\/y"],"b":null}"#);
    }

    #[test]
    fn escape_styles_are_preserved() {
        let input = r#"{"s":"a\/b\u00e9\tc"}"#;
        let out = format_json(input, JsonMode::Minify).unwrap();
        assert_eq!(out, r#"{"s":"a\/b\u00e9\tc"}"#);
    }

    #[test]
    fn trailing_comma_reports_line_column() {
        let input = "{\n\"a\": 1,\n\"b\": 2,\n}";
        let err = format_json(input, JsonMode::Pretty).unwrap_err();
        assert!(err.contains("第 4 行,第 1 列"), "got: {err}");
        assert!(err.contains("末尾多余逗号"), "got: {err}");
    }

    #[test]
    fn invalid_inputs_are_rejected() {
        assert!(format_json("{\"a\": 01}", JsonMode::Pretty).is_err());
        assert!(format_json("{\"a\": 1} extra", JsonMode::Pretty).is_err());
        assert!(format_json("{\"a\": \"\\u12\"}", JsonMode::Pretty).is_err());
        assert!(format_json("{\"a\": \"\u{0001}\"}", JsonMode::Pretty).is_err());
        assert!(format_json("", JsonMode::Pretty).is_err());
        assert!(format_json(" ", JsonMode::Pretty).is_err());
    }

    #[test]
    fn nesting_over_512_is_rejected() {
        let deep = "[".repeat(600) + &"]".repeat(600);
        assert!(format_json(&deep, JsonMode::Pretty).is_err());
        let ok_depth = "[".repeat(500) + &"]".repeat(500);
        assert!(format_json(&ok_depth, JsonMode::Pretty).is_ok());
    }

    #[test]
    fn nested_structure_formats_with_indent() {
        let input = r#"{"a":[{"b":1},2],"c":{"d":[]}}"#;
        let expected = "{\n  \"a\": [\n    {\n      \"b\": 1\n    },\n    2\n  ],\n  \"c\": {\n    \"d\": []\n  }\n}\n";
        assert_eq!(format_json(input, JsonMode::Pretty).unwrap(), expected);
    }

    #[test]
    fn round_trip_minify_of_pretty_is_stable() {
        let input = r#"{"x":[1,{"y":"z"}]}"#;
        let pretty = format_json(input, JsonMode::Pretty).unwrap();
        let minified = format_json(&pretty, JsonMode::Minify).unwrap();
        assert_eq!(minified, input);
    }
}
