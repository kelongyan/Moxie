//! 性能基线测量(默认 #[ignore],用 `cargo test -- --ignored --nocapture` 运行)。
//! 基线机器与数值记录于 AcceptanceReports/ 的 Windows 验收报告。

use laceditor_windows_lib::encodings;
use laceditor_windows_lib::file_io;
use laceditor_windows_lib::json_format;
use std::time::Instant;

const MB: usize = 1024 * 1024;

fn gen_text(target_bytes: usize) -> String {
    let line = "const item = { id: 12345, name: \"LacEditor baseline line\", value: 3.14159 };\n";
    let n = target_bytes / line.len() + 1;
    line.repeat(n)
}

fn gen_json(target_bytes: usize) -> String {
    let mut s = String::with_capacity(target_bytes + 1024);
    s.push_str("{\"items\":[");
    let item = r#"{"id":12345,"name":"LacEditor","value":3.14159,"tags":["a","b","c"]}"#;
    let mut size = s.len();
    let mut first = true;
    while size < target_bytes {
        if !first {
            s.push(',');
        }
        s.push_str(item);
        size += item.len() + 1;
        first = false;
    }
    s.push_str("]}");
    s
}

fn bench<F: FnOnce()>(name: &str, f: F) {
    let start = Instant::now();
    f();
    println!("PERF {} : {:.2} ms", name, start.elapsed().as_secs_f64() * 1000.0);
}

#[test]
#[ignore]
fn perf_baseline() {
    let dir = std::env::temp_dir().join("laceditor-perf");
    std::fs::create_dir_all(&dir).unwrap();

    for mb in [1usize, 10, 20, 50] {
        let text = gen_text(mb * MB);
        let path = dir.join(format!("baseline-{}mb.txt", mb));

        bench(&format!("write-{}mb", mb), || {
            file_io::write_text_atomic(&path, &text).unwrap();
        });
        bench(&format!("read+decode-{}mb", mb), || {
            let loaded = file_io::read_text_utf8(&path).unwrap();
            assert_eq!(loaded.len(), text.len());
        });
    }

    // JSON 格式化基线(美化),1/10MB
    for mb in [1usize, 10] {
        let json = gen_json(mb * MB);
        bench(&format!("json-format-{}mb", mb), || {
            let out = json_format::format_json(&json, json_format::JsonMode::Pretty).unwrap();
            assert!(out.len() > json.len());
        });
        bench(&format!("json-minify-{}mb", mb), || {
            let out = json_format::format_json(&json, json_format::JsonMode::Minify).unwrap();
            assert!(out.len() <= json.len());
        });
    }

    // GB18030 编码/解码基线(10MB,含中文)
    let zh = " LacEditor 中文性能基线 ";
    let zh_text = zh.repeat((10 * MB) / zh.len() + 1);
    bench("gb18030-encode-10mb", || {
        let _ = encodings::encode_strict(encodings::EncodingId::Gb18030, &zh_text).unwrap();
    });
    let gb_bytes = encodings::encode_strict(encodings::EncodingId::Gb18030, &zh_text).unwrap();
    bench("gb18030-decode-10mb", || {
        let _ = encodings::decode_strict(encodings::EncodingId::Gb18030, &gb_bytes).unwrap();
    });

    println!("PERF done");
}
