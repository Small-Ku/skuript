import nameMap from "./style.module.scss";
import { ExpandableFab, Fab } from "./component/fab";
import { Reader } from "./reader";
import { IconExitToApp, IconReadMore } from "../../style/icon";
import van from "vanjs-core";

const { div } = van.tags;

export const { expand: appState, fab: button } = ExpandableFab(
	{ text: "Novelé", icon: IconReadMore() },
	{ class: nameMap.float },
	Reader,
);

export const FabApp = () => {
	const open = van.state(false);
	const app = div(
		{ class: nameMap.app },
	);
	const _container = div({
		class: nameMap.container,
	});
	let _body_overflow = `${document.body.style.overflow}`;
	const text = van.derive(() => !open.val ? "Novelé" : "");
	const _iconStyle = "position:absolute;left:0;top:0;";
	const icon = div(
		IconReadMore({ "style": van.derive(() => _iconStyle + (open.val ? "opacity:0" : "")) }),
		IconExitToApp({ "style": van.derive(() => _iconStyle + (open.val ? "" : "opacity:0")) })
	);
	const fab = Fab({ text, icon }, {
		onclick: () => open.val = !open.val
	});
	van.derive(() => {
		if (open.val) {
			_body_overflow = `${document.body.style.overflow}`;
			document.body.style.overflow = "hidden";
			if (_container.childNodes.length === 0) van.add(_container, Reader);
			app.classList.add(nameMap.expanded);
		} else {
			document.body.style.overflow = _body_overflow;
			app.classList.remove(nameMap.expanded);
		}
	});
	van.add(app, fab);
	van.add(app, _container);
	return app;
};