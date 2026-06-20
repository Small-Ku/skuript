import van from "vanjs-core";
import { FabApp } from "./app/main";
import { code } from "./app/styles/style.module.scss";
import { installCommentFrameBridge } from "./core/comment-frame-bridge";

const { div, style } = van.tags;

if (window.top !== window.self) {
	installCommentFrameBridge();
	console.debug("[novele] installed iframe comment bridge", {
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
