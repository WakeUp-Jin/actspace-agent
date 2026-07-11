//! fs-watch —— actspace 插件：递归监听目录文件变化，事件按天写 JSONL。
//!
//! 契约事实来源：actspace-agent/docs/design-docs/agent-plugins-fs-watch.md。
//! 与宿主只通过文件交换数据：事件 JSONL + state.json 心跳；不联网、不读文件内容。

mod coalesce;
mod config;
mod event;
mod heartbeat;
mod writer;

use chrono::{Local, SecondsFormat};
use coalesce::{Coalescer, PendingEvent};
use config::Config;
use event::{map_event_kind, MappedKind, RecordKind, WatchRecord, CONTRACT_VERSION};
use heartbeat::{another_instance_alive, Heartbeat, HEARTBEAT_INTERVAL_SECS};
use notify::event::RenameMode;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use writer::DailyWriter;

/// 已上报过 created/modified 且尚未 removed 的路径集合（(root, relPath)）。
///
/// FSEvents 的事件 flag 按路径在时间窗口内**累积**：文件创建后的后续修改、
/// 甚至 watcher 启动前刚创建的文件，都可能持续带 Created flag。单靠 flag 无法
/// 区分 created / modified，需要结合「是否已见过」与 birthtime 二次消歧。
type LiveSet = HashSet<(String, String)>;

const HELP: &str = "\
fs-watch —— 递归监听目录文件变化，事件按天写 JSONL（actspace 插件）

用法：
  fs-watch --config <path>              从 JSON 配置启动（主形态）
  fs-watch --root <dir> --out <dir>     快捷形态：监听单个/多个目录（--root 可重复）
  fs-watch --version
  fs-watch --help

输出（写入 outDir）：
  <YYYY-MM>/<YYYY-MM-DD>.jsonl   事件流，每行一条 JSON：
                                 { v, ts, root, kind, path, oldPath, isDir }
                                 kind = created | modified | removed | renamed
                                 path 为相对 root 的路径
  state.json                     心跳（30s 一次）；lastHeartbeatAt 距今 < 90s 代表存活

配置文件字段（camelCase）：
  version         契约版本，当前 1
  roots           [{ \"path\": \"/abs/dir\" }]
  outDir          事件输出目录（绝对路径）
  excludeNames    命中即整子树排除（默认 .git/node_modules/dist 等）
  excludeHidden   排除 . 开头的隐藏文件/目录（默认 true）
  debounceMs      同路径事件合并窗口（默认 500）
  retentionDays   日文件保留天数（默认 14，过期自清理）

退出码：0 正常；1 参数/配置错误；2 已有实例在运行（心跳新鲜且 pid 存活）。";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match parse_args(&args) {
        ParsedArgs::Help => {
            println!("{HELP}");
            ExitCode::SUCCESS
        }
        ParsedArgs::Version => {
            println!("fs-watch {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        ParsedArgs::Error(message) => {
            eprintln!("fs-watch: {message}\n\n{HELP}");
            ExitCode::from(1)
        }
        ParsedArgs::Run(config) => match run(config) {
            Ok(code) => code,
            Err(message) => {
                eprintln!("fs-watch: {message}");
                ExitCode::from(1)
            }
        },
    }
}

enum ParsedArgs {
    Run(Config),
    Help,
    Version,
    Error(String),
}

fn parse_args(args: &[String]) -> ParsedArgs {
    if args.iter().any(|a| a == "--help" || a == "-h") {
        return ParsedArgs::Help;
    }
    if args.iter().any(|a| a == "--version" || a == "-V") {
        return ParsedArgs::Version;
    }

    let mut config_path: Option<PathBuf> = None;
    let mut roots: Vec<PathBuf> = Vec::new();
    let mut out_dir: Option<PathBuf> = None;

    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--config" => match iter.next() {
                Some(v) => config_path = Some(PathBuf::from(v)),
                None => return ParsedArgs::Error("--config 需要一个路径参数".to_string()),
            },
            "--root" => match iter.next() {
                Some(v) => roots.push(PathBuf::from(v)),
                None => return ParsedArgs::Error("--root 需要一个目录参数".to_string()),
            },
            "--out" => match iter.next() {
                Some(v) => out_dir = Some(PathBuf::from(v)),
                None => return ParsedArgs::Error("--out 需要一个目录参数".to_string()),
            },
            other => return ParsedArgs::Error(format!("未知参数：{other}")),
        }
    }

    match (config_path, roots.is_empty(), out_dir) {
        (Some(path), true, None) => match Config::load(&path) {
            Ok(config) => ParsedArgs::Run(config),
            Err(message) => ParsedArgs::Error(message),
        },
        (Some(_), _, _) => ParsedArgs::Error("--config 不能与 --root / --out 混用".to_string()),
        (None, false, Some(out)) => match Config::from_cli(roots, out) {
            Ok(config) => ParsedArgs::Run(config),
            Err(message) => ParsedArgs::Error(message),
        },
        (None, false, None) => ParsedArgs::Error("使用 --root 时必须提供 --out".to_string()),
        (None, true, _) => ParsedArgs::Error("缺少 --config 或 --root/--out".to_string()),
    }
}

fn run(config: Config) -> Result<ExitCode, String> {
    std::fs::create_dir_all(&config.out_dir)
        .map_err(|e| format!("无法创建输出目录 {}: {e}", config.out_dir.display()))?;

    // 单实例锁：心跳新鲜（< 90s）且该 pid 仍存活才拒启
    if another_instance_alive(&config.out_dir) {
        eprintln!(
            "fs-watch: 已有实例在向 {} 写入（state.json 心跳新鲜且进程存活），本次启动退出",
            config.out_dir.display()
        );
        return Ok(ExitCode::from(2));
    }

    // 规范化 roots；不存在的目录警告后跳过
    let mut roots: Vec<PathBuf> = Vec::new();
    for entry in &config.roots {
        match entry.path.canonicalize() {
            Ok(abs) if abs.is_dir() => roots.push(abs),
            _ => eprintln!("fs-watch: 警告：监听目录不存在或不可访问，已跳过：{}", entry.path.display()),
        }
    }
    // 长 root 优先匹配（嵌套 root 场景归属更精确的那个）
    roots.sort_by_key(|r| std::cmp::Reverse(r.as_os_str().len()));

    let shutdown = Arc::new(AtomicBool::new(false));
    {
        let shutdown = Arc::clone(&shutdown);
        ctrlc::set_handler(move || shutdown.store(true, Ordering::SeqCst))
            .map_err(|e| format!("注册信号处理失败: {e}"))?;
    }

    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher: RecommendedWatcher =
        notify::recommended_watcher(tx).map_err(|e| format!("创建 watcher 失败: {e}"))?;
    for root in &roots {
        watcher
            .watch(root, RecursiveMode::Recursive)
            .map_err(|e| format!("监听 {} 失败: {e}", root.display()))?;
    }

    let mut writer = DailyWriter::new(&config.out_dir, config.retention_days)
        .map_err(|e| format!("初始化 writer 失败: {e}"))?;
    let mut heartbeat = Heartbeat::new(
        &config.out_dir,
        roots.iter().map(|r| r.display().to_string()).collect(),
    );
    heartbeat.beat(writer.overflow()).map_err(|e| format!("写心跳失败: {e}"))?;

    let mut coalescer = Coalescer::new(Duration::from_millis(config.debounce_ms));
    let mut live: LiveSet = HashSet::new();
    let started = SystemTime::now();
    let mut last_beat = Instant::now();

    eprintln!(
        "fs-watch {} 启动：监听 {} 个目录，输出 {}",
        env!("CARGO_PKG_VERSION"),
        roots.len(),
        config.out_dir.display()
    );

    loop {
        if shutdown.load(Ordering::SeqCst) {
            break;
        }

        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Ok(raw)) => {
                handle_raw_event(&config, &roots, &raw, &mut coalescer, &mut writer, &mut live)
            }
            Ok(Err(e)) => eprintln!("fs-watch: watcher 错误：{e}"),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                eprintln!("fs-watch: watcher 通道断开，退出");
                break;
            }
        }

        let now = Instant::now();
        let expired = coalescer.drain_expired(now);
        if !expired.is_empty() {
            flush_records(&mut writer, expired, &mut live, started);
        }
        if now.duration_since(last_beat) >= Duration::from_secs(HEARTBEAT_INTERVAL_SECS) {
            if let Err(e) = heartbeat.beat(writer.overflow()) {
                eprintln!("fs-watch: 写心跳失败：{e}");
            }
            last_beat = now;
        }
    }

    // 优雅退出：flush 合并器、写最后一次心跳
    let remaining = coalescer.drain_all();
    if !remaining.is_empty() {
        flush_records(&mut writer, remaining, &mut live, started);
    }
    let _ = heartbeat.beat(writer.overflow());
    eprintln!("fs-watch: 已退出");
    Ok(ExitCode::SUCCESS)
}

/// 把 notify 原始事件分发到合并器（普通事件）或直接落盘（renamed 成对事件）。
fn handle_raw_event(
    config: &Config,
    roots: &[PathBuf],
    raw: &notify::Event,
    coalescer: &mut Coalescer,
    writer: &mut DailyWriter,
    live: &mut LiveSet,
) {
    let mapped = map_event_kind(&raw.kind);

    // Rename(Both)：paths = [from, to]，直接产出一条 renamed，不进合并器
    if let MappedKind::Rename(RenameMode::Both) = mapped {
        if raw.paths.len() >= 2 {
            let from = locate(config, roots, &raw.paths[0]);
            let to = locate(config, roots, &raw.paths[1]);
            if let (Some((root_from, old_rel)), Some((root_to, new_rel))) = (from, to) {
                // 跨 root 的 rename 退化为 removed + created
                if root_from == root_to {
                    let root_str = root_to.display().to_string();
                    live.remove(&(root_str.clone(), old_rel.clone()));
                    live.insert((root_str.clone(), new_rel.clone()));
                    let record = WatchRecord {
                        v: CONTRACT_VERSION,
                        ts: now_ts(),
                        root: root_str,
                        kind: RecordKind::Renamed,
                        path: new_rel,
                        old_path: Some(old_rel),
                        is_dir: is_dir(&raw.paths[1]),
                    };
                    if let Err(e) = writer.append(&[record]) {
                        eprintln!("fs-watch: 写事件失败：{e}");
                    }
                    return;
                }
            }
            // 有一侧被排除/不在 root 下：仅记录可见一侧
            push_side(config, roots, &raw.paths[0], RecordKind::Removed, coalescer);
            push_side(config, roots, &raw.paths[1], RecordKind::Created, coalescer);
        }
        return;
    }

    for path in &raw.paths {
        let kind = match &mapped {
            MappedKind::Plain(kind) => *kind,
            MappedKind::Rename(RenameMode::From) => RecordKind::Removed,
            MappedKind::Rename(RenameMode::To) => RecordKind::Created,
            // macOS FSEvents 的 rename 常以 Name(Any) 单路径形态到达（旧名/新名各一条），
            // 无法配对；按「路径现在是否存在」消歧：旧名已不存在 → removed，新名存在 → created。
            MappedKind::Rename(_) => {
                if path.exists() { RecordKind::Created } else { RecordKind::Removed }
            }
            MappedKind::Ignore => return,
        };
        push_side(config, roots, path, kind, coalescer);
    }
}

fn push_side(
    config: &Config,
    roots: &[PathBuf],
    abs: &Path,
    kind: RecordKind,
    coalescer: &mut Coalescer,
) {
    let Some((root, relative)) = locate(config, roots, abs) else { return };
    // FSEvents 会把短时间内同一路径的多种变化压成一个带混合 flag 的事件（如「刚创建又被
    // rename 走」仍报 Create）。以当前存在性做最终校正，保证 kind 与磁盘事实一致。
    let kind = match (kind, abs.exists()) {
        (RecordKind::Created | RecordKind::Modified, false) => RecordKind::Removed,
        (RecordKind::Removed, true) => RecordKind::Modified,
        (kind, _) => kind,
    };
    coalescer.push(
        PendingEvent {
            root: root.display().to_string(),
            path: relative,
            kind,
            is_dir: is_dir(abs),
        },
        Instant::now(),
    );
}

/// 找到路径归属的 watch 根（roots 已按长度降序），返回 (root, 相对路径)；
/// 不在任何 root 下或命中排除规则时返回 None。
fn locate<'a>(config: &Config, roots: &'a [PathBuf], abs: &Path) -> Option<(&'a PathBuf, String)> {
    for root in roots {
        if let Ok(relative) = abs.strip_prefix(root) {
            if relative.as_os_str().is_empty() || config.is_excluded(relative) {
                return None;
            }
            return Some((root, relative.display().to_string()));
        }
    }
    None
}

fn flush_records(
    writer: &mut DailyWriter,
    pending: Vec<PendingEvent>,
    live: &mut LiveSet,
    started: SystemTime,
) {
    let ts = now_ts();
    let records: Vec<WatchRecord> = pending
        .into_iter()
        .map(|p| {
            let kind = correct_kind(&p, live, started);
            let key = (p.root.clone(), p.path.clone());
            match kind {
                RecordKind::Removed => {
                    live.remove(&key);
                }
                _ => {
                    live.insert(key);
                }
            }
            WatchRecord {
                v: CONTRACT_VERSION,
                ts: ts.clone(),
                root: p.root,
                kind,
                path: p.path,
                old_path: None,
                is_dir: p.is_dir,
            }
        })
        .collect();
    if let Err(e) = writer.append(&records) {
        eprintln!("fs-watch: 写事件失败：{e}");
    }
}

/// created / modified 消歧。
///
/// FSEvents 的 flag 对同一路径是**累积**的：文件被创建后，后续每次修改的事件都可能
/// 继续携带 Created flag（甚至 watcher 启动前刚创建的文件也如此）。单看 flag 会把
/// 修改误报成 created。校正规则：
/// - 报 created 但本进程已上报过该路径（live 集合命中）→ modified；
/// - 报 created 但文件 birthtime 早于 watcher 启动 → 是启动前就存在的文件 → modified。
fn correct_kind(pending: &PendingEvent, live: &LiveSet, started: SystemTime) -> RecordKind {
    if pending.kind != RecordKind::Created {
        return pending.kind;
    }
    if live.contains(&(pending.root.clone(), pending.path.clone())) {
        return RecordKind::Modified;
    }
    let abs = Path::new(&pending.root).join(&pending.path);
    if let Ok(meta) = std::fs::metadata(&abs) {
        if let Ok(birth) = meta.created() {
            if birth < started {
                return RecordKind::Modified;
            }
        }
    }
    RecordKind::Created
}

fn is_dir(path: &Path) -> bool {
    std::fs::metadata(path).map(|m| m.is_dir()).unwrap_or(false)
}

fn now_ts() -> String {
    Local::now().to_rfc3339_opts(SecondsFormat::Millis, false)
}
