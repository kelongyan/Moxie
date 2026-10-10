//! 性能基线测量(默认 #[ignore],用 `cargo test -- --ignored --nocapture` 运行)。
//! 基线机器与数值记录于 AcceptanceReports/ 的 Windows 验收报告。

use laceditor_windows_lib::encodings;
use laceditor_windows_lib::file_io;
use std::time::Instant;

const MB: usize = 1024 * 1024;

fn gen_text(target_bytes: usize) -> String {
    let line = "- 列表项 **加粗** `code`，包含中文与符号 { id: 12345 } 的长行基线数据；\n";
    let n = target_bytes / line.len() + 1;
    line.repeat(n)
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
        let path = dir.join(format!("baseline-{}mb.md", mb));

        bench(&format!("write-{}mb", mb), || {
            file_io::write_text_atomic(&path, &text).unwrap();
        });
        bench(&format!("read+decode-{}mb", mb), || {
            let loaded = file_io::read_text_utf8(&path).unwrap();
            assert_eq!(loaded.len(), text.len());
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
