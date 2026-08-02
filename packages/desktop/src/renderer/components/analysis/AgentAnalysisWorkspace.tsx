import { AgentAnalysisPage } from "./AgentAnalysisPage";

export function AgentAnalysisWorkspace({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  return (
    <AgentAnalysisPage
      sessionId={sessionId}
      onBack={onBack}
      backLabel="返回分析观测"
    />
  );
}
