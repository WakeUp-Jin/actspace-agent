//! 按天轮转的 JSONL writer + overflow 熔断 + retention 清理。
//!
//! 布局：`<outDir>/<YYYY-MM>/<YYYY-MM-DD>.jsonl`，只 append 不改写历史行。

use crate::event::WatchRecord;
use chrono::{Local, NaiveDate};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// 单日文件大小上限；超过后停止写事件行并置 overflow（契约：50MB）。
pub const MAX_DAILY_BYTES: u64 = 50 * 1024 * 1024;

pub struct DailyWriter {
    out_dir: PathBuf,
    retention_days: u32,
    current_date: NaiveDate,
    bytes_today: u64,
    overflow: bool,
}

impl DailyWriter {
    pub fn new(out_dir: &Path, retention_days: u32) -> std::io::Result<DailyWriter> {
        let today = Local::now().date_naive();
        let mut writer = DailyWriter {
            out_dir: out_dir.to_path_buf(),
            retention_days,
            current_date: today,
            bytes_today: 0,
            overflow: false,
        };
        writer.bytes_today = writer.existing_size(today);
        writer.overflow = writer.bytes_today >= MAX_DAILY_BYTES;
        writer.cleanup_expired(today)?;
        Ok(writer)
    }

    pub fn overflow(&self) -> bool {
        self.overflow
    }

    /// 追加一批事件行；跨天时先轮转（清 overflow、跑 retention）。
    pub fn append(&mut self, records: &[WatchRecord]) -> std::io::Result<()> {
        if records.is_empty() {
            return Ok(());
        }
        let today = Local::now().date_naive();
        if today != self.current_date {
            self.current_date = today;
            self.bytes_today = self.existing_size(today);
            self.overflow = self.bytes_today >= MAX_DAILY_BYTES;
            self.cleanup_expired(today)?;
        }
        if self.overflow {
            return Ok(());
        }

        let path = self.daily_path(self.current_date);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut buffer = String::new();
        for record in records {
            let line = serde_json::to_string(record)
                .map_err(|e| std::io::Error::other(format!("serialize record: {e}")))?;
            buffer.push_str(&line);
            buffer.push('\n');
        }
        let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
        file.write_all(buffer.as_bytes())?;
        self.bytes_today += buffer.len() as u64;
        if self.bytes_today >= MAX_DAILY_BYTES {
            self.overflow = true;
        }
        Ok(())
    }

    pub fn daily_path(&self, date: NaiveDate) -> PathBuf {
        self.out_dir
            .join(date.format("%Y-%m").to_string())
            .join(format!("{}.jsonl", date.format("%Y-%m-%d")))
    }

    fn existing_size(&self, date: NaiveDate) -> u64 {
        fs::metadata(self.daily_path(date)).map(|m| m.len()).unwrap_or(0)
    }

    /// 删除保留期之外的日文件；顺带删除清空后的月目录。
    fn cleanup_expired(&self, today: NaiveDate) -> std::io::Result<()> {
        let cutoff = today - chrono::Duration::days(i64::from(self.retention_days));
        let months = match fs::read_dir(&self.out_dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(e),
        };
        for month in months.flatten() {
            let month_path = month.path();
            if !month_path.is_dir() {
                continue;
            }
            let Ok(days) = fs::read_dir(&month_path) else { continue };
            for day in days.flatten() {
                let name = day.file_name();
                let name = name.to_string_lossy();
                let Some(date_str) = name.strip_suffix(".jsonl") else { continue };
                let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") else { continue };
                if date < cutoff {
                    let _ = fs::remove_file(day.path());
                }
            }
            // 月目录清空后移除（read_dir 失败 / 非空时静默跳过）
            if fs::read_dir(&month_path).map(|mut d| d.next().is_none()).unwrap_or(false) {
                let _ = fs::remove_dir(&month_path);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{RecordKind, CONTRACT_VERSION};
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_out() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "fs-watch-writer-test-{}-{n}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn record(path: &str) -> WatchRecord {
        WatchRecord {
            v: CONTRACT_VERSION,
            ts: "2026-07-03T00:00:00.000+08:00".to_string(),
            root: "/r".to_string(),
            kind: RecordKind::Created,
            path: path.to_string(),
            old_path: None,
            is_dir: false,
        }
    }

    #[test]
    fn writes_to_month_dir_and_daily_file() {
        let out = temp_out();
        let mut writer = DailyWriter::new(&out, 14).unwrap();
        writer.append(&[record("a.txt"), record("b.txt")]).unwrap();

        let today = Local::now().date_naive();
        let path = writer.daily_path(today);
        assert!(path.starts_with(out.join(today.format("%Y-%m").to_string())));
        let content = fs::read_to_string(&path).unwrap();
        assert_eq!(content.lines().count(), 2);
        assert!(content.lines().all(|l| l.contains("\"v\":1")));
    }

    #[test]
    fn append_only_across_calls() {
        let out = temp_out();
        let mut writer = DailyWriter::new(&out, 14).unwrap();
        writer.append(&[record("a.txt")]).unwrap();
        writer.append(&[record("b.txt")]).unwrap();
        let content = fs::read_to_string(writer.daily_path(Local::now().date_naive())).unwrap();
        assert_eq!(content.lines().count(), 2);
    }

    #[test]
    fn retention_removes_expired_files_and_empty_month_dirs() {
        let out = temp_out();
        let today = Local::now().date_naive();
        let old_date = today - chrono::Duration::days(20);
        let keep_date = today - chrono::Duration::days(3);

        for date in [old_date, keep_date] {
            let month_dir = out.join(date.format("%Y-%m").to_string());
            fs::create_dir_all(&month_dir).unwrap();
            fs::write(
                month_dir.join(format!("{}.jsonl", date.format("%Y-%m-%d"))),
                "{}\n",
            )
            .unwrap();
        }

        let writer = DailyWriter::new(&out, 14).unwrap();
        assert!(!writer.daily_path(old_date).exists(), "过期日文件应被删除");
        assert!(writer.daily_path(keep_date).exists(), "保留期内文件应保留");
        // 20 天前与 3 天前可能同月（月初场景），只有不同月时才断言月目录被清
        if old_date.format("%Y-%m").to_string() != keep_date.format("%Y-%m").to_string()
            && old_date.format("%Y-%m").to_string() != today.format("%Y-%m").to_string()
        {
            assert!(!out.join(old_date.format("%Y-%m").to_string()).exists());
        }
    }

    #[test]
    fn overflow_stops_event_writes() {
        let out = temp_out();
        let today = Local::now().date_naive();
        // 预置一个超限的当日文件
        let month_dir = out.join(today.format("%Y-%m").to_string());
        fs::create_dir_all(&month_dir).unwrap();
        let daily = month_dir.join(format!("{}.jsonl", today.format("%Y-%m-%d")));
        let file = fs::File::create(&daily).unwrap();
        file.set_len(MAX_DAILY_BYTES + 1).unwrap();

        let mut writer = DailyWriter::new(&out, 14).unwrap();
        assert!(writer.overflow());
        writer.append(&[record("a.txt")]).unwrap();
        assert_eq!(fs::metadata(&daily).unwrap().len(), MAX_DAILY_BYTES + 1, "overflow 后不再写入");
    }
}
