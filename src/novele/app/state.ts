import van from "vanjs-core";
import { defaultUiPreferences, type UiPreferences } from "./config";
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

export function createUiState(initial: UiPreferences = defaultUiPreferences) {
	const controlsVisible = van.state(true);
	const activeOverlay = van.state<OverlayName | null>(null);
	const settingsTab = van.state<SettingsTab>("typography");
	const typeface = van.state<Typeface>(initial.typeface);
	const customTypeface = van.state(initial.customTypeface);
	const advancedTextSize = van.state(initial.advancedTextSize);
	const textSizeValue = van.state(initial.textSizeValue);
	const textSizePreset = van.state<TextSizePreset>(initial.textSizePreset);
	const advancedLineSpacing = van.state(initial.advancedLineSpacing);
	const lineSpacingValue = van.state(initial.lineSpacingValue);
	const lineSpacingPreset = van.state<LineSpacingPreset>(
		initial.lineSpacingPreset,
	);
	const advancedReadingWidth = van.state(initial.advancedReadingWidth);
	const readingWidthValue = van.state(initial.readingWidthValue);
	const readingWidthPreset = van.state<ReadingWidthPreset>(
		initial.readingWidthPreset,
	);
	const themeMode = van.state<ThemeMode>(initial.themeMode);
	const lightPrimarySeed = van.state<Oklch>(initial.lightPrimarySeed);
	const lightSurfaceSeed = van.state<Oklch>(initial.lightSurfaceSeed);
	const darkPrimarySeed = van.state<Oklch>(initial.darkPrimarySeed);
	const darkSurfaceSeed = van.state<Oklch>(initial.darkSurfaceSeed);
	const advancedInterfaceDensity = van.state(initial.advancedInterfaceDensity);
	const interfaceDensity = van.state<InterfaceDensity>(
		initial.interfaceDensity,
	);
	const interfaceScale = van.state(initial.interfaceScale);
	const panelPosition = van.state<PanelPosition>(initial.panelPosition);
	const systemPrefersDark = van.state<boolean>(
		window.matchMedia("(prefers-color-scheme: dark)").matches,
	);
	const activeSiteConfigId = van.state(siteCommentConfigs[2].id);
	const commentAuthor = van.state(initial.commentAuthor);
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
		commentAuthor,
		commentDraft,
	};
}

export type UiState = ReturnType<typeof createUiState>;
