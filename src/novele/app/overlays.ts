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
