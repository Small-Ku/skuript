import van, { type State } from "vanjs-core";
import { nav } from "../core/nav";
import { updateCurrentPage } from "../core/queue";
import {
	normalizeChapterUrl,
	readChapterScrollRecord,
	writeChapterScrollRecord,
} from "../core/scroll";
import { BottomControls, TopBar } from "./controls";
import { OverlayBackdrop, OverlayPanels } from "./overlays";
import { createReaderData, NavigationMode } from "./reader-data";
import type { UiState } from "./state";
import nameMap from "./styles/style.module.scss";
import {
	COMPACT_REGULAR_RELAXED_VALUES,
	isBuiltInTypeface,
	READING_WIDTH_PRESET_VALUES,
} from "./types";

const { div, h1, main, p } = van.tags;
const [compactPreset, regularPreset, relaxedPreset] =
	COMPACT_REGULAR_RELAXED_VALUES;
const [narrowWidth, regularWidth, wideWidth] = READING_WIDTH_PRESET_VALUES;
const hostFontSizePx = 16;

const textSizePresetMap = {
	[compactPreset]: 15,
	[regularPreset]: 19,
	[relaxedPreset]: 23,
} as const;

const lineSpacingPresetMap = {
	[compactPreset]: 1.375,
	[regularPreset]: 1.625,
	[relaxedPreset]: 2,
} as const;

const readingWidthPresetMap = {
	[narrowWidth]: 36,
	[regularWidth]: 42,
	[wideWidth]: 48,
} as const;

function pxToEm(value: number) {
	return `${Number((value / hostFontSizePx).toFixed(4))}em`;
}

function readerStyle(ui: UiState) {
	return () => {
		const fontSize = ui.advancedTextSize.val
			? ui.textSizeValue.val
			: textSizePresetMap[ui.textSizePreset.val];
		const lineHeight = ui.advancedLineSpacing.val
			? ui.lineSpacingValue.val
			: lineSpacingPresetMap[ui.lineSpacingPreset.val];
		const style = [
			`--reader-font-size:${pxToEm(fontSize)}`,
			`--reader-line-height:${lineHeight}`,
		];
		if (!isBuiltInTypeface(ui.typeface.val)) {
			style.push(`font-family:${ui.typeface.val}`);
		}
		return style.join(";");
	};
}

function textContentStyle(ui: UiState) {
	return () => {
		const readingWidth = ui.advancedReadingWidth.val
			? ui.readingWidthValue.val
			: readingWidthPresetMap[ui.readingWidthPreset.val];
		return `--reader-content-width:${readingWidth}em`;
	};
}

function currentTypefaceClass(ui: UiState) {
	if (!isBuiltInTypeface(ui.typeface.val)) {
		return "";
	}
	switch (ui.typeface.val) {
		case "fontUi":
			return nameMap.fontUi;
		case "fontLiterata":
			return nameMap.fontLiterata;
		default:
			return nameMap.fontReader;
	}
}

export function Reader(open: State<boolean>, ui: UiState) {
	const data = createReaderData();
	let restoreQueued = false;
	let suppressScrollPersistence = false;
	let lastChapterUrl: string | undefined;
	let pendingRestore:
		| {
				chapterUrl: string;
				mode: NavigationMode;
		  }
		| undefined;

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
		if (open.val) {
			data.start();
		}
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

	const currentChapterUrl = van.derive(() => {
		const chapterUrl =
			data.currentChapterStartUrl.val ?? data.currentLink.val?.url;
		return chapterUrl ? normalizeChapterUrl(chapterUrl) : undefined;
	});

	const persistCurrentScroll = (chapterUrl = currentChapterUrl.val) => {
		if (
			suppressScrollPersistence ||
			!chapterUrl ||
			!readerSurface.isConnected
		) {
			return;
		}
		const maxScrollTop = Math.max(
			0,
			readerSurface.scrollHeight - readerSurface.clientHeight,
		);
		writeChapterScrollRecord(
			chapterUrl,
			maxScrollTop > 0 ? readerSurface.scrollTop / maxScrollTop : 0,
		);
	};

	const scheduleRestore = () => {
		if (restoreQueued || !pendingRestore) return;
		restoreQueued = true;
		requestAnimationFrame(() => {
			restoreQueued = false;
			if (!pendingRestore) return;
			if (pendingRestore.chapterUrl !== currentChapterUrl.val) return;
			const content = data.currentContent.val;
			const status = data.currentStatus.val;
			if (status.isLoading && !content.length) {
				scheduleRestore();
				return;
			}
			const record = readChapterScrollRecord(pendingRestore.chapterUrl);
			const maxScrollTop = Math.max(
				0,
				readerSurface.scrollHeight - readerSurface.clientHeight,
			);
			suppressScrollPersistence = true;
			readerSurface.scrollTop = record
				? record.ratio * maxScrollTop
				: pendingRestore.mode === NavigationMode.Previous
					? maxScrollTop
					: 0;
			pendingRestore = undefined;
			requestAnimationFrame(() => {
				suppressScrollPersistence = false;
			});
		});
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
		} else if (status.isLoading && !content.length) {
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
			onscroll: () => {
				onInteraction();
				persistCurrentScroll();
			},
		},
		textContentRoot,
	);

	van.derive(() => {
		const chapterUrl = currentChapterUrl.val;
		const mode = data.navMode.val;
		if (!chapterUrl) return;
		if (lastChapterUrl && lastChapterUrl !== chapterUrl) {
			persistCurrentScroll(lastChapterUrl);
		}
		if (lastChapterUrl !== chapterUrl) {
			lastChapterUrl = chapterUrl;
			pendingRestore = { chapterUrl, mode };
			scheduleRestore();
		}
	});

	van.derive(() => {
		currentChapterUrl.val;
		data.currentContent.val;
		data.currentStatus.val.isLoading;
		data.currentStatus.val.error;
		scheduleRestore();
	});

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
