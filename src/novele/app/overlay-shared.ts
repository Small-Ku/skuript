import van, {
	type ChildDom,
	type Props,
	type PropsWithKnownKeys,
	type State,
} from "vanjs-core";
import { IconClose, IconTune } from "../../style/icon";
import type { createReaderData } from "./reader-data";
import type { createUiState } from "./state";
import nameMap from "./styles/style.module.scss";
import type { OverlayName } from "./types";

const { button, div, h2, input, span } = van.tags;

export type UiState = ReturnType<typeof createUiState>;
export type ReaderData = ReturnType<typeof createReaderData>;

export function drawerClass(
	ui: UiState,
	name: OverlayName,
	extraClasses: string[] = [],
) {
	return () =>
		[
			nameMap.bottomSheetPanel,
			ui.panelPosition.val === "left" ? nameMap.panelLeft : nameMap.panelRight,
			ui.drawerHeaderPosition.val === "bottom" ? nameMap.headerBottom : "",
			ui.activeOverlay.val === name ? nameMap.visible : "",
			...extraClasses,
		]
			.filter(Boolean)
			.join(" ");
}

export function drawerHeader(
	title: string,
	close: () => void,
	...tail: ChildDom[]
) {
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

export function segmentedButtonGroup<T extends string>(
	currentValue: State<T>,
	options: { label: string; value: T; optionClass?: string }[],
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
							entry.optionClass ?? "",
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

export function settingGroup(labelText: string, ...children: ChildDom[]) {
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

export function sliderField(
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
