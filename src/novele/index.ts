import van from "vanjs-core";
import { FabApp } from "./app/main";
import { code } from "./app/styles/style.module.scss";
import { installCommentFrameBridge } from "./core/comment-frame-bridge";
import { createNoveleLogger } from "./core/log";

const { div, style } = van.tags;
const logger = createNoveleLogger("bootstrap");

if (window.top !== window.self) {
	installCommentFrameBridge();
	logger.debug("installed iframe comment bridge", {
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
	logger.info("mounted reader app", {
		href: window.location.href,
	});
}
