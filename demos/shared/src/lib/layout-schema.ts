export type LayoutMode = 'sideBySide' | 'stackedVertical';

export const LAYOUT_SCHEMA_VERSION = 2 as const;

export type LayoutSchemaVersion = typeof LAYOUT_SCHEMA_VERSION;

export type LayoutPanelDef<PanelId extends string> = {
  id: PanelId;
  parentId?: PanelId;
};

export type LayoutChildrenLayout = {
  mode: 'grid' | 'flex';
  columns?: string;
  rows?: string;
  direction?: 'row' | 'column';
  gap?: string;
  alignItems?: string;
  justifyItems?: string;
  justifyContent?: string;
};

export type LayoutResponsiveFallbackRule<PanelId extends string> = {
  fallbackVariantId: string;
  maxContainerWidthPx?: number;
  panelId?: PanelId;
  maxPanelWidthPx?: number;
  hysteresisPx?: number;
};

export type LayoutPlacement<PanelId extends string> = {
  panelId: PanelId;
  order?: number;
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
  padding?: string;
  childrenLayout?: LayoutChildrenLayout;
};

export type LayoutVariant<PanelId extends string> = {
  id: LayoutMode | string;
  containerClassName: string;
  placements: readonly LayoutPlacement<PanelId>[];
  tokens?: Readonly<Record<string, string | number>>;
  responsiveFallbacks?: readonly LayoutResponsiveFallbackRule<PanelId>[];
};

export type LayoutSchema<PanelId extends string> = {
  schemaVersion: LayoutSchemaVersion;
  defaultVariantId: string;
  panels: readonly LayoutPanelDef<PanelId>[];
  variants: readonly LayoutVariant<PanelId>[];
};

/**
 * Purpose: LayoutValidationIssue object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type LayoutValidationIssue = {
  path: string;
  message: string;
};

/**
 * Purpose: LayoutValidationResult object contract.
 * Key fields: Properties declared inside this type definition.
 */
export type LayoutValidationResult = {
  valid: boolean;
  issues: LayoutValidationIssue[];
};
