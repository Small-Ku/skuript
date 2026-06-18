import van, { type ChildDom, type PropValueOrDerived } from "vanjs-core";
import nameMap from "../styles/style.module.scss";

const { div } = van.tags;

type FabLabel = { text?: ChildDom; icon?: ChildDom };

export const Fab = (
	label: FabLabel,
	prop?: Record<string, PropValueOrDerived>,
) => {
	return div(
		{ ...prop, class: [nameMap.fab, prop?.class ?? ""].join(" ") },
		label.icon && div({ class: nameMap.icon }, label.icon),
		label.text && div({ class: nameMap.label }, label.text),
	);
};

export const ExpandableFab = (
	label: FabLabel,
	prop: Record<string, PropValueOrDerived> = {},
	...child: ChildDom[]
) => {
	const expand = van.state(false);
	const _container = div({
		class: nameMap.container,
		onclick: (e) => {
			e.stopPropagation();
		},
	});
	const fab = Fab(label, {
		...prop,
		onclick: () => {
			expand.val = !expand.val;
		},
	});
	let _body_overflow: string | undefined;
	van.derive(() => {
		const current = fab.classList.contains(nameMap.expanded);
		if (expand.val === current) return;
		if (!expand.val) {
			if (_body_overflow) document.body.style.overflow = _body_overflow;
			fab.classList.remove(nameMap.expanded);
			return;
		}
		if (fab.querySelector(`.${nameMap.container}`)?.childNodes.length === 0) {
			van.add(_container, child);
		}
		fab.classList.add(nameMap.expanded);
		_body_overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
	});
	van.add(fab, _container);
	return { expand, fab };
};
