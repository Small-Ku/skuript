export type StoredPage = {
	url: string;
	lastModified: Date;
	title: Set<string>;
	content?: string[];
	additionalUrls?: string[];
	raw?: string;
	dom?: Document;
};

type SessionPage = {
	lastModified: string;
	title: string[];
	content?: string[];
	additionalUrls?: string[];
	raw?: string;
};

const pages = new Map<string, StoredPage>();

function toSessionPage(page: StoredPage): SessionPage {
	return {
		lastModified: page.lastModified.toISOString(),
		title: [...page.title],
		content: page.content,
		additionalUrls: page.additionalUrls,
		raw: page.raw,
	};
}

function fromSessionPage(url: string, page: SessionPage): StoredPage {
	return {
		url,
		lastModified: new Date(page.lastModified),
		title: new Set(page.title),
		content: page.content,
		additionalUrls: page.additionalUrls,
		raw: page.raw,
	};
}

function loadPage(url: string): StoredPage | undefined {
	const stored = sessionStorage.getItem(url);
	if (!stored) return;
	const page = fromSessionPage(url, JSON.parse(stored) as SessionPage);
	pages.set(url, page);
	return page;
}

export function getPage(url: string): StoredPage | undefined {
	return pages.get(url) ?? loadPage(url);
}

export function hasPage(url: string): boolean {
	return getPage(url) !== undefined;
}

export function setPage(page: StoredPage): StoredPage {
	pages.set(page.url, page);
	sessionStorage.setItem(page.url, JSON.stringify(toSessionPage(page)));
	return page;
}

export function deletePage(url: string): void {
	pages.delete(url);
	sessionStorage.removeItem(url);
}
