import { hostname } from "./hostname-map";

export type Link = {
	url: string;
	title?: string;
};

let links: Link[] = [];

const linkSelector = {
	"www.52shuku.vip": "ul.list > li > a",
	"www.52shukuw.cc": "ul.catalog > li > a",
	"www.52shuku123.cc": "#list-chapterAll > dd > a",
	"www.xbanxia.com": ".book-list > ul > li > a",
	"www.sunzhinan.com": "#ul_all_chapters > li > a",
	"www.sanhebook.com": "#newlist > li > a",
	"www.256wx.net": "#nr1 > a",
	"www.zhenhunxiaoshuo.com": ".excerpts-wrapper > .excerpts > .excerpt > a",
}[hostname];

const linkTransform = (() => {
	switch (hostname) {
		case "www.zhenhunxiaoshuo.com":
			return (s: string) => `${s}/comment-page-1/`;
	}
})();

export function parseLinks(doc: Document): Link[] {
	if (!linkSelector) throw new Error("not supported");
	const _links = Array.from(doc.querySelectorAll(linkSelector))
		.filter((link) => link.getAttribute("href"))
		.map((link) => {
			// biome-ignore lint/style/noNonNullAssertion: filtered above
			let href = link.getAttribute("href")!;
			if (linkTransform) href = linkTransform(href);
			return {
				url: href,
				title: link.textContent?.trim(),
			};
		});
	links = _links;
	return links;
}

export function getLinks(): Link[] {
	return links;
}
