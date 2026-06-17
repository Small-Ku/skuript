import van, { type State } from "vanjs-core";
import { HorizonDir, IconChevron, IconExitToApp } from "../../style/icon";
import { nav } from "../core/nav";
import { Fab } from "./component/fab";
import nameMap from "./style.module.scss";

const { div, input } = van.tags;

export const BottomBar = (open?: State<boolean>) => {
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
				onclick: () => {
					if (open) open.val = false;
				},
			},
		),
	);
	return _bar;
};
