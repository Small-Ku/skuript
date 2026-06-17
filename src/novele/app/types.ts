export type OverlayName = "chapters" | "comments" | "settings";

export type SettingsTab = "typography" | "interface";

export type Typeface = "fontReader" | "fontUi" | "fontLiterata" | "custom";

export type TextSizePreset = "compact" | "regular" | "relaxed";

export type LineSpacingPreset = "compact" | "regular" | "relaxed";

export type ReadingWidthPreset = "narrow" | "regular" | "wide";

export type ThemeMode = "auto" | "light" | "dark";

export type InterfaceDensity = "compact" | "comfortable" | "spacious";

export type PanelPosition = "left" | "right";

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
	enabled: boolean;
};

export type SiteCommentConfigField = {
	name: string;
	placeholder: string;
	type: "text" | "email";
};

export type SiteCommentConfig = {
	id: string;
	name: string;
	fields: SiteCommentConfigField[];
};

export type Option<T extends string> = {
	label: string;
	value: T;
};
