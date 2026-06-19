import van from "vanjs-core";
import { defaultUiPreferences, type UiPreferences } from "../core/preferences";
import {
	getInterfaceDensityPresetScale,
	getNearestInterfaceDensity,
} from "./theme/density";
import type {
	DrawerHeaderPosition,
	InterfaceDensity,
	LineSpacingPreset,
	Oklch,
	OverlayName,
	PanelPosition,
	ReadingWidthPreset,
	SettingsTab,
	TextSizePreset,
	ThemeMode,
	Typeface,
} from "./types";
import { isBuiltInTypeface } from "./types";

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
	const interfaceScale = van.state(
		initial.advancedInterfaceDensity
			? initial.interfaceScale
			: getInterfaceDensityPresetScale(initial.interfaceDensity),
	);
	const panelPosition = van.state<PanelPosition>(initial.panelPosition);
	const drawerHeaderPosition = van.state<DrawerHeaderPosition>(
		initial.drawerHeaderPosition,
	);
	const systemPrefersDark = van.state<boolean>(
		window.matchMedia("(prefers-color-scheme: dark)").matches,
	);
	const commentAuthor = van.state(initial.commentAuthor);
	const commentDraft = van.state("");

	const effectiveTheme = van.derive<Exclude<ThemeMode, "auto">>(() =>
		themeMode.val === "auto"
			? systemPrefersDark.val
				? "dark"
				: "light"
			: themeMode.val,
	);

	van.derive(() => {
		if (advancedInterfaceDensity.val) {
			const nearestDensity = getNearestInterfaceDensity(interfaceScale.val);
			if (interfaceDensity.val !== nearestDensity) {
				interfaceDensity.val = nearestDensity;
			}
			return;
		}
		const presetScale = getInterfaceDensityPresetScale(interfaceDensity.val);
		if (interfaceScale.val !== presetScale) {
			interfaceScale.val = presetScale;
		}
	});

	van.derive(() => {
		if (
			!isBuiltInTypeface(typeface.val) &&
			customTypeface.val !== typeface.val
		) {
			customTypeface.val = typeface.val;
		}
	});

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
		drawerHeaderPosition,
		systemPrefersDark,
		effectiveTheme,
		commentAuthor,
		commentDraft,
	};
}

export type UiState = ReturnType<typeof createUiState>;
