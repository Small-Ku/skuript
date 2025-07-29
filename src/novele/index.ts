import van from "vanjs-core";
import { code } from "./app/style.module.scss";
import { FabApp } from "./app/main";
import { parseLinks } from "./core/extract/links";
import { getContent, getPage, getTitle } from "./core/extract/pages";
import { getChapter, parsePageChapter } from "./core/extract/chapters";

const { div, style } = van.tags;

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

/* Test core functions temporary without UI */
console.log(parseLinks(document));
Promise.all([getPage(window.location.href), parsePageChapter(window.location.href)]).then((arr) => {
	arr.forEach((item, i) => {console.log(`Test ${i + 1}:`, item);});
}).catch(console.error);
parsePageChapter(window.location.href).then((map) => {
	map.keys().forEach((index) => {
		const chapter = getChapter(index);
		console.log(`Chapter ${index}:`, chapter);
	});
})