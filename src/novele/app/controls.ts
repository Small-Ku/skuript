import van, { type State } from "vanjs-core";
import {
	HorizonDir,
	IconChevron,
	IconComment,
	IconToc,
	IconTune,
} from "../../style/icon";
import type { createReaderData } from "./reader-data";
import type { createUiState } from "./state";
import nameMap from "./style.module.scss";

const { button, div, footer, header, span } = van.tags;

type UiState = ReturnType<typeof createUiState>;
type ReaderData = ReturnType<typeof createReaderData>;

function activeClass(active: boolean, className: string) {
	return active ? className : "";
}

export function TopBar(
	ui: UiState,
	data: ReaderData,
	open: State<boolean>,
) {
	return header(
		{
			class: () =>
				[
					nameMap.topBar,
					ui.controlsVisible.val && !ui.activeOverlay.val && open.val
						? nameMap.visible
						: "",
				]
					.filter(Boolean)
					.join(" "),
		},
		div(
			{ class: `${nameMap.glass} ${nameMap.glassBadge}` },
			span(() => data.currentTitle.val),
		),
	);
}

export function BottomControls(
	ui: UiState,
	data: ReaderData,
	open: State<boolean>,
) {
	const toggleOverlay = (name: "chapters" | "comments" | "settings") => {
		ui.activeOverlay.val = ui.activeOverlay.val === name ? null : name;
	};

	const isVisible = () =>
		ui.controlsVisible.val && !ui.activeOverlay.val && open.val;

	van.derive(() => {
		if (!data.currentCommentsAvailable.val && ui.activeOverlay.val === "comments") {
			ui.activeOverlay.val = null;
		}
	});

	const chapterButton = button(
		{
			class: () =>
				[
					nameMap.navButton,
					activeClass(ui.activeOverlay.val === "chapters", nameMap.active),
				]
					.filter(Boolean)
					.join(" "),
			onclick: (event) => {
				event.stopPropagation();
				toggleOverlay("chapters");
			},
			title: "Chapters",
		},
		IconToc(),
	);

	const commentButton = button(
		{
			class: () =>
				[
					nameMap.navButton,
					activeClass(ui.activeOverlay.val === "comments", nameMap.active),
				]
					.filter(Boolean)
					.join(" "),
			onclick: (event) => {
				event.stopPropagation();
				toggleOverlay("comments");
			},
			title: "Comments",
		},
		IconComment(),
	);

	const settingsButton = button(
		{
			class: () =>
				[
					nameMap.navButton,
					activeClass(ui.activeOverlay.val === "settings", nameMap.active),
				]
					.filter(Boolean)
					.join(" "),
			onclick: (event) => {
				event.stopPropagation();
				toggleOverlay("settings");
			},
			title: "Preferences",
		},
		IconTune(),
	);

	return footer(
		{
			class: () =>
				[nameMap.bottomBar, isVisible() ? nameMap.visible : ""]
					.filter(Boolean)
					.join(" "),
		},
		div(
			{ class: `${nameMap.glass} ${nameMap.glassNav}` },
			chapterButton,
			() => (data.currentCommentsAvailable.val ? commentButton : ""),
			settingsButton,
		),
		div(
			{ class: `${nameMap.glass} ${nameMap.glassNav} ${nameMap.glassArrows}` },
			button(
				{
					class: nameMap.navButton,
					onclick: (event) => {
						event.stopPropagation();
						data.previous();
					},
					disabled: () =>
						data.links.val.length === 0 ||
						data.currentLink.val === data.links.val[0],
					title: "Previous chapter",
				},
				IconChevron(HorizonDir.Left),
			),
			button(
				{
					class: nameMap.navButton,
					onclick: (event) => {
						event.stopPropagation();
						data.next();
					},
					disabled: () =>
						data.links.val.length === 0 ||
						data.currentLink.val === data.links.val[data.links.val.length - 1],
					title: "Next chapter",
				},
				IconChevron(HorizonDir.Right),
			),
		),
	);
}
