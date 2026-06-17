import van from "vanjs-core";
import { IconExitToApp, IconReadMore } from "../../style/icon";
import { Reader } from "./reader";
import { createUiState } from "./state";
import { generateThemeVars } from "./theme";
import nameMap from "./style.module.scss";

const { button, div, span } = van.tags;

export const FabApp = () => {
	const open = van.state(false);
	const ui = createUiState();
	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const app = div({
		class: () =>
			[
				nameMap.app,
				open.val ? nameMap.appExpanded : "",
				ui.effectiveTheme.val === "dark"
					? nameMap.themeDark
					: nameMap.themeLight,
				ui.interfaceDensity.val === "compact"
					? nameMap.uiDensityCompact
					: ui.interfaceDensity.val === "spacious"
						? nameMap.uiDensitySpacious
						: nameMap.uiDensityComfortable,
				ui.panelPosition.val === "left" ? nameMap.uiDirectionLeft : "",
			]
				.filter(Boolean)
				.join(" "),
		style: () => {
			const isDark = ui.effectiveTheme.val === "dark";
			const vars = generateThemeVars(
				isDark ? ui.darkPrimarySeed.val : ui.lightPrimarySeed.val,
				isDark ? ui.darkSurfaceSeed.val : ui.lightSurfaceSeed.val,
				isDark,
			);
			const fontSize = ui.advancedInterfaceDensity.val
				? `${ui.interfaceScale.val * 16}px`
				: "16px";
			return [
				...Object.entries(vars).map(([key, value]) => `${key}:${value}`),
				`font-size:${fontSize}`,
			].join(";");
		},
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
			class: () =>
				[
					nameMap.persistentFab,
					nameMap.glass,
					open.val ? nameMap.fabOpen : "",
					ui.activeOverlay.val ? nameMap.overlayOpen : "",
				]
					.filter(Boolean)
					.join(" "),
			onclick: (event) => {
				event.stopPropagation();
				open.val = !open.val;
			},
			title: () => (open.val ? "Close reader" : "Open reader"),
		},
		div({ class: nameMap.fabIcon }, () =>
			open.val ? IconExitToApp() : IconReadMore(),
		),
		span(
			{
				class: () =>
					[nameMap.fabLabel, open.val ? nameMap.fabLabelHidden : ""]
						.filter(Boolean)
						.join(" "),
			},
			"Novelé",
		),
	);

	van.add(app, reader, fab);
	return app;
};
