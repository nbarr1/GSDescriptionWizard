/**
 * Clipboard with graceful degradation.
 *
 * Corporate browsers on locked-down images regularly refuse the async clipboard
 * API, and a tool whose only output is "copy this text" cannot afford to fail
 * silently there. Three tiers, in order, and the caller is told which one worked
 * so it can fall back to "select all and press Ctrl C" as a last resort.
 */

export type CopyMethod = 'clipboard-api' | 'exec-command' | 'manual';

export interface CopyResult {
  ok: boolean;
  method: CopyMethod;
  message: string;
}

export async function copyText(text: string, source?: HTMLTextAreaElement): Promise<CopyResult> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return {
        ok: true,
        method: 'clipboard-api',
        message: 'Copied. Paste it into the Injury/Illness Description field on the form.',
      };
    } catch {
      // Permission denied or insecure context - fall through.
    }
  }

  if (execCommandCopy(text, source)) {
    return {
      ok: true,
      method: 'exec-command',
      message: 'Copied. Paste it into the Injury/Illness Description field on the form.',
    };
  }

  if (source) {
    source.focus();
    source.select();
  }
  return {
    ok: false,
    method: 'manual',
    message:
      'This browser blocked the copy. The text is selected - press Ctrl C, or Command C on a Mac, to copy it.',
  };
}

function execCommandCopy(text: string, source?: HTMLTextAreaElement): boolean {
  // Prefer copying from the real textarea so the selection the user sees is the
  // selection that gets copied.
  if (source) {
    const previousStart = source.selectionStart;
    const previousEnd = source.selectionEnd;
    source.focus();
    source.select();
    const ok = runExecCommand();
    source.setSelectionRange(previousStart, previousEnd);
    if (ok) return true;
  }

  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.setAttribute('aria-hidden', 'true');
  scratch.style.position = 'fixed';
  scratch.style.top = '-1000px';
  scratch.style.opacity = '0';
  document.body.appendChild(scratch);
  scratch.select();
  const ok = runExecCommand();
  document.body.removeChild(scratch);
  return ok;
}

function runExecCommand(): boolean {
  try {
    // Deprecated, but it is the only path that works on several locked-down
    // corporate browser configurations, which is exactly where this tool runs.
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/** Offers the composed text as a .txt download, with no network involved. */
export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
