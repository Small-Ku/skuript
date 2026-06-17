import van from "vanjs-core";
import nameMap from "./style.module.scss";
import { IconClose } from "../../style/icon";
import type { createReaderData } from "./reader-data";
import type { createUiState } from "./state";
import type {
	InterfaceDensity,
	LineSpacingPreset,
	PanelPosition,
	ReadingWidthPreset,
	SettingsTab,
	TextSizePreset,
	ThemeColor,
	ThemeMode,
	Typeface,
} from "./types";

const { aside, button, div, h2, input, nav, p, span } = van.tags;

type UiState = ReturnType<typeof createUiState>;
type ReaderData = ReturnType<typeof createReaderData>;

const typefaceOptions = [
	{ label: "Newsreader", value: "fontReader" as Typeface, className: nameMap.fontReader },
	{ label: "Satoshi", value: "fontUi" as Typeface, className: nameMap.fontUi },
	{ label: "Literata", value: "fontLiterata" as Typeface, className: nameMap.fontLiterata },
];

const textSizeOptions = [
	{ label: "Compact", value: "compact" as TextSizePreset },
	{ label: "Regular", value: "regular" as TextSizePreset },
	{ label: "Relaxed", value: "relaxed" as TextSizePreset },
];

const lineSpacingOptions = [
	{ label: "Compact", value: "compact" as LineSpacingPreset },
	{ label: "Regular", value: "regular" as LineSpacingPreset },
	{ label: "Relaxed", value: "relaxed" as LineSpacingPreset },
];

const readingWidthOptions = [
	{ label: "Narrow", value: "narrow" as ReadingWidthPreset },
	{ label: "Regular", value: "regular" as ReadingWidthPreset },
	{ label: "Wide", value: "wide" as ReadingWidthPreset },
];

const densityOptions = [
	{ label: "Compact", value: "compact" as InterfaceDensity },
	{ label: "Comfortable", value: "comfortable" as InterfaceDensity },
	{ label: "Spacious", value: "spacious" as InterfaceDensity },
];

const panelOptions = [
	{ label: "Left", value: "left" as PanelPosition },
	{ label: "Right", value: "right" as PanelPosition },
];

const themeModeOptions = [
	{ label: "Light", value: "light" as ThemeMode },
	{ label: "Auto", value: "auto" as ThemeMode },
	{ label: "Dark", value: "dark" as ThemeMode },
];

const themeColorOptions = [
	{ label: "Cyan", value: "cyan" as ThemeColor },
	{ label: "Emerald", value: "emerald" as ThemeColor },
	{ label: "Amber", value: "amber" as ThemeColor },
	{ label: "Rose", value: "rose" as ThemeColor },
];

function drawerClass(
	ui: UiState,
	name: "chapters" | "comments" | "settings",
	extraClass: string,
) {
	return () => [
		nameMap.bottomSheetPanel,
		ui.panelPosition.val === "left" ? nameMap.panelLeft : nameMap.panelRight,
		ui.activeOverlay.val === name ? nameMap.visible : "",
		extraClass,
	].filter(Boolean).join(" ");
}

function drawerHeader(title: string, close: () => void) {
	return div(
		{ class: nameMap.drawerHeader },
		h2(title),
		button({ onclick: close, title: `Close ${title.toLowerCase()}` }, IconClose()),
	);
}

function segmentedButtonGroup<T extends string>(
	currentValue: van.State<T>,
	options: { label: string; value: T; className?: string }[],
) {
	return div(
		{ class: nameMap.buttonRow },
		...options.map((option) =>
			button(
				{
					class: () => [
						currentValue.val === option.value ? nameMap.active : nameMap.inactive,
						option.className ?? "",
					].filter(Boolean).join(" "),
					onclick: () => {
						currentValue.val = option.value;
					},
				},
				option.label,
			),
		),
	);
}

function settingGroup(labelText: string, ...children: van.ChildDom[]) {
	return div(
		{ class: nameMap.settingsGroup },
		span({ class: nameMap.label }, labelText),
		...children,
	);
}

function sliderField(
	labelText: string,
	valueText: () => string,
	inputProps: Record<string, string | number | (() => string | number)>,
) {
	return div(
		{ class: nameMap.settingsGroup },
		div(
			{ class: nameMap.sliderHeader },
			span({ class: nameMap.label }, labelText),
			span({ class: nameMap.value }, valueText),
		),
		input({ type: "range", ...inputProps }),
	);
}

function typographyTab(ui: UiState) {
	return div(
		{ class: nameMap.tabContent },
		settingGroup("Typeface", segmentedButtonGroup(ui.typeface, typefaceOptions)),
		div(
			{ class: `${nameMap.settingsGroup} ${nameMap.inlineSetting}` },
			span({ class: nameMap.label }, "Advanced Styling"),
			button(
				{
					class: () => [
						nameMap.toggle,
						ui.typographyMode.val === "slider" ? nameMap.enabled : "",
					].filter(Boolean).join(" "),
					onclick: () => {
						ui.typographyMode.val = ui.typographyMode.val === "slider"
							? "preset"
							: "slider";
					},
				},
				div({ class: nameMap.toggleThumb }),
			),
		),
		() => ui.typographyMode.val === "slider"
			? sliderField(
				"Text Size",
				() => `${ui.textSizeValue.val}px`,
				{
					min: 14,
					max: 28,
					value: () => ui.textSizeValue.val,
					oninput: (event: Event) => {
						ui.textSizeValue.val = parseInt((event.target as HTMLInputElement).value, 10);
					},
				},
			)
			: settingGroup("Text Size", segmentedButtonGroup(ui.textSizePreset, textSizeOptions)),
		() => ui.typographyMode.val === "slider"
			? sliderField(
				"Line Spacing",
				() => `${ui.lineSpacingValue.val.toFixed(2)}x`,
				{
					min: 1.1,
					max: 2.5,
					step: 0.05,
					value: () => ui.lineSpacingValue.val,
					oninput: (event: Event) => {
						ui.lineSpacingValue.val = parseFloat((event.target as HTMLInputElement).value);
					},
				},
			)
			: settingGroup("Line Spacing", segmentedButtonGroup(ui.lineSpacingPreset, lineSpacingOptions)),
		() => ui.typographyMode.val === "slider"
			? sliderField(
				"Page Width",
				() => `${ui.readingWidthValue.val}rem`,
				{
					min: 30,
					max: 60,
					value: () => ui.readingWidthValue.val,
					oninput: (event: Event) => {
						ui.readingWidthValue.val = parseInt((event.target as HTMLInputElement).value, 10);
					},
				},
			)
			: settingGroup("Page Width", segmentedButtonGroup(ui.readingWidthPreset, readingWidthOptions)),
	);
}

function interfaceTab(ui: UiState) {
	return div(
		{ class: nameMap.tabContent },
		settingGroup("Interface Density", segmentedButtonGroup(ui.interfaceDensity, densityOptions)),
		settingGroup("Panel Position", segmentedButtonGroup(ui.panelPosition, panelOptions)),
		settingGroup("Theme Mode", segmentedButtonGroup(ui.themeMode, themeModeOptions)),
		settingGroup(
			"Theme Color",
			div(
				{ class: `${nameMap.buttonRow} ${nameMap.colorPicker}` },
				...themeColorOptions.map((option) =>
					button(
						{
							class: () => [
								nameMap.colorButton,
								nameMap[`swatch${option.label}`],
								ui.themeColor.val === option.value ? nameMap.active : "",
							].filter(Boolean).join(" "),
							onclick: () => {
								ui.themeColor.val = option.value;
							},
							title: option.label,
						},
						div({ class: nameMap.colorSwatch }),
					),
				),
			),
		),
	);
}

function settingsPanel(ui: UiState) {
	return div(
		{ class: nameMap.settingsBody },
		div(
			{ class: nameMap.tabSwitcher },
			...([
				{ label: "Typography", value: "typography" },
				{ label: "Interface", value: "interface" },
			] as { label: string; value: SettingsTab }[]).map((option) =>
				button(
					{
						class: () => ui.settingsTab.val === option.value ? nameMap.active : "",
						onclick: () => {
							ui.settingsTab.val = option.value;
						},
					},
					option.label,
				),
			),
		),
		() => ui.settingsTab.val === "typography" ? typographyTab(ui) : interfaceTab(ui),
	);
}

export function OverlayBackdrop(ui: UiState) {
	return div({
		class: () => [
			nameMap.drawerOverlay,
			ui.activeOverlay.val ? nameMap.visible : "",
		].filter(Boolean).join(" "),
		onclick: () => {
			ui.activeOverlay.val = null;
		},
	});
}

export function OverlayPanels(
	ui: UiState,
	data: ReaderData,
	onInteraction: () => void,
) {
	const close = () => {
		ui.activeOverlay.val = null;
	};
	const chapterNavRoot = nav({ class: nameMap.chapterNav });

	van.derive(() => {
		const currentUrl = data.currentLink.val?.url;
		const chapterButtons = data.links.val.map((link, index) =>
			button(
				{
					class: [
						nameMap.chapterLink,
						link.url === currentUrl ? nameMap.active : "",
					].filter(Boolean).join(" "),
					onclick: () => {
						data.goTo(index);
						close();
					},
				},
				link.title ?? `Chapter ${index + 1}`,
			),
		);
		chapterNavRoot.replaceChildren(...chapterButtons);
	});

	return [
		aside(
			{
				class: drawerClass(ui, "chapters", nameMap.chaptersSheet),
				onclick: (event) => event.stopPropagation(),
			},
			drawerHeader("Chapters", close),
			chapterNavRoot,
		),
		aside(
			{
				class: drawerClass(ui, "comments", nameMap.commentsSheet),
				onclick: (event) => event.stopPropagation(),
			},
			drawerHeader("Comments", close),
			div(
				{ class: nameMap.commentsList, onscroll: onInteraction },
				div(
					{ class: nameMap.commentItem },
					div(
						{ class: nameMap.commentMeta },
						span({ class: nameMap.user }, "Site comments"),
						span({ class: nameMap.time }, "Unavailable"),
					),
					p(
						{ class: nameMap.commentText },
						"Comments are not wired to the source site yet. This panel is part of the new UI shell and can be connected later.",
					),
				),
			),
			div(
				{ class: nameMap.commentInputArea },
				div(
					{ class: nameMap.inputWrapper },
					input({
						type: "text",
						placeholder: "Add a comment...",
						value: () => ui.commentDraft.val,
						oninput: (event) => {
							ui.commentDraft.val = (event.target as HTMLInputElement).value;
						},
						disabled: true,
					}),
					button({ disabled: true }, "POST"),
				),
			),
		),
		aside(
			{
				class: drawerClass(ui, "settings", nameMap.settingsSheet),
				onclick: (event) => event.stopPropagation(),
			},
			drawerHeader("Preferences", close),
			settingsPanel(ui),
		),
	];
}
