//! 事件契约：JSONL 每行一条 `WatchRecord`，字段与 agent-plugins-fs-watch.md 一致。

use notify::event::{ModifyKind, RenameMode};
use notify::EventKind;
use serde::Serialize;

/// 文件契约版本（JSONL 行内 `v` 字段）。改 schema 必须同步设计文档。
pub const CONTRACT_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordKind {
    Created,
    Modified,
    Removed,
    Renamed,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WatchRecord {
    pub v: u32,
    /// RFC3339 本地时区毫秒精度时间戳。
    pub ts: String,
    /// 命中的 watch 根（绝对路径）。
    pub root: String,
    pub kind: RecordKind,
    /// 相对 root 的路径。
    pub path: String,
    /// 仅 renamed 时有值；契约要求 None 序列化为 null。
    pub old_path: Option<String>,
    pub is_dir: bool,
}

/// notify 原始 EventKind → 契约 kind 的粗分类。
///
/// - `Access` 事件是噪音，返回 None 丢弃。
/// - rename 的配对逻辑不在这里（需要 paths 上下文），main 侧处理；
///   这里只把 `Modify(Name(..))` 标记出来。
pub enum MappedKind {
    Plain(RecordKind),
    /// Modify(Name(..))：需要 main 按 RenameMode 与 paths 数量决定形态。
    Rename(RenameMode),
    Ignore,
}

pub fn map_event_kind(kind: &EventKind) -> MappedKind {
    match kind {
        EventKind::Create(_) => MappedKind::Plain(RecordKind::Created),
        EventKind::Remove(_) => MappedKind::Plain(RecordKind::Removed),
        EventKind::Modify(ModifyKind::Name(mode)) => MappedKind::Rename(*mode),
        EventKind::Modify(_) => MappedKind::Plain(RecordKind::Modified),
        EventKind::Access(_) => MappedKind::Ignore,
        EventKind::Any | EventKind::Other => MappedKind::Plain(RecordKind::Modified),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, DataChange, MetadataKind, RemoveKind};

    fn plain(kind: &EventKind) -> Option<RecordKind> {
        match map_event_kind(kind) {
            MappedKind::Plain(k) => Some(k),
            _ => None,
        }
    }

    #[test]
    fn maps_basic_kinds() {
        assert_eq!(plain(&EventKind::Create(CreateKind::File)), Some(RecordKind::Created));
        assert_eq!(plain(&EventKind::Remove(RemoveKind::File)), Some(RecordKind::Removed));
        assert_eq!(
            plain(&EventKind::Modify(ModifyKind::Data(DataChange::Content))),
            Some(RecordKind::Modified),
        );
        assert_eq!(
            plain(&EventKind::Modify(ModifyKind::Metadata(MetadataKind::WriteTime))),
            Some(RecordKind::Modified),
        );
    }

    #[test]
    fn access_events_are_ignored() {
        assert!(matches!(
            map_event_kind(&EventKind::Access(AccessKind::Read)),
            MappedKind::Ignore
        ));
    }

    #[test]
    fn rename_is_flagged_for_main_side_pairing() {
        assert!(matches!(
            map_event_kind(&EventKind::Modify(ModifyKind::Name(RenameMode::Both))),
            MappedKind::Rename(RenameMode::Both)
        ));
    }

    #[test]
    fn jsonl_serialization_matches_contract() {
        let record = WatchRecord {
            v: CONTRACT_VERSION,
            ts: "2026-07-03T16:20:01.123+08:00".to_string(),
            root: "/abs/watched".to_string(),
            kind: RecordKind::Created,
            path: "docs/foo.md".to_string(),
            old_path: None,
            is_dir: false,
        };
        let line = serde_json::to_string(&record).unwrap();
        assert!(line.contains("\"v\":1"));
        assert!(line.contains("\"kind\":\"created\""));
        assert!(line.contains("\"oldPath\":null"));
        assert!(line.contains("\"isDir\":false"));
        assert!(line.contains("\"path\":\"docs/foo.md\""));
    }

    #[test]
    fn renamed_record_carries_old_path() {
        let record = WatchRecord {
            v: CONTRACT_VERSION,
            ts: "2026-07-03T16:20:01.123+08:00".to_string(),
            root: "/abs/watched".to_string(),
            kind: RecordKind::Renamed,
            path: "docs/new.md".to_string(),
            old_path: Some("docs/old.md".to_string()),
            is_dir: false,
        };
        let line = serde_json::to_string(&record).unwrap();
        assert!(line.contains("\"kind\":\"renamed\""));
        assert!(line.contains("\"oldPath\":\"docs/old.md\""));
    }
}
