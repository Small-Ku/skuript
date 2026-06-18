import van, { type State } from "vanjs-core";
import { nav } from "../core/nav";
import { updateCurrentPage } from "../core/queue";
import { BottomControls, TopBar } from "./controls";
import { OverlayBackdrop, OverlayPanels } from "./overlays";
import { createReaderData } from "./reader-data";
import type { UiState } from "./state";
import nameMap from "./styles/style.module.scss";

const { div, h1, main, p } = van.tags;

const textSizePresetMap = {
	compact: 15,
	regular: 19,
	relaxed: 23,
} as const;

const lineSpacingPresetMap = {
	compact: 1.375,
	regular: 1.625,
	relaxed: 2,
} as const;

const readingWidthPresetMap = {
	narrow: 36,
	regular: 42,
	wide: 48,
} as const;

function readerStyle(ui: UiState) {
	return () => {
		const fontSize = ui.advancedTextSize.val
			? ui.textSizeValue.val
			: textSizePresetMap[ui.textSizePreset.val];
		const lineHeight = ui.advancedLineSpacing.val
			? ui.lineSpacingValue.val
			: lineSpacingPresetMap[ui.lineSpacingPreset.val];
		const style = [`font-size:${fontSize}px`, `line-height:${lineHeight}`];
		if (ui.typeface.val === "custom") {
			style.push(`font-family:${ui.customTypeface.val}`);
		}
		return style.join(";");
	};
}

function textContentStyle(ui: UiState) {
	return () => {
		const readingWidth = ui.advancedReadingWidth.val
			? ui.readingWidthValue.val
			: readingWidthPresetMap[ui.readingWidthPreset.val];
		const paddingY = ui.advancedReadingWidth.val
			? Math.max(1, (60 - ui.readingWidthValue.val) / 3)
			: ui.readingWidthPreset.val === "narrow"
				? 8
				: ui.readingWidthPreset.val === "wide"
					? 4
					: 6;
		return [`max-width:${readingWidth}em`, `padding:${paddingY}em 1.5em`].join(
			";",
		);
	};
}

function currentTypefaceClass(ui: UiState) {
	switch (ui.typeface.val) {
		case "fontUi":
			return nameMap.fontUi;
		case "fontLiterata":
			return nameMap.fontLiterata;
		case "custom":
			return "";
		default:
			return nameMap.fontReader;
	}
}

export function Reader(open: State<boolean>, ui: UiState) {
	const data = createReaderData();

	van.derive(() => {
		void updateCurrentPage(nav.index.val);
	});

	let controlsTimeout: ReturnType<typeof setTimeout> | undefined;
	const resetControlsTimeout = () => {
		if (controlsTimeout) clearTimeout(controlsTimeout);
		if (!open.val || ui.activeOverlay.val) {
			ui.controlsVisible.val = true;
			return;
		}
		ui.controlsVisible.val = true;
		controlsTimeout = setTimeout(() => {
			ui.controlsVisible.val = false;
		}, 3000);
	};

	van.derive(() => {
		open.val;
		ui.activeOverlay.val;
		resetControlsTimeout();
	});

	van.derive(() => {
		if (!open.val) {
			ui.activeOverlay.val = null;
			ui.controlsVisible.val = true;
		}
	});

	const onInteraction = () => {
		resetControlsTimeout();
	};

	const textContentRoot = div({
		class: nameMap.textContent,
		style: textContentStyle(ui),
	});

	van.derive(() => {
		const content = data.currentContent.val;
		const status = data.currentStatus.val;
		const children = [];
		if (status.error) {
			children.push(
				h1(data.currentTitle.val),
				p({ class: nameMap.statusText }, status.error),
			);
		} else if (status.loading && !content.length) {
			children.push(
				h1(data.currentTitle.val),
				p({ class: nameMap.statusText }, "Loading chapter content..."),
			);
		} else if (!content.length) {
			children.push(
				h1(data.currentTitle.val),
				p(
					{ class: nameMap.statusText },
					data.links.val.length
						? "No readable content was extracted from this chapter yet."
						: "Discovering chapter links on this page...",
				),
			);
		} else {
			children.push(
				h1(data.currentTitle.val),
				...content.map((paragraphText) => p(paragraphText)),
			);
		}
		textContentRoot.replaceChildren(...children);
	});

	const readerSurface = main(
		{
			class: () =>
				[
					nameMap.readerMain,
					ui.activeOverlay.val ? nameMap.drawerOpen : "",
					ui.panelPosition.val === "left"
						? nameMap.panelLeft
						: nameMap.panelRight,
					currentTypefaceClass(ui),
				]
					.filter(Boolean)
					.join(" "),
			style: readerStyle(ui),
			onscroll: onInteraction,
		},
		textContentRoot,
	);

	return div(
		{
			class: nameMap.readerApp,
			onmousemove: onInteraction,
			onclick: onInteraction,
			ontouchstart: onInteraction,
		},
		div(
			{
				class: () =>
					[nameMap.appContentWrapper, open.val ? nameMap.appExpanded : ""].join(
						" ",
					),
				style: () =>
					`transform-origin:${ui.panelPosition.val === "left" ? "left" : "right"} center`,
			},
			readerSurface,
			TopBar(ui, data, open),
			BottomControls(ui, data, open),
			OverlayBackdrop(ui),
			...OverlayPanels(ui, data, onInteraction),
		),
	);
}
