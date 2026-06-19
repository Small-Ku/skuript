export type OverlayName = "chapters" | "comments" | "settings";

export type SettingsTab = "typography" | "interface";

export const BUILT_IN_TYPEFACE_VALUES = [
	"fontReader",
	"fontUi",
	"fontLiterata",
] as const;
export type BuiltInTypeface = (typeof BUILT_IN_TYPEFACE_VALUES)[number];
export type Typeface = BuiltInTypeface | string;

export function isBuiltInTypeface(
	typeface: string,
): typeface is BuiltInTypeface {
	return (BUILT_IN_TYPEFACE_VALUES as readonly string[]).includes(typeface);
}

/** @dense-enum-values c r x */
export const COMPACT_REGULAR_RELAXED_VALUES = [
	"compact",
	"regular",
	"relaxed",
] as const;
export type TextSizePreset = (typeof COMPACT_REGULAR_RELAXED_VALUES)[number];

export type LineSpacingPreset = (typeof COMPACT_REGULAR_RELAXED_VALUES)[number];

/** @dense-enum-values n r w */
export const READING_WIDTH_PRESET_VALUES = [
	"narrow",
	"regular",
	"wide",
] as const;
export type ReadingWidthPreset = (typeof READING_WIDTH_PRESET_VALUES)[number];

export const THEME_MODE_VALUES = ["auto", "light", "dark"] as const;
export type ThemeMode = "auto" | "light" | "dark";

/** @dense-enum-values d m s */
export const INTERFACE_DENSITY_VALUES = [
	"compact",
	"comfortable",
	"spacious",
] as const;
export type InterfaceDensity = (typeof INTERFACE_DENSITY_VALUES)[number];

export const PANEL_POSITION_VALUES = ["left", "right"] as const;
export type PanelPosition = "left" | "right";

export const DRAWER_HEADER_POSITION_VALUES = ["top", "bottom"] as const;
export type DrawerHeaderPosition =
	(typeof DRAWER_HEADER_POSITION_VALUES)[number];

export type RGB = {
	r: number;
	g: number;
	b: number;
};

export type Oklch = {
	l: number;
	c: number;
	h: number;
};

export type HueFilter = {
	id: string;
	start: number;
	end: number;
	lThreshold: number;
	maxShiftAngle: number;
	maxChromaShift: number;
	filterEnabled: boolean;
};

export type Option<T extends string> = {
	label: string;
	value: T;
};
