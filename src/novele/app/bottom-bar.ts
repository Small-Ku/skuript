import van, {
	type ChildDom,
	type PropValueOrDerived,
	type State,
} from "vanjs-core";
import nameMap from "./style.module.scss";
import {
	Direction,
	HorizonDir,
	IconChevron,
	IconPanel,
	IconExitToApp,
	PanelState,
} from "../../style/icon";
import { Fab } from "./component/fab";
import { nav } from "../core/nav";
import { appState } from "./main";

const { div, input, button, span } = van.tags;

export const BottomBar = () => {
	const _navControls = div(
		{ class: () => nameMap.nav },
		div(
			{
				class: nameMap.icon,
				onclick: () => {
					--nav.index.val;
				},
			},
			IconChevron(HorizonDir.Left),
		),
		input({
			type: "number",
			value: nav.index,
			min: nav.min,
			max: nav.max,
			oninput: (e) => (nav.index.val = parseInt(e.target.value, 10)),
		}),
		div(
			{
				class: nameMap.icon,
				onclick: () => {
					++nav.index.val;
				},
			},
			IconChevron(HorizonDir.Right),
		),
	);

	const _bar = div(
		{ class: nameMap.bar },
		_navControls, // Original nav controls
		Fab(
			{
				icon: () => IconExitToApp(),
			},
			{
				onclick: e => { appState.val = false; },
			},
		),
	);
	return _bar;
};
