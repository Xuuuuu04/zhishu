import { getVisualForTool, PHASE_STANDBY, PHASE_REVIEW } from '../../constants/toolVisuals';

// Re-export the shared duration formatter so sidebar sub-components
// can keep importing from helpers.js without changing call sites.
export { formatDuration as fmtDuration } from '../../utils/format';

// Semantic phase colors re-exported for local readability
const COLOR_STANDBY = PHASE_STANDBY;
const COLOR_REVIEW  = PHASE_REVIEW;

/**
 * Four-state phase -> visual indicator.
 *
 * not_started         -> no indicator (offline)
 * idle_no_instruction -> slate/grey, slow breathing (standby, waiting for user)
 * running             -> brand-color, fast pulse (AI generating)
 * awaiting_review     -> green, slow breathing (response done, review needed)
 *
 * @param {Object} status - Session status from store
 * @param {Object} customProviders - Custom providers map from store
 */
export function getPhaseIndicator(status, customProviders = {}) {
  if (!status?.tool || status.phase === 'not_started') return null;

  const visual = getVisualForTool(status.tool, customProviders);

  if (status.phase === 'running') {
    return {
      color: visual.color,
      animation: 'pulse 1.2s ease-in-out infinite',
      title: `${visual.label} 运行中`,
    };
  }
  if (status.phase === 'awaiting_review') {
    return {
      color: COLOR_REVIEW,
      animation: 'breathe 2.5s ease-in-out infinite',
      title: `${visual.label} 运行后待审查`,
    };
  }
  if (status.phase === 'idle_no_instruction') {
    return {
      color: COLOR_STANDBY,
      animation: 'breathe 3s ease-in-out infinite',
      title: `${visual.label} 未指令`,
    };
  }
  return null;
}
