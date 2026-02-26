import {
  LAYOUT_SCHEMA_VERSION,
  type LayoutSchema,
  type LayoutValidationIssue,
  type LayoutValidationResult,
} from './layout-schema';

/**
 * Validate a layout schema before runtime layout resolution.
 *
 * @param schema - Candidate layout schema.
 * @returns Validation result with structured issues.
 */
export function validateLayoutSchema<PanelId extends string>(
  schema: LayoutSchema<PanelId>
): LayoutValidationResult {
  const issues: LayoutValidationIssue[] = [];

  if (schema.schemaVersion !== LAYOUT_SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      message: `Unsupported schema version: ${String(schema.schemaVersion)}`,
    });
  }

  if (!schema.panels.length) {
    issues.push({
      path: 'panels',
      message: 'At least one panel definition is required.',
    });
  }

  const panelIds = new Set<PanelId>();
  const panelIndexById = new Map<PanelId, number>();
  const panelParentById = new Map<PanelId, PanelId | null>();
  schema.panels.forEach((panel, index) => {
    const panelPath = `panels[${index}]`;
    if (!panel.id) {
      issues.push({
        path: `${panelPath}.id`,
        message: 'Panel id is required.',
      });
      return;
    }

    if (panelIds.has(panel.id)) {
      issues.push({
        path: `${panelPath}.id`,
        message: `Duplicate panel id "${panel.id}" found.`,
      });
    } else {
      panelIds.add(panel.id);
      panelIndexById.set(panel.id, index);
      panelParentById.set(panel.id, null);
    }

  });

  schema.panels.forEach((panel, index) => {
    if (!panel.parentId) return;
    const panelPath = `panels[${index}].parentId`;
    if (panel.parentId === panel.id) {
      issues.push({
        path: panelPath,
        message: 'A panel cannot reference itself as parent.',
      });
      return;
    }
    if (!panelIds.has(panel.parentId)) {
      issues.push({
        path: panelPath,
        message: `Unknown parent panel id "${panel.parentId}".`,
      });
      return;
    }
    panelParentById.set(panel.id, panel.parentId);
  });

  const cycleIssuePaths = new Set<string>();
  const visitState = new Map<PanelId, 'visiting' | 'visited'>();

  const visitPanel = (panelId: PanelId, trail: PanelId[]) => {
    const state = visitState.get(panelId);
    if (state === 'visited') return;
    if (state === 'visiting') {
      const cycleStartIndex = trail.indexOf(panelId);
      const cyclePanelIds =
        cycleStartIndex >= 0 ? trail.slice(cycleStartIndex) : [panelId];

      cyclePanelIds.forEach((cyclePanelId) => {
        const panelIndex = panelIndexById.get(cyclePanelId);
        if (panelIndex === undefined) return;
        const issuePath = `panels[${panelIndex}].parentId`;
        if (cycleIssuePaths.has(issuePath)) return;
        cycleIssuePaths.add(issuePath);
        issues.push({
          path: issuePath,
          message: 'Panel hierarchy cannot contain a parentId cycle.',
        });
      });
      return;
    }

    visitState.set(panelId, 'visiting');
    const parentId = panelParentById.get(panelId);
    if (parentId) {
      visitPanel(parentId, [...trail, panelId]);
    }
    visitState.set(panelId, 'visited');
  };

  panelIds.forEach((panelId) => {
    visitPanel(panelId, []);
  });

  if (!schema.variants.length) {
    issues.push({
      path: 'variants',
      message: 'At least one layout variant is required.',
    });
  }

  const variantIds = new Set<string>();
  schema.variants.forEach((variant, index) => {
    const variantPath = `variants[${index}]`;
    if (!variant.id) {
      issues.push({
        path: `${variantPath}.id`,
        message: 'Variant id is required.',
      });
      return;
    }

    const variantId = String(variant.id);
    if (variantIds.has(variantId)) {
      issues.push({
        path: `${variantPath}.id`,
        message: `Duplicate variant id "${variantId}" found.`,
      });
    } else {
      variantIds.add(variantId);
    }

    if (!variant.containerClassName.trim()) {
      issues.push({
        path: `${variantPath}.containerClassName`,
        message: 'containerClassName cannot be empty.',
      });
    }

    if (!variant.placements.length) {
      issues.push({
        path: `${variantPath}.placements`,
        message: 'Variant must define at least one placement.',
      });
      return;
    }

    const seenPlacements = new Set<PanelId>();
    variant.placements.forEach((placement, placementIndex) => {
      const placementPath = `${variantPath}.placements[${placementIndex}]`;

      if (!panelIds.has(placement.panelId)) {
        issues.push({
          path: `${placementPath}.panelId`,
          message: `Unknown panel id "${String(placement.panelId)}".`,
        });
      }

      if (seenPlacements.has(placement.panelId)) {
        issues.push({
          path: `${placementPath}.panelId`,
          message: `Duplicate placement for panel "${String(placement.panelId)}".`,
        });
      } else {
        seenPlacements.add(placement.panelId);
      }

      if (placement.childrenLayout) {
        if (placement.childrenLayout.mode !== 'grid' && placement.childrenLayout.mode !== 'flex') {
          issues.push({
            path: `${placementPath}.childrenLayout.mode`,
            message: 'childrenLayout.mode must be "grid" or "flex".',
          });
        }
        if (
          placement.childrenLayout.mode === 'grid' &&
          !placement.childrenLayout.columns &&
          !placement.childrenLayout.rows
        ) {
          issues.push({
            path: `${placementPath}.childrenLayout`,
            message: 'Grid childrenLayout should define columns or rows.',
          });
        }
      }
    });

    panelIds.forEach((panelId) => {
      if (seenPlacements.has(panelId)) return;
      issues.push({
        path: `${variantPath}.placements`,
        message: `Missing placement for panel "${String(panelId)}".`,
      });
    });

    (variant.responsiveFallbacks ?? []).forEach((rule, ruleIndex) => {
      const rulePath = `${variantPath}.responsiveFallbacks[${ruleIndex}]`;
      if (!rule.fallbackVariantId.trim()) {
        issues.push({
          path: `${rulePath}.fallbackVariantId`,
          message: 'fallbackVariantId cannot be empty.',
        });
      }
      const hasContainerThreshold = typeof rule.maxContainerWidthPx === 'number';
      const hasPanelThreshold = typeof rule.maxPanelWidthPx === 'number';
      if (!hasContainerThreshold && !hasPanelThreshold) {
        issues.push({
          path: rulePath,
          message: 'Fallback rule must specify maxContainerWidthPx or maxPanelWidthPx.',
        });
      }
      if (rule.panelId && !panelIds.has(rule.panelId)) {
        issues.push({
          path: `${rulePath}.panelId`,
          message: `Unknown panel id "${String(rule.panelId)}".`,
        });
      }
      if (rule.panelId && !hasPanelThreshold) {
        issues.push({
          path: `${rulePath}.maxPanelWidthPx`,
          message: 'maxPanelWidthPx is required when panelId is set.',
        });
      }
      if (typeof rule.hysteresisPx === 'number' && rule.hysteresisPx < 0) {
        issues.push({
          path: `${rulePath}.hysteresisPx`,
          message: 'hysteresisPx must be non-negative.',
        });
      }
    });
  });

  schema.variants.forEach((variant, index) => {
    const variantPath = `variants[${index}]`;
    (variant.responsiveFallbacks ?? []).forEach((rule, ruleIndex) => {
      if (variantIds.has(rule.fallbackVariantId)) {
        return;
      }
      issues.push({
        path: `${variantPath}.responsiveFallbacks[${ruleIndex}].fallbackVariantId`,
        message: `Unknown fallback variant "${rule.fallbackVariantId}".`,
      });
    });
  });

  if (!schema.defaultVariantId.trim()) {
    issues.push({
      path: 'defaultVariantId',
      message: 'defaultVariantId cannot be empty.',
    });
  } else if (!variantIds.has(schema.defaultVariantId)) {
    issues.push({
      path: 'defaultVariantId',
      message: `defaultVariantId "${schema.defaultVariantId}" is not defined in variants.`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
