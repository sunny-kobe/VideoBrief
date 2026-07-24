import type { RenderAcceptance } from './shortVideoBrief';
import {
  validateBrowserChecks,
  validateSemanticAcceptanceRecord,
} from '../scripts/lib/acceptance-validation.mjs';

export type RenderAcceptanceState =
  | 'awaiting_semantic'
  | 'awaiting_browser'
  | 'review_failed'
  | 'ready';

export function renderAcceptanceState(
  acceptance: RenderAcceptance | undefined,
  currentVideoSha256: string,
): RenderAcceptanceState {
  if (!acceptance || acceptance.videoSha256 !== currentVideoSha256) return 'awaiting_semantic';
  if (acceptance.semantic.status === 'failed') return 'review_failed';
  if (!validateSemanticAcceptanceRecord(acceptance.semantic).passed) return 'awaiting_semantic';
  if (acceptance.browser.status === 'failed') return 'review_failed';
  if (acceptance.browser.status !== 'passed') return 'awaiting_browser';
  if (!validateBrowserChecks(
    acceptance.browser.checks ?? [],
    Number(acceptance.browser.duration),
  ).passed) return 'awaiting_browser';
  return 'ready';
}
