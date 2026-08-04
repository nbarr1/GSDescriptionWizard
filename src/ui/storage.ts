/**
 * Draft persistence, opt-in only.
 *
 * These tools get used on shared shop-floor kiosks. Persisting a draft by
 * default would leave one person's incident description on screen for the next
 * person who walks up, so persistence is off until the user ticks a box, and it
 * expires on its own.
 */

import type { SessionState } from '../types';
import { APP_VERSION } from '../config';

const KEY = 'ii-description-wizard.draft';
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredDraft {
  version: string;
  savedAt: number;
  session: SessionState;
  /** Where the user was. Restoring answers but not position is disorienting. */
  step: string;
}

export interface RestoredDraft {
  session: SessionState;
  step: string;
}

function available(): boolean {
  try {
    const probe = '__ii_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function saveDraft(session: SessionState, step: string): void {
  if (!available()) return;
  // Opting out must actively remove what was already stored, not just stop writing.
  if (!session.persist) {
    clearDraft();
    return;
  }
  try {
    const draft: StoredDraft = { version: APP_VERSION, savedAt: Date.now(), session, step };
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // A full or restricted store is not worth interrupting the user over.
  }
}

export function loadDraft(ttlMs: number = DEFAULT_TTL_MS): RestoredDraft | null {
  if (!available()) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const draft = JSON.parse(raw) as StoredDraft;
    if (draft.version !== APP_VERSION) {
      clearDraft();
      return null;
    }
    if (Date.now() - draft.savedAt > ttlMs) {
      clearDraft();
      return null;
    }
    if (!draft.session?.answers || !draft.step) {
      clearDraft();
      return null;
    }
    return { session: draft.session, step: draft.step };
  } catch {
    clearDraft();
    return null;
  }
}

export function clearDraft(): void {
  if (!available()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing useful to do.
  }
}
