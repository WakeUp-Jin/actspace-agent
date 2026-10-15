// Ported from DeepSeek Harness packages/client/ui-primitives/src/CodeFileIcon.tsx (MIT license: ./DEEPSEEK_HARNESS_LICENSE.txt).
import { useId } from 'react'
import type { ReactNode } from 'react'
import type { CodeFileType } from './code-file-types'
import { CODE_FILE_ARTWORK, CODE_FILE_ICON_ID_TOKEN } from './code-file-icon-artwork'

/** Render one full-color square code-file glyph from the embedded icon set. */
export function CodeFileIcon({ type, size = 20, className }: { readonly type: CodeFileType; readonly size?: number; readonly className?: string }): ReactNode {
  const instanceId = `act-code-icon-${useId().replaceAll(':', '')}`
  const artwork = CODE_FILE_ARTWORK[type].replaceAll(CODE_FILE_ICON_ID_TOKEN, instanceId)
  // The static table is checked by tests for unsafe markup; per-instance ids keep gradients and clip paths independent.
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: artwork }}
    />
  )
}
