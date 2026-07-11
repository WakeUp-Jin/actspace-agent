//! state.json 心跳：tmp + rename 原子写，每 30s 一次。
//!
//! 消费方存活判定的唯一标准 = `lastHeartbeatAt` 距今 < 90s（契约）；pid 仅供排障。

use chrono::{DateTime, Local, SecondsFormat};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const HEARTBEAT_INTERVAL_SECS: u64 = 30;
/// 单实例锁判定阈值（3 个心跳周期）。
pub const FRESHNESS_WINDOW_SECS: i64 = 90;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateFile {
    pub v: u32,
    pub pid: u32,
    pub started_at: String,
    pub last_heartbeat_at: String,
    pub roots: Vec<String>,
    pub overflow: bool,
    pub binary_version: String,
}

pub struct Heartbeat {
    path: PathBuf,
    state: StateFile,
}

impl Heartbeat {
    pub fn new(out_dir: &Path, roots: Vec<String>) -> Heartbeat {
        let now = now_rfc3339();
        Heartbeat {
            path: state_path(out_dir),
            state: StateFile {
                v: 1,
                pid: std::process::id(),
                started_at: now.clone(),
                last_heartbeat_at: now,
                roots,
                overflow: false,
                binary_version: env!("CARGO_PKG_VERSION").to_string(),
            },
        }
    }

    /// 写一次心跳（原子写）；overflow 状态由调用方每次注入。
    pub fn beat(&mut self, overflow: bool) -> std::io::Result<()> {
        self.state.last_heartbeat_at = now_rfc3339();
        self.state.overflow = overflow;
        write_atomic(&self.path, &self.state)
    }
}

pub fn state_path(out_dir: &Path) -> PathBuf {
    out_dir.join("state.json")
}

/// 单实例锁：心跳新鲜（< 90s）**且** state.json 里的 pid 仍存活才算有实例在跑。
///
/// 只看心跳会误伤优雅重启：进程退出时会写最后一次心跳（向消费方标记数据截止时间），
/// 90s 内的「停止 → 再启动」（改配置自动重启、快速关开开关）就会被自己的遗言心跳挡住。
pub fn another_instance_alive(out_dir: &Path) -> bool {
    let Ok(raw) = fs::read_to_string(state_path(out_dir)) else { return false };
    let Ok(state) = serde_json::from_str::<StateFile>(&raw) else { return false };
    let Ok(last) = DateTime::parse_from_rfc3339(&state.last_heartbeat_at) else { return false };
    let age = Local::now().signed_duration_since(last);
    age.num_seconds() < FRESHNESS_WINDOW_SECS && pid_alive(state.pid)
}

/// kill(pid, 0) 探活：0 = 存活；EPERM = 存活但无权限；其余（ESRCH 等）= 已退出。
#[cfg(unix)]
fn pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    let ret = unsafe { libc::kill(pid as libc::pid_t, 0) };
    ret == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

/// 非 Unix 平台没有 kill(0) 探活，退化为只看心跳（保守：宁可拒启也不双写）。
#[cfg(not(unix))]
fn pid_alive(_pid: u32) -> bool {
    true
}

fn write_atomic(path: &Path, state: &StateFile) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| std::io::Error::other(format!("serialize state: {e}")))?;
    fs::write(&tmp, json)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

fn now_rfc3339() -> String {
    Local::now().to_rfc3339_opts(SecondsFormat::Millis, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_out(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("fs-watch-heartbeat-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn beat_writes_complete_state_file() {
        let out = temp_out("beat");
        let mut hb = Heartbeat::new(&out, vec!["/watched".to_string()]);
        hb.beat(false).unwrap();

        let raw = fs::read_to_string(state_path(&out)).unwrap();
        let state: StateFile = serde_json::from_str(&raw).unwrap();
        assert_eq!(state.v, 1);
        assert_eq!(state.pid, std::process::id());
        assert_eq!(state.roots, vec!["/watched".to_string()]);
        assert!(!state.overflow);
        assert!(!state.binary_version.is_empty());
        assert!(DateTime::parse_from_rfc3339(&state.last_heartbeat_at).is_ok());
        assert!(!state_path(&out).with_extension("json.tmp").exists(), "tmp 文件应被 rename 走");
    }

    #[test]
    fn fresh_heartbeat_blocks_second_instance() {
        let out = temp_out("lock");
        let mut hb = Heartbeat::new(&out, vec![]);
        hb.beat(false).unwrap();
        assert!(another_instance_alive(&out));
    }

    #[test]
    fn stale_heartbeat_does_not_block() {
        let out = temp_out("stale");
        let stale = StateFile {
            v: 1,
            pid: 1,
            started_at: "2020-01-01T00:00:00.000+08:00".to_string(),
            last_heartbeat_at: "2020-01-01T00:00:00.000+08:00".to_string(),
            roots: vec![],
            overflow: false,
            binary_version: "0.0.0".to_string(),
        };
        write_atomic(&state_path(&out), &stale).unwrap();
        assert!(!another_instance_alive(&out));
    }

    #[test]
    fn fresh_heartbeat_with_dead_pid_does_not_block() {
        // 真实拿一个已退出的 pid：spawn 一个立即结束的子进程并 wait 回收
        let mut child = std::process::Command::new("true").spawn().unwrap();
        let dead_pid = child.id();
        child.wait().unwrap();

        let out = temp_out("deadpid");
        let state = StateFile {
            v: 1,
            pid: dead_pid,
            started_at: now_rfc3339(),
            last_heartbeat_at: now_rfc3339(),
            roots: vec![],
            overflow: false,
            binary_version: "0.0.0".to_string(),
        };
        write_atomic(&state_path(&out), &state).unwrap();
        assert!(!another_instance_alive(&out), "优雅退出后的遗言心跳不应挡住重启");
    }

    #[test]
    fn missing_or_corrupt_state_does_not_block() {
        let out = temp_out("corrupt");
        assert!(!another_instance_alive(&out));
        fs::write(state_path(&out), "not json").unwrap();
        assert!(!another_instance_alive(&out));
    }
}
