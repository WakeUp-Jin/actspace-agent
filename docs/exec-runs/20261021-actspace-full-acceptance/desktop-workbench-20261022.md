# Desktop workbench real Electron acceptance — 2026-10-22

Method: bundled Playwright Electron UI/CDP against existing dist; no mock. Not native AX, IME, VoiceOver. Isolated ACTSPACE_DATA_DIR and app name; no provider calls. Main PID 4962, renderer PID 4997. Dedicated fixture baseline commit 244b026; all Git writes below confined to fixture. Raw evidence: `tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-workbench-20261022/evidence/`.

## Acceptance points and route groups

Points: D13 file tree/types/source-preview/stale refresh/tabs/open; D14 six scopes/history/upstream/empty/large diff/mutation/dialog/menu; D15 dual terminals/input/output/resize/reclamation; T5 user feedback and CPU/RSS/heap. Routes: files → Review → terminals → cleanup; group boundaries do not reduce points.

| Point | Result | Observed evidence and boundary |
|---|---|---|
| D13 tree/text | Pass | Fixture file tree lists eight files; small text shows changed; `markdown-source.png` |
| D13 Markdown | Pass | Heading, bold, link, table rendered; source shows literal syntax; source/preview toggle |
| D13 CSV | Pass | 2 rows/2 columns; Chinese value correct; plain text toggle; `csv.png`, `csv-source.png` |
| D13 HTML | Pass | Actual sandbox iframe body HTML acceptance / 本地预览; source button; `html.png` |
| D13 image | Pass | PNG img complete=true naturalWidth=1; `image.png` |
| D13 deleted/changed | Partial | Delete small.txt → refresh removes tree row but existing tab retains cached old text; after recreate UI shows disk-changed warning and reload. `deleted-stale-preview.png`; deletion-specific reload behavior not signed off |
| D13 tabs/size | Pass | Five file tabs switch; closing large returns small; resize actual BrowserWindow 1100×760 then 1500×950; sidebar auto-collapses. Full size persistence/restart not covered |
| D13 external/system open (R10) | Partial | Open menu lists VS Code/Cursor/Finder/Terminal/iTerm2, Finder dispatched through UI. External Finder result not visible via Electron CDP; no native evidence. External link dispatch not covered |
| D14 uncommitted/unstaged/staged | Pass | UI counts +6002/-6001; staged empty state verified; stage/unstage small.txt actual Git index status matched |
| D14 last turn | Pass boundary | Without session disabled; created durable empty session via real IPC fixture setup, UI last-turn reports unavailable plus empty state. Actual changed turn not covered |
| D14 committed | Pass | Baseline commit chooser → fixture baseline, +56012, diff original lines from dedicated fixture |
| D14 branch/no upstream | Partial | No-upstream message correct. After local origin/main remote tracking fixture setup UI still lists no tracked branch even after renderer reload. Branch compare not covered; requires investigation of runtime git context/catalog |
| D14 large diff | Pass | 6000 removed +6000 added; one-file mode notice, first 51 rows visible; no freeze observed |
| D14 jump/options (R22) | Partial | Jump popup selects small.txt; options shows refresh/wrap/fullfile/rich/word/whitespace. Mouse scope button blocked by overlaid +6002 count; keyboard focus+Enter works; focus-return not fully instrumented |
| D14 stage/unstage/discard | Pass | Stage → index M; unstage → worktree M; discard first dismissed default confirm, second accept via real JS dialog → disk original and clean small.txt |
| D14 submit cancel (R21) | Pass | UI submit/push menu → message dialog, Cancel exits; no commit/push performed. `commit-cancel.png`; keyboard/focus full sequence not covered |
| D14 conflicts | Uncovered | Dedicated fixture did not construct merge conflict; no claim of conflict acceptance |
| D15 create/input/multiple (R04) | Pass | Two terminals, zsh prompts fixture; input printf returns cwd and shell PID 37898; second shell 39069 |
| D15 output/resize | Pass | 20000 lines reach LOAD-020000; sustained loop 600×sleep .05; switching and resize retained terminal content; `terminal-load.png` |
| D15 close/reclaim | Pass | Close terminal1=38ms, terminal2=31ms; ps shows neither PID 37898 nor 39069 afterwards |
| D15 reopen/workspace attribution | Partial | Fresh terminal creates twice in fixture session/cwd. Cross-session/workspace switch not exercised |
| T5 large text | Fail performance | File 5,250,000 bytes; renderer only shows about 19,784 lines (read cap). First open 1223ms; three switches back 1779/1883/1405ms versus away 110/112/323ms; closing 2754ms. `large-performance.json`, `large.png` |
| T5 terminal | Pass observed | 20000-line loop tab feedback 32–49ms; sustained loop switch 57ms, window resize call 10ms; close 31–38ms. `terminal-load.json`, `terminal-close.json` |
| T5 resources | Recorded | Large sample main 113280KB, renderer 592480KB RSS; renderer lifetime peak later 836096KB. Heap metrics in CDP JSON without manual GC. No leak inference. idle-final.json recorded after terminal work |

## Reproducible issues / suggestions for later discussion

- WB-PERF-01 P2: Open 5.25MB large.txt, switch Markdown→large three times: 1.4–1.9s; close 2.754s. Suggest inspect text preview mounting/highlighting and virtualization; no product edits here.
- WB-UI-01 P2: Review at default right-panel width, +6002/-6001 counts overlap scope button. Playwright normal pointer click repeatedly intercepted by span.text-success; keyboard Enter works. `review-toolbar-overlap.png`. Suggest reserve toolbar minimum space/responsive layout.
- WB-BRANCH-01 unresolved: git branch -vv says main [origin/main] but Review branch picker keeps no-upstream message after reload. Need validate branch catalog runtime context/cache; cannot call branch comparison passed.

Historical IDs: R04 pass; R05 pass with toolbar issue; R06 pass; R10 partial external result; R11 history pass/branch uncovered; R21 mouse cancel pass, full keyboard uncovered; R22 jump pass/scope pointer fail.

No full D13/D14/D15 signoff: external system evidence, conflict route, cross-workspace isolation and native accessibility remain explicit gaps.

## Original handoff step mapping

| Original | Actual substep result |
|---|---|
| 10-A2 | create/input/close pass; second terminal creation pass; exact echo hi not used (printf with cwd/PID instead) |
| 10-A3 | Review auto-update observed after stage/unstage/discard; external edit while already-open Review not independently timed |
| 11-A1 | Markdown HTTPS link rendering pass; native browser target and no-extra-window behavior uncovered |
| 11-A2 | shell PID/input/close pass; Dock reopen uncovered (native Dock boundary) |
| 11-A4 | normal Electron app.close pass, shell PIDs absent; actual Cmd-Q and Bridge subprocess route uncovered |
| 11-B1 | fresh fixture session tree/preview/Review pass; historical worktree session uncovered (no such fixture) |
| R04 | create and command output pass |
| R05 | Review dedicated Git status pass; toolbar pointer failure |
| R06 | tree and file previews pass |
| R10 | menu and Finder dispatch pass; native result uncovered |
| R11 | committed baseline pass; upstream comparison uncovered |
| R21 | dialog/cancel pass; full keyboard/focus uncovered |
| R22 | scope keyboard and jump pass; scope pointer fail; focus-return uninstrumented |

Cleanup: independent main4962/renderer4997 exited normally; shell37898/39069 absent. Initial driver instance3721 terminated separately after stdin closed. User devPID61739 untouched.

## 主审复核

大文本性能与工具栏问题已分别登记[BUG-014](bugs/BUG-014.md)、[BUG-015](bugs/BUG-015.md)。主审对同一fixture只读调用固定built ReviewGitEngine.listBranches返回main→origin/main（ahead/behind均0），见branches-engine-check.json；因此WB-BRANCH-01底层列表正确，UI session/workspace上下文仍需复核，尚不能认定独立产品Bug或签收分支比较。

### 主审复核更正（2026-10-22）

WB-BRANCH-01不认定产品Bug：固定built ReviewGitEngine针对fixture返回main→origin/main、ahead0/behind0，证据`evidence/branches-engine-check.json`。底层正确，既有UI现象可能来自session/workspace上下文不同；UI链路仍需定向复核，不由底层结果替代UI通过。
