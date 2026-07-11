//! 插件配置：`--config <path>` 加载 JSON，或由 `--root/--out` 快捷参数构造。
//!
//! 字段名与 actspace 契约（agent-plugins-fs-watch.md）保持 camelCase 一致。

use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

/// 与 Kairos `DEFAULT_WATCH_EXCLUDE` 对齐的默认排除名单（契约要求）。
pub const DEFAULT_EXCLUDE_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    ".DS_Store",
    ".cache",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "venv",
    "target",
];

pub const DEFAULT_DEBOUNCE_MS: u64 = 500;
pub const DEFAULT_RETENTION_DAYS: u32 = 14;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootEntry {
    pub path: PathBuf,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub version: u32,
    pub roots: Vec<RootEntry>,
    pub out_dir: PathBuf,
    pub exclude_names: Vec<String>,
    pub exclude_hidden: bool,
    pub debounce_ms: u64,
    pub retention_days: u32,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            version: 1,
            roots: Vec::new(),
            out_dir: PathBuf::new(),
            exclude_names: DEFAULT_EXCLUDE_NAMES.iter().map(|s| s.to_string()).collect(),
            exclude_hidden: true,
            debounce_ms: DEFAULT_DEBOUNCE_MS,
            retention_days: DEFAULT_RETENTION_DAYS,
        }
    }
}

impl Config {
    pub fn load(path: &Path) -> Result<Config, String> {
        let raw = fs::read_to_string(path)
            .map_err(|e| format!("无法读取配置文件 {}: {e}", path.display()))?;
        let config: Config = serde_json::from_str(&raw)
            .map_err(|e| format!("配置文件 {} 不是合法 JSON: {e}", path.display()))?;
        config.validate()?;
        Ok(config)
    }

    pub fn from_cli(roots: Vec<PathBuf>, out_dir: PathBuf) -> Result<Config, String> {
        let config = Config {
            roots: roots.into_iter().map(|path| RootEntry { path }).collect(),
            out_dir,
            ..Config::default()
        };
        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> Result<(), String> {
        if self.out_dir.as_os_str().is_empty() {
            return Err("配置缺少 outDir（事件输出目录）".to_string());
        }
        if self.debounce_ms == 0 || self.debounce_ms > 60_000 {
            return Err("debounceMs 必须在 1..=60000 之间".to_string());
        }
        Ok(())
    }

    /// 判断相对路径是否应被排除：任一路径分量命中 excludeNames，
    /// 或（excludeHidden 时）以 `.` 开头。
    pub fn is_excluded(&self, relative: &Path) -> bool {
        for component in relative.components() {
            let name = component.as_os_str().to_string_lossy();
            if self.exclude_names.iter().any(|e| e == name.as_ref()) {
                return true;
            }
            if self.exclude_hidden && name.starts_with('.') {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let json = r#"{ "outDir": "/tmp/out", "roots": [{ "path": "/tmp/watched" }] }"#;
        let config: Config = serde_json::from_str(json).unwrap();
        assert_eq!(config.debounce_ms, DEFAULT_DEBOUNCE_MS);
        assert_eq!(config.retention_days, DEFAULT_RETENTION_DAYS);
        assert!(config.exclude_hidden);
        assert!(config.exclude_names.iter().any(|n| n == "node_modules"));
    }

    #[test]
    fn validate_rejects_empty_out_dir() {
        let config = Config::default();
        assert!(config.validate().is_err());
    }

    #[test]
    fn bad_json_reports_readable_error() {
        let dir = std::env::temp_dir().join("fs-watch-test-bad-json");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.json");
        std::fs::write(&path, "{ not json").unwrap();
        let err = Config::load(&path).unwrap_err();
        assert!(err.contains("不是合法 JSON"));
    }

    #[test]
    fn exclusion_matches_components_and_hidden() {
        let config = Config::default();
        assert!(config.is_excluded(Path::new("node_modules/pkg/index.js")));
        assert!(config.is_excluded(Path::new("src/.hidden/file.txt")));
        assert!(config.is_excluded(Path::new(".env")));
        assert!(!config.is_excluded(Path::new("src/main.rs")));
    }

    #[test]
    fn exclude_hidden_false_allows_dotfiles() {
        let config = Config { exclude_hidden: false, ..Config::default() };
        assert!(!config.is_excluded(Path::new(".env")));
        // excludeNames 仍然生效（.git 在名单里）
        assert!(config.is_excluded(Path::new(".git/HEAD")));
    }
}
