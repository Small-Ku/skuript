import van from "vanjs-core";
import nameMap from "./style.module.scss";
import { Reader } from "./reader";
import { IconExitToApp, IconReadMore } from "../../style/icon";
import { createUiState } from "./state";

const { button, div, span } = van.tags;

export const FabApp = () => {
	const open = van.state(false);
	const ui = createUiState();
	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const app = div({
		class: () => [
			nameMap.app,
			open.val ? nameMap.appExpanded : "",
			ui.effectiveTheme.val === "dark" ? nameMap.themeDark : nameMap.themeLight,
			ui.themeColor.val === "cyan"
				? nameMap.colorCyan
				: ui.themeColor.val === "emerald"
					? nameMap.colorEmerald
					: ui.themeColor.val === "amber"
						? nameMap.colorAmber
						: nameMap.colorRose,
			ui.interfaceDensity.val === "compact"
				? nameMap.uiDensityCompact
				: ui.interfaceDensity.val === "spacious"
					? nameMap.uiDensitySpacious
					: nameMap.uiDensityComfortable,
		].filter(Boolean).join(" "),
	});
	const reader = Reader(open, ui);
	let bodyOverflow = `${document.body.style.overflow}`;

	const updateSystemTheme = () => {
		ui.systemPrefersDark.val = mediaQuery.matches;
	};
	mediaQuery.addEventListener("change", updateSystemTheme);

	van.derive(() => {
		if (open.val) {
			bodyOverflow = `${document.body.style.overflow}`;
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = bodyOverflow;
		}
	});

	const fab = button(
		{
			class: () => [
				nameMap.persistentFab,
				nameMap.glass,
				open.val ? nameMap.fabOpen : "",
			].filter(Boolean).join(" "),
			onclick: (event) => {
				event.stopPropagation();
				open.val = !open.val;
			},
			title: () => open.val ? "Close reader" : "Open reader",
		},
		div(
			{ class: nameMap.fabIcon },
			() => open.val ? IconExitToApp() : IconReadMore(),
		),
		span(
			{
				class: () => [
					nameMap.fabLabel,
					open.val ? nameMap.fabLabelHidden : "",
				].filter(Boolean).join(" "),
			},
			"Novelé",
		),
	);

	van.add(app, reader, fab);
	return app;
};
