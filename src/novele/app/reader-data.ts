import van from "vanjs-core";
import { nav } from "../core/nav";
import { type Link, resolveLinks, subscribeLinks } from "../core/extract/links";
import { findPage } from "../core/extract/pages";
import { queueChapterFetch } from "../core/queue";

type ChapterFetchState = {
	loading: boolean;
	error?: string;
};

function getPageTitle(link: Link): string {
	try {
		const page = findPage(link.url);
		const title = Array.from(page.title ?? []).find((item) => item.trim());
		return title ?? link.title ?? `Chapter ${nav.index.val + 1}`;
	} catch {
		return link.title ?? `Chapter ${nav.index.val + 1}`;
	}
}

export function createReaderData() {
	const links = van.state<Link[]>([]);
	const fetchStates = van.state<Map<string, ChapterFetchState>>(new Map());
	const queuedLinks = new Set<string>();
	const globalError = van.state<string | null>(null);

	const updateFetchState = (url: string, state: ChapterFetchState) => {
		const next = new Map(fetchStates.val);
		next.set(url, state);
		fetchStates.val = next;
	};

	const queueLink = (link: Link, index: number) => {
		if (queuedLinks.has(link.url)) return;
		queuedLinks.add(link.url);
		updateFetchState(link.url, { loading: true });
		queueChapterFetch(link, index)
			.then(() => updateFetchState(link.url, { loading: false }))
			.catch((error) => {
				const message = error instanceof Error ? error.message : `${error}`;
				updateFetchState(link.url, { loading: false, error: message });
			});
	};

	subscribeLinks((nextLinks) => {
		links.val = nextLinks;
		nav.min.val = 0;
		nav.max.val = Math.max(0, nextLinks.length - 1);
		if (nav.index.val > nav.max.val) {
			nav.index.val = nav.max.val;
		}
		nextLinks.forEach(queueLink);
	});

	void resolveLinks(document).catch((error) => {
		globalError.val = error instanceof Error ? error.message : `${error}`;
	});

	const currentLink = van.derive(() => links.val[nav.index.val] ?? null);
	const currentTitle = van.derive(() => {
		const link = currentLink.val;
		return link ? getPageTitle(link) : document.title || "Novelé";
	});
	const currentContent = van.derive(() => {
		const link = currentLink.val;
		if (!link) return [] as string[];
		try {
			return findPage(link.url).content ?? [];
		} catch {
			return [] as string[];
		}
	});
	const currentStatus = van.derive(() => {
		const link = currentLink.val;
		if (!link) return { loading: false, error: globalError.val };
		return fetchStates.val.get(link.url) ?? { loading: false };
	});

	const goTo = (index: number) => {
		if (!links.val.length) return;
		nav.index.val = Math.max(nav.min.val, Math.min(nav.max.val, index));
	};

	const previous = () => goTo(nav.index.val - 1);
	const next = () => goTo(nav.index.val + 1);

	return {
		links,
		currentLink,
		currentTitle,
		currentContent,
		currentStatus,
		globalError,
		goTo,
		previous,
		next,
	};
}
