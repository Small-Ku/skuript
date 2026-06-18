import van, {
	type ChildDom,
	type Props,
	type PropsWithKnownKeys,
	type State,
} from "vanjs-core";
import { IconClose, IconTune } from "../../style/icon";
import { ZHENHUN_COMMENT_POST_URL } from "../core/extract/comments";
import { CustomDropdown } from "./components/custom-dropdown";
import type { createReaderData } from "./reader-data";
import type { createUiState } from "./state";
import nameMap from "./styles/style.module.scss";
import { getMaxChroma, oklchToRgb, rgbToHex } from "./theme/color-math";
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
import {
	COMPACT_REGULAR_RELAXED_VALUES,
	INTERFACE_DENSITY_VALUES,
	PANEL_POSITION_VALUES,
	READING_WIDTH_PRESET_VALUES,
	THEME_MODE_VALUES,
	TYPEFACE_VALUES,
} from "./types";

const { aside, button, div, h2, iframe, input, nav, p, span, textarea } =
	van.tags;

type UiState = ReturnType<typeof createUiState>;
type ReaderData = ReturnType<typeof createReaderData>;

const [typefaceReader, typefaceUi, typefaceLiterata, typefaceCustom] =
	TYPEFACE_VALUES;
const [compactPreset, regularPreset, relaxedPreset] =
	COMPACT_REGULAR_RELAXED_VALUES;
const [narrowWidth, regularWidth, wideWidth] = READING_WIDTH_PRESET_VALUES;
const [lightMode, autoMode, darkMode] = THEME_MODE_VALUES;
const [compactDensity, comfortableDensity, spaciousDensity] =
	INTERFACE_DENSITY_VALUES;
const [leftPanel, rightPanel] = PANEL_POSITION_VALUES;

const typefaceOptions = [
	{
		label: "Newsreader",
		value: typefaceReader as Typeface,
		className: nameMap.fontReader,
	},
	{
		label: "Satoshi",
		value: typefaceUi as Typeface,
		className: nameMap.fontUi,
	},
	{
		label: "Literata",
		value: typefaceLiterata as Typeface,
		className: nameMap.fontLiterata,
	},
	{ label: "Custom...", value: typefaceCustom as Typeface },
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

const themeModeOptions = [
	{ label: "Light", value: lightMode as ThemeMode },
	{ label: "Auto", value: autoMode as ThemeMode },
	{ label: "Dark", value: darkMode as ThemeMode },
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
							currentValue.val === entry.value
								? nameMap.active
								: nameMap.inactive,
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
	inputProps: Props & PropsWithKnownKeys<HTMLInputElement>,
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
		settingGroup(
			"UI Direction",
			segmentedButtonGroup(ui.panelPosition, panelOptions),
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
	if (!state.supported)
		return "No site comment section was found for this page.";
	if (!state.items.length) return "No comments yet.";
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
	const commentsRoot = div({
		class: nameMap.commentsList,
		onscroll: onInteraction,
	});
	const submitComment = async () => {
		const success = await data.submitCurrentComment(
			ui.commentAuthor.val,
			ui.commentDraft.val,
		);
		if (success) ui.commentDraft.val = "";
	};

	van.derive(() => {
		const currentUrl =
			data.currentChapterStartUrl.val ?? data.currentLink.val?.url;
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
			commentsRoot,
			div(
				{ class: nameMap.commentInputArea },
				() =>
					data.currentComments.val.error
						? div(
								{ class: nameMap.commentError },
								data.currentComments.val.error,
							)
						: "",
				() =>
					data.currentComments.val.needsCloudflareVerification
						? iframe({
								class: nameMap.commentChallengeFrame,
								src: ZHENHUN_COMMENT_POST_URL,
								title: "Cloudflare verification",
							})
						: "",
				div(
					{ class: nameMap.inputWrapper },
					input({
						class: nameMap.textInput,
						type: "text",
						placeholder: "Nickname",
						value: () => ui.commentAuthor.val,
						oninput: (event: Event) => {
							ui.commentAuthor.val = (event.target as HTMLInputElement).value;
						},
						disabled: () =>
							data.currentComments.val.loading ||
							data.currentComments.val.posting ||
							!data.currentComments.val.postId,
					}),
				),
				div(
					{ class: nameMap.inputWrapper },
					textarea({
						class: nameMap.textInput,
						placeholder: "Add a comment...",
						value: () => ui.commentDraft.val,
						oninput: (event: Event) => {
							ui.commentDraft.val = (event.target as HTMLTextAreaElement).value;
						},
						disabled: () =>
							data.currentComments.val.loading ||
							data.currentComments.val.posting ||
							!data.currentComments.val.postId,
					}),
					button(
						{
							disabled: () => {
								const comments = data.currentComments.val;
								return (
									comments.loading ||
									comments.posting ||
									!comments.postId ||
									!ui.commentDraft.val.trim()
								);
							},
							onclick: submitComment,
						},
						() =>
							data.currentComments.val.posting
								? "POSTING"
								: data.currentComments.val.needsCloudflareVerification
									? "RETRY"
									: "POST",
					),
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
