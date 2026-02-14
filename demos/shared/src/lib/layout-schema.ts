export type LayoutMode = 'sideBySide' | 'stackedVertical';

export const LAYOUT_SCHEMA_VERSION = 1 as const;

export type LayoutSchemaVersion = typeof LAYOUT_SCHEMA_VERSION;

export type LayoutPanelDef<PanelId extends string> = {
  id: PanelId;
  parentId?: PanelId;
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
};

export type LayoutVariant<PanelId extends string> = {
  id: LayoutMode | string;
  containerClassName: string;
  placements: readonly LayoutPlacement<PanelId>[];
  tokens?: Readonly<Record<string, string | number>>;
};

export type LayoutSchema<PanelId extends string> = {
  schemaVersion: LayoutSchemaVersion;
  defaultVariantId: string;
  panels: readonly LayoutPanelDef<PanelId>[];
  variants: readonly LayoutVariant<PanelId>[];
};

export type LayoutValidationIssue = {
  path: string;
  message: string;
};

export type LayoutValidationResult = {
  valid: boolean;
  issues: LayoutValidationIssue[];
};
