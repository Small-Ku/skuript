import van from "vanjs-core";
import { TypeableDropdown } from "./components/typeable-dropdown";
import {
	drawerClass,
	drawerHeader,
	segmentedButtonGroup,
	settingGroup,
	sliderField,
	type UiState,
} from "./overlay-shared";
import nameMap from "./styles/style.module.scss";
import { getMaxChroma, oklchToRgb, rgbToHex } from "./theme/color-math";
import type {
	DrawerHeaderPosition,
	InterfaceDensity,
	LineSpacingPreset,
	Oklch,
	PanelPosition,
	ReadingWidthPreset,
	TextSizePreset,
	ThemeMode,
	Typeface,
} from "./types";
import {
	BUILT_IN_TYPEFACE_VALUES,
	COMPACT_REGULAR_RELAXED_VALUES,
	DRAWER_HEADER_POSITION_VALUES,
	INTERFACE_DENSITY_VALUES,
	OverlayName,
	PANEL_POSITION_VALUES,
	READING_WIDTH_PRESET_VALUES,
	SettingsTab,
	THEME_MODE_VALUES,
} from "./types";

const { aside, button, div, span } = van.tags;

const [typefaceReader, typefaceUi, typefaceLiterata] = BUILT_IN_TYPEFACE_VALUES;
const [compactPreset, regularPreset, relaxedPreset] =
	COMPACT_REGULAR_RELAXED_VALUES;
const [narrowWidth, regularWidth, wideWidth] = READING_WIDTH_PRESET_VALUES;
const [autoMode, lightMode, darkMode] = THEME_MODE_VALUES;
const [compactDensity, comfortableDensity, spaciousDensity] =
	INTERFACE_DENSITY_VALUES;
const [leftPanel, rightPanel] = PANEL_POSITION_VALUES;
const [headerTop, headerBottom] = DRAWER_HEADER_POSITION_VALUES;

const typefaceOptions = [
	{
		label: "Newsreader",
		value: typefaceReader as Typeface,
		optionClass: nameMap.fontReader,
	},
	{
		label: "Satoshi",
		value: typefaceUi as Typeface,
		optionClass: nameMap.fontUi,
	},
	{
		label: "Literata",
		value: typefaceLiterata as Typeface,
		optionClass: nameMap.fontLiterata,
	},
];

const textSizeOptions = [
	{ label: "Compact", value: compactPreset as TextSizePreset },
	{ label: "Regular", value: regularPreset as TextSizePreset },
	{ label: "Relaxed", value: relaxedPreset as TextSizePreset },
];

const lineSpacingOptions = [
	{ label: "Compact", value: compactPreset as LineSpacingPreset },
	{ label: "Regular", value: regularPreset as LineSpacingPreset },
	{ label: "Relaxed", value: relaxedPreset as LineSpacingPreset },
];

const readingWidthOptions = [
	{ label: "Narrow", value: narrowWidth as ReadingWidthPreset },
	{ label: "Regular", value: regularWidth as ReadingWidthPreset },
	{ label: "Wide", value: wideWidth as ReadingWidthPreset },
];

const densityOptions = [
	{ label: "Compact", value: compactDensity as InterfaceDensity },
	{ label: "Comfortable", value: comfortableDensity as InterfaceDensity },
	{ label: "Spacious", value: spaciousDensity as InterfaceDensity },
];

const panelOptions = [
	{ label: "Left", value: leftPanel as PanelPosition },
	{ label: "Right", value: rightPanel as PanelPosition },
];

const drawerHeaderOptions = [
	{ label: "Top", value: headerTop as DrawerHeaderPosition },
	{ label: "Bottom", value: headerBottom as DrawerHeaderPosition },
];

const themeModeOptions = [
	{ label: "Light", value: lightMode as ThemeMode },
	{ label: "Auto", value: autoMode as ThemeMode },
	{ label: "Dark", value: darkMode as ThemeMode },
];

function colorFor(seed: Oklch) {
	const rgb = oklchToRgb(seed);
	return rgbToHex({
		r: Math.max(0, Math.min(1, rgb.r)),
		g: Math.max(0, Math.min(1, rgb.g)),
		b: Math.max(0, Math.min(1, rgb.b)),
	});
}

function oklchPicker(seed: van.State<Oklch>, labelText: string) {
	const minChroma = 0;
	const fixedLightness = 0.64;
	const chromaForHue = (hue: number) => getMaxChroma(fixedLightness, hue);

	const updateFromPointer = (event: PointerEvent, element: HTMLDivElement) => {
		const rect = element.getBoundingClientRect();
		const x = Math.max(
			0,
			Math.min(1, (event.clientX - rect.left) / rect.width),
		);
		const y = Math.max(
			0,
			Math.min(1, (event.clientY - rect.top) / rect.height),
		);
		const hue = x * 360;
		const maxChroma = chromaForHue(hue);
		seed.val = {
			...seed.val,
			h: hue,
			c: minChroma + (1 - y) * (maxChroma - minChroma),
		};
	};

	return div(
		{ class: nameMap.pickerContainer },
		div(
			{ class: nameMap.pickerHeader },
			span(labelText),
			span(() => `H: ${Math.round(seed.val.h)}° C: ${seed.val.c.toFixed(3)}`),
		),
		div(
			{
				class: nameMap.pickerSurface,
				style: () =>
					`background:linear-gradient(to right, ${[
						0, 60, 120, 180, 240, 300, 360,
					]
						.map((hue) =>
							colorFor({ l: fixedLightness, c: chromaForHue(hue), h: hue }),
						)
						.join(",")});`,
				onpointerdown: (event: PointerEvent) => {
					const target = event.currentTarget as HTMLDivElement;
					updateFromPointer(event, target);
					target.setPointerCapture(event.pointerId);
				},
				onpointermove: (event: PointerEvent) => {
					const target = event.currentTarget as HTMLDivElement;
					if (target.hasPointerCapture(event.pointerId)) {
						updateFromPointer(event, target);
					}
				},
				onpointerup: (event: PointerEvent) => {
					const target = event.currentTarget as HTMLDivElement;
					if (target.hasPointerCapture(event.pointerId)) {
						target.releasePointerCapture(event.pointerId);
					}
				},
			},
			div({ class: nameMap.pickerOverlay }),
			div({
				class: nameMap.pickerThumb,
				style: () => {
					const maxChroma = chromaForHue(seed.val.h);
					const chromaRatio =
						maxChroma <= minChroma
							? 0
							: (seed.val.c - minChroma) / (maxChroma - minChroma);
					return [
						`left:${(seed.val.h / 360) * 100}%`,
						`top:${(1 - Math.max(0, Math.min(1, chromaRatio))) * 100}%`,
						`background-color:${colorFor({ l: fixedLightness, c: seed.val.c, h: seed.val.h })}`,
					].join(";");
				},
			}),
		),
	);
}

function typographyTab(ui: UiState) {
	return div(
		{ class: nameMap.tabContent },
		settingGroup(
			"Typeface",
			TypeableDropdown(
				ui.typeface,
				typefaceOptions,
				"Select or type font name...",
			),
		),
		sliderField(
			"Text Size",
			ui.advancedTextSize,
			() => `${ui.textSizeValue.val}px`,
			{
				min: 14,
				max: 28,
				value: () => ui.textSizeValue.val,
				oninput: (event: Event) => {
					ui.textSizeValue.val = parseInt(
						(event.target as HTMLInputElement).value,
						10,
					);
				},
			},
			segmentedButtonGroup(ui.textSizePreset, textSizeOptions),
		),
		sliderField(
			"Line Spacing",
			ui.advancedLineSpacing,
			() => `${ui.lineSpacingValue.val.toFixed(2)}x`,
			{
				min: 1.1,
				max: 2.5,
				step: 0.05,
				value: () => ui.lineSpacingValue.val,
				oninput: (event: Event) => {
					ui.lineSpacingValue.val = parseFloat(
						(event.target as HTMLInputElement).value,
					);
				},
			},
			segmentedButtonGroup(ui.lineSpacingPreset, lineSpacingOptions),
		),
		sliderField(
			"Page Width",
			ui.advancedReadingWidth,
			() => `${ui.readingWidthValue.val}em`,
			{
				min: 30,
				max: 60,
				value: () => ui.readingWidthValue.val,
				oninput: (event: Event) => {
					ui.readingWidthValue.val = parseInt(
						(event.target as HTMLInputElement).value,
						10,
					);
				},
			},
			segmentedButtonGroup(ui.readingWidthPreset, readingWidthOptions),
		),
	);
}

function interfaceTab(ui: UiState) {
	return div(
		{ class: nameMap.tabContent },
		sliderField(
			"Interface Density",
			ui.advancedInterfaceDensity,
			() => `${ui.interfaceScale.val.toFixed(2)}x`,
			{
				min: 0.75,
				max: 1.3,
				step: 0.05,
				value: () => ui.interfaceScale.val,
				oninput: (event: Event) => {
					ui.interfaceScale.val = parseFloat(
						(event.target as HTMLInputElement).value,
					);
				},
			},
			segmentedButtonGroup(ui.interfaceDensity, densityOptions),
		),
		settingGroup(
			"UI Direction",
			segmentedButtonGroup(ui.panelPosition, panelOptions),
		),
		settingGroup(
			"Drawer Header Position",
			segmentedButtonGroup(ui.drawerHeaderPosition, drawerHeaderOptions),
		),
		settingGroup(
			"Theme Mode",
			segmentedButtonGroup(ui.themeMode, themeModeOptions),
		),
		div(
			{ class: nameMap.settingsGroup },
			span({ class: nameMap.label }, "Color Pipeline"),
			div({ class: nameMap.colorSectionTitle }, "Light Mode Seeds"),
			oklchPicker(ui.lightPrimarySeed, "Primary Color Seed"),
			oklchPicker(ui.lightSurfaceSeed, "Surface Tint Seed"),
			div({ class: nameMap.colorSectionTitle }, "Dark Mode Seeds"),
			oklchPicker(ui.darkPrimarySeed, "Primary Color Seed"),
			oklchPicker(ui.darkSurfaceSeed, "Surface Tint Seed"),
		),
	);
}

function tabButton(ui: UiState, label: string, value: SettingsTab) {
	return button(
		{
			class: () => (ui.settingsTab.val === value ? nameMap.active : ""),
			onclick: () => {
				ui.settingsTab.val = value;
			},
		},
		label,
	);
}

export function SettingsPanel(ui: UiState, close: () => void) {
	return aside(
		{
			class: drawerClass(ui, OverlayName.Settings),
			onclick: (event) => event.stopPropagation(),
		},
		drawerHeader("Preferences", close),
		div(
			{ class: nameMap.settingsContentWrapper },
			div(
				{ class: nameMap.tabSwitcher },
				tabButton(ui, "Typography", SettingsTab.Typography),
				tabButton(ui, "Interface", SettingsTab.Interface),
			),
			div({ class: nameMap.settingsBody }, () =>
				ui.settingsTab.val === SettingsTab.Typography
					? typographyTab(ui)
					: interfaceTab(ui),
			),
		),
	);
}
