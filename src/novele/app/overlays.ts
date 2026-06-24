import van from "vanjs-core";
import { CommentsPanel } from "./comments-panel";
import {
	drawerClass,
	drawerHeader,
	type ReaderData,
	type UiState,
} from "./overlay-shared";
import { SettingsPanel } from "./settings-panel";
import nameMap from "./styles/style.module.scss";

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

	let lastClosedTime = 0;
	let lastOverlayState: string | null = null;
	let scrollTimeoutId: ReturnType<typeof setTimeout> | null = null;

	van.derive(() => {
		const activeOverlay = ui.activeOverlay.val;
		if (activeOverlay === "chapters" && lastOverlayState !== "chapters") {
			const now = Date.now();
			const timeSinceLastClose = now - lastClosedTime;
			const isQuickReopen = timeSinceLastClose < 1000;

			const doScroll = () => {
				const activeBtn = chapterNavRoot.querySelector(`.${nameMap.active}`);
				if (activeBtn) {
					activeBtn.scrollIntoView({ block: "center" });
				}
			};

			if (scrollTimeoutId) {
				clearTimeout(scrollTimeoutId);
			}

			if (isQuickReopen) {
				scrollTimeoutId = setTimeout(() => {
					doScroll();
					scrollTimeoutId = null;
				}, 250);
			} else {
				scrollTimeoutId = setTimeout(() => {
					doScroll();
					scrollTimeoutId = null;
				}, 50);
			}
		} else if (
			activeOverlay !== "chapters" &&
			lastOverlayState === "chapters"
		) {
			lastClosedTime = Date.now();
			if (scrollTimeoutId) {
				clearTimeout(scrollTimeoutId);
				scrollTimeoutId = null;
			}
		}
		lastOverlayState = activeOverlay;
	});

	return aside(
		{
			class: drawerClass(ui, "chapters"),
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
