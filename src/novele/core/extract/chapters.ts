import { peekPage } from "./pages";
import {
	type ChapterCandidate,
	type CommentPageRef,
	type PageSlice,
	type ResolvedChapter,
	type StoredPage,
	setPage,
} from "./storage";

export type ChapterResolution = ResolvedChapter & {
	nextBoundaryFound: boolean;
	candidates: Map<number, ChapterCandidate[]>;
};

type ParsedLinkPage = {
	url: string;
	linkIndex: number;
	page: StoredPage;
};

type LineRef = {
	linkIndex: number;
	sliceIndex: number;
	lineIndex: number;
	text: string;
};

type CandidateWithRef = ChapterCandidate & {
	linkIndex: number;
	sliceIndex: number;
};

type ChapterMarker = {
	chapterIndex: number;
	title: string;
	linkIndex: number;
	sliceIndex: number;
	lineIndex: number;
};

const numberRegex = "[\\d零一二三四五六七八九千百十万亿兆]";
const titleRegex = [
	`第\\s*(${numberRegex}+)\\s*章`,
	`^\\s*(${numberRegex}+)\\s*[.．、]\\s*\\S.*$`,
	`(${numberRegex}+)\\s*正文完`,
	`番外\\s*(${numberRegex}+)`,
	`\\{bookTitle\\}[\\p{Unified_Ideograph}\\s：]*(${numberRegex}+)`,
];
const regexSource = `[^\\p{Unified_Ideograph}\\n]*(?:${titleRegex.join("|")})[^<>']*`;
const chapterRegex = new RegExp(regexSource, "gu");

function normalizeText(text?: string) {
	return text?.replace(/\s+/g, "").trim() ?? "";
}

function compareCursor(
	a: Pick<LineRef, "linkIndex" | "sliceIndex" | "lineIndex">,
	b: Pick<LineRef, "linkIndex" | "sliceIndex" | "lineIndex">,
) {
	return (
		a.linkIndex - b.linkIndex ||
		a.sliceIndex - b.sliceIndex ||
		a.lineIndex - b.lineIndex
	);
}

function dedupeCommentPages(commentPages: CommentPageRef[]) {
	const seen = new Set<string>();
	return commentPages.filter((commentPage) => {
		if (seen.has(commentPage.url)) return false;
		seen.add(commentPage.url);
		return true;
	});
}

function stripDuplicatedHeading(content: string[], title?: string) {
	if (!content.length || !title) return content;
	return normalizeText(content[0]) === normalizeText(title)
		? content.slice(1)
		: content;
}

function matchChapterTitle(
	text: string[],
	standalone: boolean,
	source: "content" | "title",
) {
	const candidates = new Map<number, ChapterCandidate[]>();

	text.forEach((lineText, lineIndex) => {
		for (const match of lineText.matchAll(chapterRegex)) {
			const chapterFullText = match[0].trim();
			const chapterTextIndex = match
				.slice(1)
				.findIndex((item) => item !== undefined);
			const chapterText = match.slice(1).at(chapterTextIndex);
			if (!chapterText) continue;

			let chapterIndex =
				parseInt(chapterText, 10) || zhDigitToNumber(chapterText);
			if (chapterIndex < 0) continue;
			chapterIndex *= chapterTextIndex === 2 ? -1 : 1;

			const current = candidates.get(chapterIndex) ?? [];
			current.push({
				index: chapterIndex,
				title: chapterFullText,
				standalone,
				source,
				line: lineIndex,
			});
			candidates.set(chapterIndex, current);

			if (standalone || lineIndex === 0) continue;
			const previousIndex = chapterIndex - (chapterTextIndex === 2 ? -1 : 1);
			const previous = candidates.get(previousIndex) ?? [];
			previous.push({
				index: previousIndex,
				standalone,
				source,
				line: lineIndex,
			});
			candidates.set(previousIndex, previous);
		}
	});

	return candidates;
}

function mergeCandidateMaps(...maps: Map<number, ChapterCandidate[]>[]) {
	const merged = new Map<number, ChapterCandidate[]>();
	for (const map of maps) {
		for (const [index, candidates] of map) {
			const current = merged.get(index) ?? [];
			current.push(...candidates);
			merged.set(index, current);
		}
	}
	return merged;
}

function collectSliceCandidates(slice: PageSlice, sliceIndex: number) {
	const matches = mergeCandidateMaps(
		matchChapterTitle(slice.content, false, "content"),
		matchChapterTitle(slice.title, true, "title"),
	);
	const candidates = Array.from(matches.values()).flat();
	slice.chapterCandidates = candidates;

	const refs: CandidateWithRef[] = [];
	for (const candidatesForIndex of matches.values()) {
		for (const candidate of candidatesForIndex) {
			refs.push({
				...candidate,
				linkIndex: -1,
				sliceIndex,
			});
		}
	}
	return { matches, refs };
}

function getParsedLinkPages(orderedUrls: string[]): ParsedLinkPage[] {
	return orderedUrls.flatMap((url, linkIndex) => {
		const page = peekPage(url);
		return page?.slices?.length ? [{ url, linkIndex, page }] : [];
	});
}

function buildChapterIndex(parsedPages: ParsedLinkPage[]) {
	const markers: ChapterMarker[] = [];
	const candidatesByLink = new Map<number, Map<number, ChapterCandidate[]>>();

	for (const parsedPage of parsedPages) {
		const pageCandidates = new Map<number, ChapterCandidate[]>();
		parsedPage.page.slices?.forEach((slice, sliceIndex) => {
			const { matches, refs } = collectSliceCandidates(slice, sliceIndex);
			for (const [chapterIndex, candidates] of matches) {
				const current = pageCandidates.get(chapterIndex) ?? [];
				current.push(...candidates);
				pageCandidates.set(chapterIndex, current);
			}
			for (const candidate of refs) {
				if (!candidate.title) continue;
				markers.push({
					chapterIndex: candidate.index,
					title: candidate.title,
					linkIndex: parsedPage.linkIndex,
					sliceIndex: candidate.sliceIndex,
					lineIndex: candidate.line,
				});
			}
		});
		candidatesByLink.set(parsedPage.linkIndex, pageCandidates);
	}

	markers.sort(compareCursor);
	return { markers, candidatesByLink };
}

function flattenLines(parsedPages: ParsedLinkPage[]) {
	return parsedPages.flatMap(({ linkIndex, page }) =>
		(page.slices ?? []).flatMap((slice, sliceIndex) =>
			slice.content.map((text, lineIndex) => ({
				linkIndex,
				sliceIndex,
				lineIndex,
				text,
			})),
		),
	);
}

function getRangeCommentPages(
	parsedPages: ParsedLinkPage[],
	start: ChapterMarker,
	end: ChapterMarker | undefined,
) {
	return parsedPages.flatMap(({ linkIndex, page }) =>
		(page.slices ?? []).flatMap((slice, sliceIndex) => {
			if (
				linkIndex < start.linkIndex ||
				(linkIndex === start.linkIndex && sliceIndex < start.sliceIndex)
			) {
				return [];
			}
			if (
				end &&
				(linkIndex > end.linkIndex ||
					(linkIndex === end.linkIndex && sliceIndex >= end.sliceIndex))
			) {
				return [];
			}
			return slice.commentPages ?? [];
		}),
	);
}

function getLinkBoundedChapter(page: StoredPage): ResolvedChapter {
	const content = page.slices?.flatMap((slice) => slice.content) ?? [];
	const title =
		Array.from(page.title).find((item) => item.trim()) ??
		page.slices?.flatMap((slice) => slice.title).find((item) => item.trim());
	const commentPages = dedupeCommentPages(
		page.slices?.flatMap((slice) => slice.commentPages ?? []) ?? [],
	);
	return {
		title,
		content,
		startUrl: page.url,
		boundaryMode: "link-bounded",
		complete: true,
		commentPages,
	};
}

function getMarkerBoundedChapter(
	parsedPages: ParsedLinkPage[],
	start: ChapterMarker,
	end: ChapterMarker | undefined,
	allLinksLoaded: boolean,
): ResolvedChapter {
	const lines = flattenLines(parsedPages).filter(
		(line) =>
			compareCursor(line, start) >= 0 && (!end || compareCursor(line, end) < 0),
	);
	const commentPages = dedupeCommentPages(
		getRangeCommentPages(parsedPages, start, end),
	);
	return {
		title: start.title,
		content: stripDuplicatedHeading(
			lines.map((line) => line.text),
			start.title,
		),
		chapterIndex: start.chapterIndex,
		startUrl: parsedPages.find((page) => page.linkIndex === start.linkIndex)
			?.url,
		startLinkIndex: start.linkIndex,
		boundaryMode: "marker-bounded",
		complete: Boolean(end) || allLinksLoaded,
		commentPages,
	};
}

function getPrefaceChapter(
	parsedPages: ParsedLinkPage[],
	end: ChapterMarker | undefined,
	allLinksLoaded: boolean,
): ResolvedChapter {
	const lines = flattenLines(parsedPages).filter(
		(line) => !end || compareCursor(line, end) < 0,
	);
	const commentPages = dedupeCommentPages(
		parsedPages.flatMap(({ linkIndex, page }) => {
			return (
				page.slices?.flatMap((slice, sliceIndex) => {
					if (
						end &&
						(linkIndex > end.linkIndex ||
							(linkIndex === end.linkIndex && sliceIndex >= end.sliceIndex))
					) {
						return [];
					}
					return slice.commentPages ?? [];
				}) ?? []
			);
		}),
	);
	return {
		title: "前置內容",
		content: lines.map((line) => line.text),
		chapterIndex: 0,
		startUrl: parsedPages[0]?.url,
		startLinkIndex: 0,
		boundaryMode: "marker-bounded",
		complete: Boolean(end) || allLinksLoaded,
		commentPages,
	};
}

export function resolvePageChapter(
	url: string,
	orderedUrls: string[] = [url],
): ChapterResolution {
	const page = peekPage(url);
	if (!page?.slices?.length) {
		return {
			content: [],
			boundaryMode: "link-bounded",
			complete: false,
			nextBoundaryFound: false,
			commentPages: [],
			candidates: new Map(),
		};
	}

	const linkIndex = Math.max(0, orderedUrls.indexOf(url));
	const cached = page.resolvedChapter;
	if (
		cached?.complete &&
		(cached.boundaryMode === "marker-bounded" || orderedUrls.length <= 1)
	) {
		return {
			...cached,
			nextBoundaryFound: cached.boundaryMode === "marker-bounded",
			candidates: new Map(),
		};
	}

	const parsedPages = getParsedLinkPages(orderedUrls);
	const loadedLastLinkIndex = Math.max(
		...parsedPages.map((parsedPage) => parsedPage.linkIndex),
		linkIndex,
	);
	const allLinksLoaded = loadedLastLinkIndex >= orderedUrls.length - 1;
	const { markers, candidatesByLink } = buildChapterIndex(parsedPages);
	const candidates = candidatesByLink.get(linkIndex) ?? new Map();
	const previousMarkers = markers.filter(
		(marker) => marker.linkIndex <= linkIndex,
	);
	const owningMarker = previousMarkers.at(-1);
	const firstMarker = markers[0];

	let resolvedChapter: ResolvedChapter;
	let nextBoundaryFound = false;
	if (owningMarker) {
		const nextMarker = markers.find(
			(marker) => compareCursor(marker, owningMarker) > 0,
		);
		nextBoundaryFound = Boolean(nextMarker);
		resolvedChapter = getMarkerBoundedChapter(
			parsedPages,
			owningMarker,
			nextMarker,
			allLinksLoaded,
		);
		if (!resolvedChapter.content.length) {
			resolvedChapter = getLinkBoundedChapter(page);
			nextBoundaryFound = true;
		}
	} else if (linkIndex === 0 && orderedUrls.length > 1 && firstMarker) {
		nextBoundaryFound = true;
		resolvedChapter = getPrefaceChapter(
			parsedPages,
			firstMarker,
			allLinksLoaded,
		);
	} else {
		resolvedChapter = getLinkBoundedChapter(page);
		nextBoundaryFound = true;
	}

	resolvedChapter.startUrl ??= url;
	resolvedChapter.startLinkIndex ??= linkIndex;
	page.resolvedChapter = resolvedChapter;
	page.slices = [...page.slices];
	setPage(page);

	return {
		...resolvedChapter,
		nextBoundaryFound,
		candidates,
	};
}

function zhDigitToNumber(digit: string) {
	const zh = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
	const unit = ["千", "百", "十"];
	const quot = ["万", "亿", "兆"];
	let result = 0;

	if (!digit.split("").find((i) => zh.includes(i))) return -1;
	digit = digit.replace("萬", "万").replace("億", "亿");

	function getNumber(num: string) {
		return zh.indexOf(num);
	}

	function getUnit(num: string) {
		const index = unit.indexOf(num);
		return index !== -1 ? 10 ** (3 - index) : 1;
	}

	function getQuot(q: string) {
		const index = quot.indexOf(q);
		return index !== -1 ? 10 ** ((index + 1) * 4) : 1;
	}

	let lastNum = 1;
	let lastUnit = 1;

	for (let i = 0; i < digit.length; i++) {
		if (zh.includes(digit[i])) {
			lastNum = getNumber(digit[i]);
			if (i === digit.length - 1 || !unit.includes(digit[i + 1])) {
				result += lastNum * lastUnit;
			}
		} else if (unit.includes(digit[i])) {
			const currentUnit = getUnit(digit[i]);
			if (lastNum === 0 && i > 0) {
				lastNum = 1;
			}
			result += lastNum * currentUnit;
			lastNum = 0;
			lastUnit = 1;
		} else if (quot.includes(digit[i])) {
			const currentQuot = getQuot(digit[i]);
			result *= currentQuot;
			lastUnit = currentQuot / 10;
		}
	}

	return result;
}
