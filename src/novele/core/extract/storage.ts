export type Page = {
	url: string;
	title?: string;
	lastModified: Date;
	content: Raw | Dom | Parsed;
};

type Raw = string;
type Dom = Document;
type Parsed = {
	title: Set<string>;
	content: string[];
	// comments
	// prev/next page url
};

const pages: Page[] = [];

export function set(idx: number, page: Page): void {
	pages[idx] = page;
	const {url: _, ...sessionPage} = page;
	sessionStorage.setItem(page.url, JSON.stringify(sessionPage));
}

export function get(idx: number): Page {
	return pages[idx];
}

export function findIndex(url: string): number {
	const idx = pages.findIndex((p) => p.url === url);
	if (idx === -1) throw new Error("Page not found");
	return idx;
}

export function find(url: string): Page {
	return pages[findIndex(url)];
}

export function insertBefore(url: string, page: Page): void {
	pages.splice(findIndex(url), 0, page);
}

export function insertAfter(url: string, page: Page): void {
	pages.splice(findIndex(url) + 1, 0, page);
}

export function setPage(page: Page): void {
	set(findIndex(page.url), page);
}

export function restore(idx: number, url: string): void {
    const stored = sessionStorage.getItem(url);
	if (!stored) throw new Error("No stored page");
	const sessionPage = JSON.parse(stored) as Omit<Page, "url">;
	pages[idx] = {url, ...sessionPage};
}