import van, { type ChildDom, type State } from "vanjs-core";
import { IconClose, IconTune } from "../../style/icon";
import { CustomDropdown } from "./component/custom-dropdown";
import { getMaxChroma, oklchToRgb, rgbToHex } from "./color-math";
import type { createReaderData } from "./reader-data";
import { siteCommentConfigs, type createUiState } from "./state";
import nameMap from "./style.module.scss";
import type {
	InterfaceDensity,
	LineSpacingPreset,
	Oklch,
	PanelPosition,
	ReadingWidthPreset,
	SettingsTab,
	TextSizePreset,
	ThemeMode,
	Typeface,
} from "./types";

const { aside, button, div, h2, input, nav, p, span } =
	van.tags;

type UiState = ReturnType<typeof createUiState>;
type ReaderData = ReturnType<typeof createReaderData>;

const typefaceOptions = [
	{
		label: "Newsreader",
		value: "fontReader" as Typeface,
		className: nameMap.fontReader,
	},
	{ label: "Satoshi", value: "fontUi" as Typeface, className: nameMap.fontUi },
	{
		label: "Literata",
		value: "fontLiterata" as Typeface,
		className: nameMap.fontLiterata,
	},
	{ label: "Custom...", value: "custom" as Typeface },
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

function drawerClass(
	ui: UiState,
	name: "chapters" | "comments" | "settings",
	extraClass: string,
) {
	return () =>
		[
			nameMap.bottomSheetPanel,
			ui.panelPosition.val === "left" ? nameMap.panelLeft : nameMap.panelRight,
			ui.activeOverlay.val === name ? nameMap.visible : "",
			extraClass,
		]
			.filter(Boolean)
			.join(" ");
}

function drawerHeader(title: string, close: () => void, ...tail: ChildDom[]) {
	return div(
		{ class: nameMap.drawerHeader },
		h2(title),
		...tail,
		button(
			{
				class: nameMap.closeButton,
				onclick: close,
				title: `Close ${title.toLowerCase()}`,
			},
			IconClose(),
		),
	);
}

function segmentedButtonGroup<T extends string>(
	currentValue: State<T>,
	options: { label: string; value: T; className?: string }[],
) {
	return div(
		{ class: nameMap.buttonRow },
		...options.map((entry) =>
			button(
				{
					class: () =>
						[
							currentValue.val === entry.value ? nameMap.active : nameMap.inactive,
							entry.className ?? "",
						]
							.filter(Boolean)
							.join(" "),
					onclick: () => {
						currentValue.val = entry.value;
					},
				},
				entry.label,
			),
		),
	);
}

function settingGroup(labelText: string, ...children: ChildDom[]) {
	return div(
		{ class: nameMap.settingsGroup },
		span({ class: nameMap.label }, labelText),
		...children,
	);
}

function advancedToggle(
	enabled: State<boolean>,
	labelText: string,
	valueText: () => string,
) {
	return div(
		{ class: nameMap.sliderHeader },
		span({ class: nameMap.label }, labelText),
		div(
			{ class: nameMap.sliderActions },
			() => (enabled.val ? span({ class: nameMap.value }, valueText) : ""),
			button(
				{
					class: () =>
						[
							nameMap.advancedToggle,
							enabled.val ? nameMap.active : nameMap.inactive,
						].join(" "),
					onclick: () => {
						enabled.val = !enabled.val;
					},
					title: enabled.val ? "Use advanced slider" : "Use presets",
				},
				IconTune(),
			),
		),
	);
}

function sliderField(
	labelText: string,
	enabled: State<boolean>,
	valueText: () => string,
	inputProps: Record<string, any>,
	presetGroup: ChildDom,
) {
	return div(
		{ class: nameMap.settingsGroup },
		advancedToggle(enabled, labelText, valueText),
		() =>
			enabled.val
				? input({ class: nameMap.rangeInput, type: "range", ...inputProps })
				: presetGroup,
	);
}

function colorFor(seed: Oklch) {
	const rgb = oklchToRgb(seed);
	return rgbToHex({
		r: Math.max(0, Math.min(1, rgb.r)),
		g: Math.max(0, Math.min(1, rgb.g)),
		b: Math.max(0, Math.min(1, rgb.b)),
	});
}

function oklchPicker(seed: State<Oklch>, labelText: string) {
	const minChroma = 0;
	const fixedLightness = 0.64;
	const chromaForHue = (hue: number) => getMaxChroma(fixedLightness, hue);

	const updateFromPointer = (event: PointerEvent, element: HTMLDivElement) => {
		const rect = element.getBoundingClientRect();
		const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
		const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
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
		div({
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
		settingGroup("Typeface", CustomDropdown(ui.typeface, typefaceOptions)),
		() =>
			ui.typeface.val === "custom"
				? div(
						{ class: nameMap.inputWrapper },
						input({
							class: nameMap.textInput,
							type: "text",
							placeholder: "e.g. system-ui, Arial",
							value: () => ui.customTypeface.val,
							oninput: (event: Event) => {
								ui.customTypeface.val = (
									event.target as HTMLInputElement
								).value;
							},
						}),
					)
				: "",
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
		settingGroup("UI Direction", segmentedButtonGroup(ui.panelPosition, panelOptions)),
		settingGroup("Theme Mode", segmentedButtonGroup(ui.themeMode, themeModeOptions)),
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

function settingsPanel(ui: UiState) {
	return div(
		{ class: nameMap.settingsBody },
		div(
			{ class: nameMap.tabSwitcher },
			...(
				[
					{ label: "Typography", value: "typography" },
					{ label: "Interface", value: "interface" },
				] as { label: string; value: SettingsTab }[]
			).map((entry) =>
				button(
					{
						class: () =>
							ui.settingsTab.val === entry.value ? nameMap.active : "",
						onclick: () => {
							ui.settingsTab.val = entry.value;
						},
					},
					entry.label,
				),
			),
		),
		() =>
			ui.settingsTab.val === "typography"
				? typographyTab(ui)
				: interfaceTab(ui),
	);
}

function commentStatusText(data: ReaderData) {
	const state = data.currentComments.val;
	if (state.loading) return `Loading ${state.refs.length} comment page(s)...`;
	if (state.error) return state.error;
	if (!state.supported) return "No site comment section was found for this page.";
	if (!state.items.length) return "No comments were extracted from this page.";
	return "";
}

export function OverlayBackdrop(ui: UiState) {
	return div({
		class: () =>
			[nameMap.drawerOverlay, ui.activeOverlay.val ? nameMap.visible : ""]
				.filter(Boolean)
				.join(" "),
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
	const commentsRoot = div({ class: nameMap.commentsList, onscroll: onInteraction });
	const siteConfigSelect = div(
		{ class: nameMap.siteConfigSelect },
		CustomDropdown(
			ui.activeSiteConfigId,
			siteCommentConfigs.map((entry) => ({
				label: entry.name,
				value: entry.id,
			})),
			"sm",
		),
	);
	const extraFieldsRoot = div({ class: nameMap.extraFields });

	van.derive(() => {
		const currentUrl = data.currentChapterStartUrl.val ?? data.currentLink.val?.url;
		chapterNavRoot.replaceChildren(
			...data.chapterEntries.val.map((entry) =>
				button(
					{
						class: [
							nameMap.chapterLink,
							entry.url === currentUrl ? nameMap.active : "",
						]
							.filter(Boolean)
							.join(" "),
						onclick: () => {
							data.goTo(entry.linkIndex);
							close();
						},
					},
					entry.title,
				),
			),
		);
	});

	van.derive(() => {
		if (ui.activeOverlay.val === "comments") data.loadCurrentComments();
	});

	van.derive(() => {
		const state = data.currentComments.val;
		const status = commentStatusText(data);
		if (status) {
			commentsRoot.replaceChildren(
				div(
					{ class: nameMap.commentItem },
					div(
						{ class: nameMap.commentMeta },
						span({ class: nameMap.user }, "Site comments"),
						span({ class: nameMap.time }, state.loading ? "Loading" : "Idle"),
					),
					p({ class: nameMap.commentText }, status),
				),
			);
			return;
		}

		commentsRoot.replaceChildren(
			...state.items.map((comment) =>
				div(
					{ class: nameMap.commentItem },
					div(
						{ class: nameMap.commentMeta },
						span({ class: nameMap.user }, comment.author),
						span({ class: nameMap.time }, comment.time),
					),
					...comment.text.map((line) =>
						p(
							{ class: nameMap.commentText },
							comment.parentId ? `> ${line}` : line,
						),
					),
				),
			),
		);
	});

	van.derive(() => {
		const config =
			siteCommentConfigs.find((entry) => entry.id === ui.activeSiteConfigId.val) ??
			siteCommentConfigs[0];
		extraFieldsRoot.replaceChildren(
			...config.fields.map((field) =>
				div(
					{ class: nameMap.extraInputWrapper },
					input({
						class: nameMap.textInput,
						type: field.type,
						placeholder: field.placeholder,
						disabled: true,
					}),
				),
			),
		);
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
			drawerHeader("Comments", close, siteConfigSelect),
			commentsRoot,
			div(
				{ class: nameMap.commentInputArea },
				extraFieldsRoot,
				div(
					{ class: nameMap.inputWrapper },
					input({
						class: nameMap.textInput,
						type: "text",
						placeholder: "Add a comment...",
						value: () => ui.commentDraft.val,
						oninput: (event: Event) => {
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
