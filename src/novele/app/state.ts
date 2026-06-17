import van from "vanjs-core";
import type {
	InterfaceDensity,
	LineSpacingPreset,
	OverlayName,
	PanelPosition,
	ReadingWidthPreset,
	SettingsTab,
	TextSizePreset,
	ThemeColor,
	ThemeMode,
	Typeface,
	TypographyMode,
} from "./types";

export function createUiState() {
	const controlsVisible = van.state(true);
	const activeOverlay = van.state<OverlayName | null>(null);
	const settingsTab = van.state<SettingsTab>("typography");
	const typographyMode = van.state<TypographyMode>("slider");
	const typeface = van.state<Typeface>("fontReader");
	const textSizeValue = van.state(19);
	const textSizePreset = van.state<TextSizePreset>("regular");
	const lineSpacingValue = van.state(1.6);
	const lineSpacingPreset = van.state<LineSpacingPreset>("regular");
	const readingWidthValue = van.state(42);
	const readingWidthPreset = van.state<ReadingWidthPreset>("regular");
	const themeMode = van.state<ThemeMode>("dark");
	const themeColor = van.state<ThemeColor>("cyan");
	const interfaceDensity = van.state<InterfaceDensity>("comfortable");
	const panelPosition = van.state<PanelPosition>("right");
	const systemPrefersDark = van.state<boolean>(
		window.matchMedia("(prefers-color-scheme: dark)").matches,
	);
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
		typographyMode,
		typeface,
		textSizeValue,
		textSizePreset,
		lineSpacingValue,
		lineSpacingPreset,
		readingWidthValue,
		readingWidthPreset,
		themeMode,
		themeColor,
		interfaceDensity,
		panelPosition,
		systemPrefersDark,
		effectiveTheme,
		commentDraft,
	};
}

export type UiState = ReturnType<typeof createUiState>;
