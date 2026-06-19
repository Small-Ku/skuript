import van from "vanjs-core";
import { IconExitToApp, IconReadMore } from "../../style/icon";
import { bindUiPreferences, loadUiPreferences } from "../core/preferences";
import { Reader } from "./reader";
import { createUiState } from "./state";
import nameMap from "./styles/style.module.scss";
import { generateDensityVars } from "./theme/density";
import { generateThemeVars } from "./theme/theme";

const { button, div, span } = van.tags;

export const FabApp = () => {
	const open = van.state(false);
	const ui = createUiState(loadUiPreferences());
	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const app = div({
		class: () =>
			[
				nameMap.app,
				open.val ? nameMap.appExpanded : "",
				ui.effectiveTheme.val === "dark"
					? nameMap.themeDark
					: nameMap.themeLight,
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
			const densityVars = generateDensityVars(ui.interfaceScale.val);
			return [
				...Object.entries(vars).map(([key, value]) => `${key}:${value}`),
				...Object.entries(densityVars).map(([key, value]) => `${key}:${value}`),
				"font-size:16px",
			].join(";");
		},
	});
	const reader = Reader(open, ui);
	let bodyOverflow = `${document.body.style.overflow}`;

	const updateSystemTheme = () => {
		ui.systemPrefersDark.val = mediaQuery.matches;
	};
	mediaQuery.addEventListener("change", updateSystemTheme);
	bindUiPreferences(ui);

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
