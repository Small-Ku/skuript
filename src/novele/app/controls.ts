import van, { type State } from "vanjs-core";
import {
	HorizonDir,
	IconChevron,
	IconComment,
	IconToc,
	IconTune,
} from "../../style/icon";
import { debounceRaf } from "../../util/batch";
import type { createReaderData } from "./reader-data";
import type { createUiState } from "./state";
import nameMap from "./styles/style.module.scss";

const { button, div, footer, header, span } = van.tags;

type UiState = ReturnType<typeof createUiState>;
type ReaderData = ReturnType<typeof createReaderData>;

function activeClass(active: boolean, className: string) {
	return active ? className : "";
}

function overlayButton(
	ui: UiState,
	name: "chapters" | "comments" | "settings",
	label: string,
	icon: Node,
	toggleOverlay: (name: "chapters" | "comments" | "settings") => void,
) {
	return button(
		{
			class: () =>
				[
					nameMap.navButton,
					activeClass(ui.activeOverlay.val === name, nameMap.active),
				]
					.filter(Boolean)
					.join(" "),
			onclick: (event) => {
				event.stopPropagation();
				toggleOverlay(name);
			},
			title: label,
		},
		icon,
	);
}

function arrowButton(
	label: string,
	direction: HorizonDir,
	onclick: (event: MouseEvent) => void,
	disabled: () => boolean,
) {
	return button(
		{
			class: nameMap.navButton,
			onclick,
			disabled,
			title: label,
		},
		IconChevron(direction),
	);
}

function parsePixelValue(value: string) {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function TopBar(ui: UiState, data: ReaderData, open: State<boolean>) {
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
	const useCompactLayout = van.state(false);
	let desktopSizerElement: HTMLDivElement | undefined;

	const toggleOverlay = (name: "chapters" | "comments" | "settings") => {
		ui.activeOverlay.val = ui.activeOverlay.val === name ? null : name;
	};

	const isVisible = () =>
		ui.controlsVisible.val && !ui.activeOverlay.val && open.val;

	van.derive(() => {
		if (
			!data.currentCommentsAvailable.val &&
			ui.activeOverlay.val === "comments"
		) {
			ui.activeOverlay.val = null;
		}
	});

	const isPrevDisabled = () =>
		data.links.val.length === 0 || data.currentLink.val === data.links.val[0];
	const isNextDisabled = () =>
		data.links.val.length === 0 ||
		data.currentLink.val === data.links.val[data.links.val.length - 1];

	const desktopOverlayGroup = () =>
		div(
			{
				class: `${nameMap.glass} ${nameMap.glassNav} ${nameMap.compactStartPad} ${nameMap.compactEndPad}`,
			},
			overlayButton(ui, "chapters", "Chapters", IconToc(), toggleOverlay),
			() =>
				data.currentCommentsAvailable.val
					? overlayButton(
							ui,
							"comments",
							"Comments",
							IconComment(),
							toggleOverlay,
						)
					: "",
			overlayButton(ui, "settings", "Preferences", IconTune(), toggleOverlay),
		);

	const desktopArrowGroup = () =>
		div(
			{
				class: `${nameMap.glass} ${nameMap.glassNav} ${nameMap.glassArrows} ${nameMap.compactStartPad} ${nameMap.compactEndPad}`,
			},
			arrowButton(
				"Previous chapter",
				HorizonDir.Left,
				(event) => {
					event.stopPropagation();
					data.previous();
				},
				isPrevDisabled,
			),
			arrowButton(
				"Next chapter",
				HorizonDir.Right,
				(event) => {
					event.stopPropagation();
					data.next();
				},
				isNextDisabled,
			),
		);

	const mobileControlGroup = () =>
		div(
			{
				class: `${nameMap.mobileBottomGroup} ${nameMap.glass} ${nameMap.glassNav} ${nameMap.compactStartPad} ${nameMap.compactEndPad}`,
			},
			arrowButton(
				"Previous chapter",
				HorizonDir.Left,
				(event) => {
					event.stopPropagation();
					data.previous();
				},
				isPrevDisabled,
			),
			overlayButton(ui, "chapters", "Chapters", IconToc(), toggleOverlay),
			() =>
				data.currentCommentsAvailable.val
					? overlayButton(
							ui,
							"comments",
							"Comments",
							IconComment(),
							toggleOverlay,
						)
					: "",
			overlayButton(ui, "settings", "Preferences", IconTune(), toggleOverlay),
			arrowButton(
				"Next chapter",
				HorizonDir.Right,
				(event) => {
					event.stopPropagation();
					data.next();
				},
				isNextDisabled,
			),
		);

	const desktopControlGroup = () =>
		div(
			{
				class: nameMap.desktopBottomGroup,
			},
			desktopOverlayGroup(),
			desktopArrowGroup(),
		);

	const updateLayoutMode = () => {
		if (!desktopSizerElement?.isConnected) {
			return;
		}
		const barStyle = window.getComputedStyle(desktopSizerElement);
		const anchorOffset = parsePixelValue(
			ui.panelPosition.val === "left" ? barStyle.left : barStyle.right,
		);
		const availableWidth = Math.max(0, window.innerWidth - anchorOffset);
		const requiredWidth = Math.ceil(
			desktopSizerElement.getBoundingClientRect().width,
		);
		useCompactLayout.val = requiredWidth > availableWidth;
	};

	const scheduleLayoutModeUpdate = debounceRaf(updateLayoutMode);

	van.derive(() => {
		data.currentCommentsAvailable.val;
		ui.panelPosition.val;
		ui.interfaceScale.val;
		open.val;
		scheduleLayoutModeUpdate();
	});

	const desktopSizer = div(
		{
			class: nameMap.desktopBottomSizer,
		},
		desktopOverlayGroup(),
		desktopArrowGroup(),
	);
	desktopSizerElement = desktopSizer;

	const bottomBar = footer(
		{
			class: () =>
				[
					nameMap.bottomBar,
					isVisible() ? nameMap.visible : "",
					useCompactLayout.val ? nameMap.compactBottomBar : "",
				]
					.filter(Boolean)
					.join(" "),
		},
		() => (useCompactLayout.val ? mobileControlGroup() : desktopControlGroup()),
	);

	const resizeObserver = new ResizeObserver(() => {
		scheduleLayoutModeUpdate();
	});
	resizeObserver.observe(desktopSizer);
	window.addEventListener("resize", scheduleLayoutModeUpdate);
	scheduleLayoutModeUpdate();

	return div(desktopSizer, bottomBar);
}
