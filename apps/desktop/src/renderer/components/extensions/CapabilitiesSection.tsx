import { EnglishLearningCapability } from "./EnglishLearningCapability";
import { BrowserConnectPanel } from "./BrowserConnectPanel";
import { useBrowserBridgeStatus, hasBrowserBridge } from "../settings/browser-bridge-settings-shared";
import { SectionShell } from "../settings/SettingsPrimitives";

export function CapabilitiesSection({ query = "", onConfigureSpeech }: { query?: string; onConfigureSpeech?: () => void }) {
  const bridgeReady = hasBrowserBridge();
  const { status, refreshStatus } = useBrowserBridgeStatus(bridgeReady);
  const matches = "chrome browser bridge browser use abb 浏览器 扩展".includes(query.trim().toLowerCase());
  const learningMatches = "english learning speech tts 英语辅助学习 语音 朗读".includes(query.trim().toLowerCase());
  return (
    <SectionShell>
      <p className="text-act-xs text-text-faint">能力 · {Number(matches) + Number(learningMatches)}</p>
      {learningMatches && <EnglishLearningCapability onConfigure={onConfigureSpeech} />}
      {!matches && !learningMatches && <p className="py-10 text-center text-act-sm text-text-faint">没有找到匹配的能力。</p>}
      {matches && !bridgeReady && <p className="text-act-sm text-text-faint">Chrome 浏览器连接仅在桌面端可用。</p>}
      {matches && bridgeReady && <div className="grid gap-3 rounded-act-lg bg-surface-subtle p-4">
        <div>
          <h2 className="text-act-sm font-semibold text-text-main">Chrome 浏览器</h2>
          <p className="mt-0.5 text-act-xs text-text-faint">让 Agent 使用你已打开的 Chrome。</p>
        </div>
        <BrowserConnectPanel status={status} refresh={refreshStatus} />
      </div>}
    </SectionShell>
  );
}
