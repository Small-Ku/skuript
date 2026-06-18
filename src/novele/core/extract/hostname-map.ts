const _hostname = window.location.hostname;
export const hostname =
	{
		"www.52shuku123.cc": "www.dameishuwang.net",
		"www.52shuwu.net": "www.52shuku.vip",
		"www.52shuwu.top": "www.52shuku.vip",
		"www.52shuku.net": "www.52shuku.vip",
		"www.banxia.la": "www.xbanxia.com",
		"www.xbanxia.cc": "www.xbanxia.com",
	}[_hostname] ?? _hostname;

export const normalizeFetchUrl = (() => {
	switch (hostname) {
		case "www.zhenhunxiaoshuo.com":
			return (url: string): string => {
				const parsed = new URL(url);
				if (
					!/\/\d+\.html\/?$/.test(parsed.pathname) ||
					/\/comment-page-\d+\/?$/.test(parsed.pathname)
				) {
					return url;
				}
				parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/comment-page-1/`;
				return parsed.href;
			};
		default:
			return (url: string): string => url;
	}
})();

export const canUseCurrentDocument = (() => {
	switch (hostname) {
		case "www.zhenhunxiaoshuo.com":
			return (url: string): boolean => {
				const currentCommentPageElm = document.querySelector(
					".page-numbers.current",
				);
				if (!currentCommentPageElm) return url === window.location.href;
				const page = Number(currentCommentPageElm.textContent?.trim());
				return (Number.isFinite(page) ? page : 1) === 1;
			};
		default:
			return (url: string): boolean => url === window.location.href;
	}
})();
