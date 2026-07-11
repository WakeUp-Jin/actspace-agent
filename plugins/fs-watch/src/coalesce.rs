//! 去抖合并器（纯逻辑，不依赖 fs / notify）。
//!
//! 契约合并规则（agent-plugins-fs-watch.md）：
//! - 同一 path 在 debounce 窗口内的多次事件合并为一条；
//! - created 后紧跟 modified → created；
//! - created 后紧跟 removed → 互相抵消（不输出）；
//! - modified 后紧跟 removed → removed。
//!
//! renamed 不进合并器：rename 语义即时且成对，main 侧直接落盘。

use crate::event::RecordKind;
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
pub struct PendingEvent {
    pub root: String,
    /// 相对 root 的路径。
    pub path: String,
    pub kind: RecordKind,
    pub is_dir: bool,
}

struct Slot {
    event: PendingEvent,
    last_update: Instant,
}

pub struct Coalescer {
    window: Duration,
    slots: HashMap<(String, String), Slot>,
}

impl Coalescer {
    pub fn new(window: Duration) -> Self {
        Coalescer { window, slots: HashMap::new() }
    }

    /// 吸收一条事件；`now` 由调用方注入以便测试。
    pub fn push(&mut self, event: PendingEvent, now: Instant) {
        let key = (event.root.clone(), event.path.clone());
        match self.slots.get_mut(&key) {
            None => {
                self.slots.insert(key, Slot { event, last_update: now });
            }
            Some(slot) => {
                let merged = merge_kinds(slot.event.kind, event.kind);
                match merged {
                    Merged::Drop => {
                        self.slots.remove(&key);
                    }
                    Merged::Keep(kind) => {
                        slot.event.kind = kind;
                        slot.event.is_dir = event.is_dir || slot.event.is_dir;
                        slot.last_update = now;
                    }
                }
            }
        }
    }

    /// 取出所有已过 debounce 窗口的事件（按稳定顺序：root, path）。
    pub fn drain_expired(&mut self, now: Instant) -> Vec<PendingEvent> {
        let window = self.window;
        let mut expired: Vec<PendingEvent> = Vec::new();
        self.slots.retain(|_, slot| {
            if now.duration_since(slot.last_update) >= window {
                expired.push(slot.event.clone());
                false
            } else {
                true
            }
        });
        expired.sort_by(|a, b| (a.root.as_str(), a.path.as_str()).cmp(&(b.root.as_str(), b.path.as_str())));
        expired
    }

    /// 立即取出全部（优雅退出前 flush）。
    pub fn drain_all(&mut self) -> Vec<PendingEvent> {
        let mut all: Vec<PendingEvent> = self.slots.drain().map(|(_, s)| s.event).collect();
        all.sort_by(|a, b| (a.root.as_str(), a.path.as_str()).cmp(&(b.root.as_str(), b.path.as_str())));
        all
    }

    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.slots.is_empty()
    }
}

enum Merged {
    Keep(RecordKind),
    Drop,
}

fn merge_kinds(existing: RecordKind, incoming: RecordKind) -> Merged {
    use RecordKind::*;
    match (existing, incoming) {
        (Created, Modified) => Merged::Keep(Created),
        (Created, Removed) => Merged::Drop,
        (Modified, Removed) => Merged::Keep(Removed),
        // removed 后又 created：文件被快速重建，最贴近事实的表达是 modified。
        (Removed, Created) => Merged::Keep(Modified),
        (_, incoming) => Merged::Keep(incoming),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(path: &str, kind: RecordKind) -> PendingEvent {
        PendingEvent { root: "/r".to_string(), path: path.to_string(), kind, is_dir: false }
    }

    fn window() -> Duration {
        Duration::from_millis(500)
    }

    #[test]
    fn created_then_modified_stays_created() {
        let mut c = Coalescer::new(window());
        let t0 = Instant::now();
        c.push(event("a.txt", RecordKind::Created), t0);
        c.push(event("a.txt", RecordKind::Modified), t0 + Duration::from_millis(100));
        let out = c.drain_expired(t0 + Duration::from_secs(2));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, RecordKind::Created);
    }

    #[test]
    fn created_then_removed_cancels_out() {
        let mut c = Coalescer::new(window());
        let t0 = Instant::now();
        c.push(event("a.txt", RecordKind::Created), t0);
        c.push(event("a.txt", RecordKind::Removed), t0 + Duration::from_millis(100));
        assert!(c.is_empty());
        assert!(c.drain_expired(t0 + Duration::from_secs(2)).is_empty());
    }

    #[test]
    fn modified_then_removed_becomes_removed() {
        let mut c = Coalescer::new(window());
        let t0 = Instant::now();
        c.push(event("a.txt", RecordKind::Modified), t0);
        c.push(event("a.txt", RecordKind::Removed), t0 + Duration::from_millis(100));
        let out = c.drain_expired(t0 + Duration::from_secs(2));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, RecordKind::Removed);
    }

    #[test]
    fn events_within_window_are_not_drained() {
        let mut c = Coalescer::new(window());
        let t0 = Instant::now();
        c.push(event("a.txt", RecordKind::Modified), t0);
        assert!(c.drain_expired(t0 + Duration::from_millis(100)).is_empty());
        let out = c.drain_expired(t0 + Duration::from_millis(600));
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn window_resets_on_new_event_for_same_path() {
        let mut c = Coalescer::new(window());
        let t0 = Instant::now();
        c.push(event("a.txt", RecordKind::Modified), t0);
        c.push(event("a.txt", RecordKind::Modified), t0 + Duration::from_millis(400));
        // 距第二次 push 只过了 300ms，窗口未到
        assert!(c.drain_expired(t0 + Duration::from_millis(700)).is_empty());
        assert_eq!(c.drain_expired(t0 + Duration::from_millis(1000)).len(), 1);
    }

    #[test]
    fn different_paths_do_not_interfere() {
        let mut c = Coalescer::new(window());
        let t0 = Instant::now();
        c.push(event("a.txt", RecordKind::Created), t0);
        c.push(event("b.txt", RecordKind::Removed), t0);
        let out = c.drain_expired(t0 + Duration::from_secs(2));
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].path, "a.txt");
        assert_eq!(out[0].kind, RecordKind::Created);
        assert_eq!(out[1].path, "b.txt");
        assert_eq!(out[1].kind, RecordKind::Removed);
    }

    #[test]
    fn drain_all_flushes_everything_immediately() {
        let mut c = Coalescer::new(window());
        let t0 = Instant::now();
        c.push(event("a.txt", RecordKind::Created), t0);
        c.push(event("b.txt", RecordKind::Modified), t0);
        assert_eq!(c.drain_all().len(), 2);
        assert!(c.is_empty());
    }
}
