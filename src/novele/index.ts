import van from "vanjs-core";
import { FabApp } from "./app/main";
import { code } from "./app/styles/style.module.scss";

const { div, style } = van.tags;

if (window.top !== window.self) {
	console.debug("[novele] skipped iframe bootstrap", {
		href: window.location.href,
	});
} else {
	const attachShadow = (
		parent: Element,
		stylesheet?: string | (() => string),
		init: ShadowRootInit = { mode: "closed" },
	) => {
		const base = div();
		van.add(parent, base);
		const root = base.attachShadow(init);
		root.appendChild(style(stylesheet));
		return root;
	};

	const root = attachShadow(document.body, code);
	root.appendChild(FabApp());
}
