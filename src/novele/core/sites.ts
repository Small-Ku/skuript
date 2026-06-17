export const getBookInfo: (doc: Document) => {
	title?: string;
	author?: string;
	tag?: string[];
} = ((hostname) => {
	const mappedSite =
		{
			"www.52shuwu.net": "www.52shuku.vip",
			"www.52shuwu.top": "www.52shuku.vip",
			"www.banxia.la": "www.xbanxia.com",
			"www.xbanxia.cc": "www.xbanxia.com",
		}[hostname] ?? hostname;
	const bookInfoSelector =
		{
			"www.52shuku.vip": [".article-title"],
			"www.52shuku123.cc": [".booktitle"],
			"www.dameishuwang.net": [".booktitle"],
			"www.xbanxia.com": [".book-describe>h1"],
			"www.sunzhinan.com": [
				".novel_info_title>h1",
				'.text_info>span>a[href*="books"]>i',
			],
			"www.256wx.org": ["#nr_title"],
			"www.zhenhunxiaoshuo.com": [".focusbox-title"],
		}[mappedSite] ?? [];
	const authorSelector = {
		"www.52shuku123.cc": ['.booktag>a[title^="作者"]'],
		"www.dameishuwang.net": ['.booktag>a[title^="作者"]'],
		"www.xbanxia.com": ['.book-describe>p>a[href*="author"]'],
		"www.sunzhinan.com": [
			'.novel_info_title>i>a[href*="author"]',
			'.text_info>span>a[href*="author"]>i',
		],
		"www.256wx.org": ["#nr_title + span"],
		"www.zhenhunxiaoshuo.com": [".focusbox-text>.text"],
	}[mappedSite];

	const getTitleText = (doc: Document) =>
		bookInfoSelector
			.flatMap((sel) => doc.querySelector(sel))
			.find((elm) => elm)
			?.textContent?.trim();

	return ((host) => {
		if (host === "www.52shuku.vip")
			return (doc: Document) => {
				const titleText = getTitleText(doc);
				if (!titleText) return {};
				const match = titleText.match(/([^_]+)_([^_【】]+)【([^【】]+)】/);
				return match
					? { title: match[1], author: match[2], tag: match[3].split("+") }
					: { title: titleText };
			};
		if (!authorSelector)
			return (doc: Document) => {
				const titleText = getTitleText(doc);
				if (!titleText) return {};
				const match = titleText.match(/([^_]+)_([^_【】]+)(?:【([^【】]+)】)?/);
				return match
					? { title: match[1], tag: match[2] ? [match[2]] : [] }
					: { title: titleText };
			};
		if (host === "www.zhenhunxiaoshuo.com")
			return (doc: Document) => {
				const titleText = getTitleText(doc);
				if (!titleText) return {};
				const authorElm = authorSelector
					.flatMap((sel) => doc.querySelector(sel))
					.find((elm) => elm);
				if (!authorElm) return { title: titleText };
				const author = [...authorElm.childNodes]
					.find((n) => n.textContent?.match(/作者：/))
					?.textContent?.replace(/作者：/, "")
					.trim();
				const match = titleText.match(
					/([^[]［+\r\n]*)(?:[[［+]([^\]］\s[［+]+)[\]］]?)?/,
				);
				return match
					? { title: match[1], author, tag: match[2] ? [match[2]] : [] }
					: { title: titleText };
			};
		return (doc: Document) => {
			const titleText = getTitleText(doc);
			if (!titleText) return {};
			const authorElm = authorSelector
				.flatMap((sel) => doc.querySelector(sel))
				.find((elm) => elm);
			const author = authorElm?.textContent?.replace(/作者：/, "").trim();
			const match = titleText.match(
				/([^[]［+\r\n]*)(?:[[［+]([^\]］\s[［+]+)[\]］]?)?/,
			);
			return match
				? { title: match[1], author, tag: match[2] ? [match[2]] : [] }
				: { title: titleText };
		};
	})(mappedSite);
})(window.location.hostname);
