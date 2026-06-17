export type OverlayName = "chapters" | "comments" | "settings";

export type SettingsTab = "typography" | "interface";

export type TypographyMode = "preset" | "slider";

export type Typeface = "fontReader" | "fontUi" | "fontLiterata";

export type TextSizePreset = "compact" | "regular" | "relaxed";

export type LineSpacingPreset = "compact" | "regular" | "relaxed";

export type ReadingWidthPreset = "narrow" | "regular" | "wide";

export type ThemeMode = "auto" | "light" | "dark";

export type ThemeColor = "cyan" | "emerald" | "amber" | "rose";

export type InterfaceDensity = "compact" | "comfortable" | "spacious";

export type PanelPosition = "left" | "right";

export type Option<T extends string> = {
	label: string;
	value: T;
};
