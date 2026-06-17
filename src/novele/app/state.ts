import van from "vanjs-core";
import type {
	InterfaceDensity,
	LineSpacingPreset,
	Oklch,
	OverlayName,
	PanelPosition,
	ReadingWidthPreset,
	SettingsTab,
	SiteCommentConfig,
	TextSizePreset,
	ThemeMode,
	Typeface,
} from "./types";

export const siteCommentConfigs: SiteCommentConfig[] = [
	{ id: "site_basic", name: "Basic Site", fields: [] },
	{
		id: "site_anon",
		name: "Anon Site",
		fields: [
			{
				name: "nickname",
				placeholder: "Nickname (optional)",
				type: "text",
			},
		],
	},
	{
		id: "site_full",
		name: "Full Site",
		fields: [
			{ name: "nickname", placeholder: "Nickname", type: "text" },
			{ name: "email", placeholder: "Email (hidden)", type: "email" },
		],
	},
];

export function createUiState() {
	const controlsVisible = van.state(true);
	const activeOverlay = van.state<OverlayName | null>(null);
	const settingsTab = van.state<SettingsTab>("typography");
	const typeface = van.state<Typeface>("fontReader");
	const customTypeface = van.state("Arial");
	const advancedTextSize = van.state(true);
	const textSizeValue = van.state(19);
	const textSizePreset = van.state<TextSizePreset>("regular");
	const advancedLineSpacing = van.state(true);
	const lineSpacingValue = van.state(1.6);
	const lineSpacingPreset = van.state<LineSpacingPreset>("regular");
	const advancedReadingWidth = van.state(true);
	const readingWidthValue = van.state(42);
	const readingWidthPreset = van.state<ReadingWidthPreset>("regular");
	const themeMode = van.state<ThemeMode>("dark");
	const lightPrimarySeed = van.state<Oklch>({ l: 0.55, c: 0.25, h: 230 });
	const lightSurfaceSeed = van.state<Oklch>({ l: 0.95, c: 0.02, h: 230 });
	const darkPrimarySeed = van.state<Oklch>({ l: 0.65, c: 0.286, h: 203 });
	const darkSurfaceSeed = van.state<Oklch>({ l: 0.65, c: 0.337, h: 66 });
	const advancedInterfaceDensity = van.state(false);
	const interfaceDensity = van.state<InterfaceDensity>("comfortable");
	const interfaceScale = van.state(1);
	const panelPosition = van.state<PanelPosition>("right");
	const systemPrefersDark = van.state<boolean>(
		window.matchMedia("(prefers-color-scheme: dark)").matches,
	);
	const activeSiteConfigId = van.state(siteCommentConfigs[2].id);
	const commentDraft = van.state("");

	const effectiveTheme = van.derive<Exclude<ThemeMode, "auto">>(() =>
		themeMode.val === "auto"
			? systemPrefersDark.val
				? "dark"
				: "light"
			: themeMode.val,
	);

	return {
		controlsVisible,
		activeOverlay,
		settingsTab,
		typeface,
		customTypeface,
		advancedTextSize,
		textSizeValue,
		textSizePreset,
		advancedLineSpacing,
		lineSpacingValue,
		lineSpacingPreset,
		advancedReadingWidth,
		readingWidthValue,
		readingWidthPreset,
		themeMode,
		lightPrimarySeed,
		lightSurfaceSeed,
		darkPrimarySeed,
		darkSurfaceSeed,
		advancedInterfaceDensity,
		interfaceDensity,
		interfaceScale,
		panelPosition,
		systemPrefersDark,
		effectiveTheme,
		activeSiteConfigId,
		commentDraft,
	};
}

export type UiState = ReturnType<typeof createUiState>;
