import van from "vanjs-core";
import {
	createIncrementalRenderer,
	renderProgressively,
} from "../../util/batch";
import { CommentsPanel } from "./comments-panel";
import {
	drawerClass,
	drawerHeader,
	type ReaderData,
	type UiState,
} from "./overlay-shared";
import type { ChapterEntry } from "./reader-data";
import { SettingsPanel } from "./settings-panel";
import nameMap from "./styles/style.module.scss";
import { OverlayName } from "./types";

const { aside, button, div, nav } = van.tags;

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

function ChaptersPanel(ui: UiState, data: ReaderData, close: () => void) {
	const chapterNavRoot = nav({ class: nameMap.chapterNav });
	const buttonMap = new Map<string, HTMLButtonElement>();

	const renderChapters = createIncrementalRenderer<[ChapterEntry[]]>();
	let pendingScroll = false;

	const doScroll = () => {
		const currentUrl =
			data.currentChapterStartUrl.val ?? data.currentLink.val?.url;
		if (currentUrl) {
			const activeBtn = buttonMap.get(currentUrl);
			if (activeBtn) {
				activeBtn.scrollIntoView({ block: "center" });
				pendingScroll = false;
			} else {
				pendingScroll = true;
			}
		}
	};

	let lastClosedTime = 0;
	let lastOverlayState: OverlayName | null = null;
	let scrollTimeoutId: ReturnType<typeof setTimeout> | null = null;

	van.derive(() => {
		const activeOverlay = ui.activeOverlay.val;
		if (
			activeOverlay === OverlayName.Chapters &&
			lastOverlayState !== OverlayName.Chapters
		) {
			const now = Date.now();
			const timeSinceLastClose = now - lastClosedTime;
			const isQuickReopen = timeSinceLastClose < 1000;

			if (scrollTimeoutId) {
				clearTimeout(scrollTimeoutId);
			}

			scrollTimeoutId = setTimeout(
				() => {
					doScroll();
					scrollTimeoutId = null;
				},
				isQuickReopen ? 250 : 50,
			);
		} else if (
			activeOverlay !== OverlayName.Chapters &&
			lastOverlayState === OverlayName.Chapters
		) {
			lastClosedTime = Date.now();
			if (scrollTimeoutId) {
				clearTimeout(scrollTimeoutId);
				scrollTimeoutId = null;
			}
			pendingScroll = false;
		}
		lastOverlayState = activeOverlay;
	});

	van.derive(() => {
		const activeOverlay = ui.activeOverlay.val;
		const entries = data.chapterEntries.val;

		if (activeOverlay === OverlayName.Chapters) {
			renderChapters([entries], async ({ isAborted }) => {
				chapterNavRoot.replaceChildren();
				buttonMap.clear();

				const currentUrl =
					data.currentChapterStartUrl.val ?? data.currentLink.val?.url;

				await renderProgressively(
					chapterNavRoot,
					entries,
					(entry) => {
						const isActive = entry.url === currentUrl;
						const btn = button(
							{
								class: [nameMap.chapterLink, isActive ? nameMap.active : ""]
									.filter(Boolean)
									.join(" "),
								onclick: () => {
									data.goTo(entry.linkIndex);
									close();
								},
							},
							entry.title,
						);
						buttonMap.set(entry.url, btn);
						return btn;
					},
					{
						chunkSize: 100,
						isAborted,
						onChunkAppended: () => {
							if (pendingScroll && currentUrl && buttonMap.has(currentUrl)) {
								doScroll();
							}
						},
					},
				);
			});
		}
	});

	van.derive(() => {
		const currentUrl =
			data.currentChapterStartUrl.val ?? data.currentLink.val?.url;

		const oldActive = chapterNavRoot.querySelector(`.${nameMap.active}`);
		if (oldActive) {
			oldActive.classList.remove(nameMap.active);
		}

		if (currentUrl) {
			const newActive = buttonMap.get(currentUrl);
			if (newActive) {
				newActive.classList.add(nameMap.active);
			}
		}
	});

	return aside(
		{
			class: drawerClass(ui, OverlayName.Chapters),
			onclick: (event) => event.stopPropagation(),
		},
		drawerHeader("Chapters", close),
		chapterNavRoot,
	);
}

export function OverlayPanels(
	ui: UiState,
	data: ReaderData,
	onInteraction: () => void,
) {
	const close = () => {
		ui.activeOverlay.val = null;
	};

	return [
		ChaptersPanel(ui, data, close),
		CommentsPanel(ui, data, onInteraction, close),
		SettingsPanel(ui, close),
	];
}
