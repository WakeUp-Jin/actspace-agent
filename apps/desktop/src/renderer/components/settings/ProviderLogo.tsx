import { PROVIDER_DEFINITIONS, type LlmProviderId, type ProviderLogoKey } from "@actspace/shared";
import deepseek from "../../assets/provider-marks/deepseek.svg";
import moonshot from "../../assets/provider-marks/moonshot.svg";
import openrouter from "../../assets/provider-marks/openrouter.svg";
import openai from "../../assets/provider-marks/openai.svg";
import grok from "../../assets/provider-marks/grok.svg";
import mistral from "../../assets/provider-marks/mistral.svg";
import groq from "../../assets/provider-marks/groq.svg";
import alibaba from "../../assets/provider-marks/alibaba.svg";
import zai from "../../assets/provider-marks/zai.svg";
import minimax from "../../assets/provider-marks/minimax.svg";
import anthropic from "../../assets/provider-marks/anthropic.svg";
import xiaomi from "../../assets/provider-marks/xiaomi.svg";
import volcengine from "../../assets/provider-marks/volcengine.svg";

// Exact upstream marks and license provenance live next to the SVG assets.
// Monochrome marks use masks so the same geometry follows the active theme.
const MARKS: Partial<Record<ProviderLogoKey, { src: string; monochrome?: boolean }>> = {
  deepseek: { src: deepseek },
  moonshot: { src: moonshot, monochrome: true },
  openrouter: { src: openrouter, monochrome: true },
  openai: { src: openai, monochrome: true },
  grok: { src: grok, monochrome: true },
  mistral: { src: mistral },
  groq: { src: groq, monochrome: true },
  alibaba: { src: alibaba },
  zai: { src: zai, monochrome: true },
  minimax: { src: minimax, monochrome: true },
  anthropic: { src: anthropic },
  xiaomi: { src: xiaomi, monochrome: true },
  volcengine: { src: volcengine, monochrome: true },
};

export function ProviderLogo({ provider, logoKey, compact = false }: { provider: LlmProviderId; logoKey?: ProviderLogoKey; compact?: boolean }) {
  const key = logoKey ?? PROVIDER_DEFINITIONS.find((item) => item.id === provider)?.logoKey ?? "generic";
  const mark = MARKS[key];
  return (
    <span data-provider-logo={mark ? key : "generic"} className={`grid shrink-0 place-items-center rounded-act-md bg-surface-subtle ${compact ? "h-8 w-8" : "h-9 w-9"}`} aria-hidden="true">
      {mark ? mark.monochrome ? (
        <span className="block h-5 w-5 bg-text-main" style={{ maskImage: `url("${mark.src}")`, WebkitMaskImage: `url("${mark.src}")`, maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center" }} />
      ) : <img src={mark.src} alt="" className="h-5 w-5" /> : (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8" /><path d="M8 12h8M12 8v8" /></svg>
      )}
    </span>
  );
}
