import { storage } from "../storage";
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
	candidateMap: Map<number, ChapterCandidate[]>;
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
	series: ChapterCandidate["series"];
	title: string;
	linkIndex: number;
	sliceIndex: number;
	lineIndex: number;
};

type CandidateScoreBin = {
	candidateRef: CandidateWithRef;
	score: number;
};

type ParsedPageState = {
	parsedPages: ParsedLinkPage[];
	parsedPageKey: string;
	loadedLastLinkIndex: number;
	allLinksLoaded: boolean;
	linkIndex: number;
};

const CLOSE_SEQUENCE_LINE_DISTANCE = 3;

const numberRegex = "[\\d零一二三四五六七八九千百十万亿兆]";
const numberedTitleRegex = new RegExp(
	`^\\s*(${numberRegex}+)\\s*[.．、]\\s*\\S.*$`,
	"u",
);
const chapterTitleRegex = new RegExp(`第\\s*(${numberRegex}+)\\s*章`, "u");
const endingTitleRegex = new RegExp(`(${numberRegex}+)\\s*正文完`, "u");
const extraTitleRegex = new RegExp(`^\\s*番外\\s*(${numberRegex}+)`, "u");
const bookTitleRegex = new RegExp(
	`\\{bookTitle\\}[\\p{Unified_Ideograph}\\s：]*(${numberRegex}+)`,
	"u",
);
function normalizeText(text?: string) {
	return text?.replace(/\s+/g, "").trim() ?? "";
}

function parseChapterNumber(chapterText: string) {
	const arabic = parseInt(chapterText, 10);
	if (arabic > 0) return arabic;
	return zhDigitToNumber(chapterText);
}

function getCandidateIdentity(
	candidate: Pick<ChapterCandidate, "series" | "index">,
) {
	return `${candidate.series}:${candidate.index}`;
}

function getChapterTitleMatches(lineText: string) {
	const text = lineText.trim();
	const checks = [
		{
			regex: numberedTitleRegex,
			titlePattern: "numbered" as const,
			series: "main" as const,
		},
		{
			regex: chapterTitleRegex,
			titlePattern: "chapter" as const,
			series: "main" as const,
		},
		{
			regex: endingTitleRegex,
			titlePattern: "ending" as const,
			series: "main" as const,
		},
		{
			regex: extraTitleRegex,
			titlePattern: "extra" as const,
			series: "extra" as const,
		},
		{
			regex: bookTitleRegex,
			titlePattern: "book-title" as const,
			series: "main" as const,
		},
	];

	for (const { regex, titlePattern, series } of checks) {
		const match = text.match(regex);
		const chapterText = match?.[1];
		if (!chapterText) continue;
		const chapterIndex = parseChapterNumber(chapterText);
		if (chapterIndex < 0) continue;
		return [
			{
				chapterIndex,
				series,
				title: match[0].trim(),
				titlePattern,
			},
		];
	}

	return [];
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

function compareCandidateCursor(
	a: Pick<CandidateWithRef, "linkIndex" | "sliceIndex" | "line">,
	b: Pick<CandidateWithRef, "linkIndex" | "sliceIndex" | "line">,
) {
	return (
		a.linkIndex - b.linkIndex || a.sliceIndex - b.sliceIndex || a.line - b.line
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
	isStandalone: boolean,
	origin: "content" | "title",
) {
	const candidateMap = new Map<number, ChapterCandidate[]>();

	text.forEach((lineText, lineIndex) => {
		for (const match of getChapterTitleMatches(lineText)) {
			const chapterFullText = match.title;
			const chapterIndex = match.chapterIndex;
			const current = candidateMap.get(chapterIndex) ?? [];
			current.push({
				index: chapterIndex,
				series: match.series,
				title: chapterFullText,
				isStandalone,
				chapterSource: origin,
				line: lineIndex,
				matchPattern: match.titlePattern,
			});
			candidateMap.set(chapterIndex, current);

			if (isStandalone || lineIndex === 0) continue;
			const previousIndex = chapterIndex - 1;
			const previous = candidateMap.get(previousIndex) ?? [];
			previous.push({
				index: previousIndex,
				series: match.series,
				isStandalone,
				chapterSource: origin,
				line: lineIndex,
				matchPattern: match.titlePattern,
			});
			candidateMap.set(previousIndex, previous);
		}
	});

	return candidateMap;
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
	const candidateGroups = mergeCandidateMaps(
		matchChapterTitle(slice.textLines, false, "content"),
		matchChapterTitle(slice.title, true, "title"),
	);
	const candidateList = Array.from(candidateGroups.values()).flat();
	slice.chapterCandidates = candidateList;

	const refs: CandidateWithRef[] = [];
	for (const candidatesForIndex of candidateGroups.values()) {
		for (const candidate of candidatesForIndex) {
			refs.push({
				...candidate,
				linkIndex: -1,
				sliceIndex,
			});
		}
	}
	return { candidateGroups, refs };
}

function getParsedLinkPages(orderedUrls: string[]): ParsedLinkPage[] {
	return orderedUrls.flatMap((url, linkIndex) => {
		const page = peekPage(url);
		return page?.slices?.length ? [{ url, linkIndex, page }] : [];
	});
}

function getParsedPageState(
	url: string,
	orderedUrls: string[],
): ParsedPageState {
	const linkIndex = Math.max(0, orderedUrls.indexOf(url));
	const parsedPages = getParsedLinkPages(orderedUrls);
	const parsedPageKey = parsedPages
		.map(
			(parsedPage) =>
				`${parsedPage.linkIndex}:${parsedPage.page.lastChanged.getTime()}`,
		)
		.join(",");
	const loadedLastLinkIndex = Math.max(
		...parsedPages.map((parsedPage) => parsedPage.linkIndex),
		linkIndex,
	);
	return {
		parsedPages,
		parsedPageKey,
		loadedLastLinkIndex,
		allLinksLoaded: loadedLastLinkIndex >= orderedUrls.length - 1,
		linkIndex,
	};
}

function buildChapterIndex(parsedPages: ParsedLinkPage[]) {
	const markers: ChapterMarker[] = [];
	const candidatesByLink = new Map<number, Map<number, ChapterCandidate[]>>();
	const markerCandidates: CandidateWithRef[] = [];

	for (const parsedPage of parsedPages) {
		const pageCandidates = new Map<number, ChapterCandidate[]>();
		parsedPage.page.slices?.forEach((slice, sliceIndex) => {
			const { candidateGroups, refs } = collectSliceCandidates(
				slice,
				sliceIndex,
			);
			for (const [chapterIndex, candidates] of candidateGroups) {
				const current = pageCandidates.get(chapterIndex) ?? [];
				current.push(...candidates);
				pageCandidates.set(chapterIndex, current);
			}
			markerCandidates.push(
				...refs
					.filter((candidate) => candidate.title)
					.map((candidate) => ({
						...candidate,
						linkIndex: parsedPage.linkIndex,
					})),
			);
		});
		candidatesByLink.set(parsedPage.linkIndex, pageCandidates);
	}

	markers.push(...selectChapterMarkers(markerCandidates));
	markers.sort(compareCursor);
	return { markers, candidatesByLink };
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
	const counts = new Map<string, number>();
	for (const item of items) {
		const key = getKey(item);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

function findPreviousCandidate(
	candidates: CandidateWithRef[],
	candidate: CandidateWithRef,
) {
	return candidates
		.filter((item) => compareCandidateCursor(item, candidate) < 0)
		.at(-1);
}

function findNextCandidate(
	candidates: CandidateWithRef[],
	candidate: CandidateWithRef,
) {
	return candidates.find((item) => compareCandidateCursor(item, candidate) > 0);
}

function updateScoreForNeighbor(
	bin: CandidateScoreBin,
	neighbor: CandidateWithRef | undefined,
	direction: "previous" | "next",
) {
	if (!neighbor) return;
	if (bin.candidateRef.series !== neighbor.series) return;

	const delta = bin.candidateRef.index - neighbor.index;
	if (
		(direction === "previous" && delta <= 0) ||
		(direction === "next" && delta >= 0)
	) {
		bin.score -= 120;
		return;
	}
	if (Math.abs(delta) === 1) {
		if (isCloseSequentialCandidate(bin.candidateRef, neighbor)) {
			bin.score -= 70;
			return;
		}
		bin.score += 30;
	}
}

function createPatternScoreBins(candidates: CandidateWithRef[]) {
	const sorted = [...candidates].sort(compareCandidateCursor);
	const patternCounts = countBy(
		sorted,
		(candidate) => candidate.matchPattern ?? "",
	);
	const patternScores = new Map<string, number>();

	for (const [pattern, count] of patternCounts) {
		patternScores.set(pattern, 50 + count * 4);
	}

	for (const candidate of sorted) {
		const pattern = candidate.matchPattern ?? "";
		const currentScore = patternScores.get(pattern) ?? 50;
		const previous = findPreviousCandidate(
			sorted.filter((item) => item.matchPattern === candidate.matchPattern),
			candidate,
		);
		const next = findNextCandidate(
			sorted.filter((item) => item.matchPattern === candidate.matchPattern),
			candidate,
		);
		const penalty =
			(previous && isCloseSequentialCandidate(candidate, previous) ? 35 : 0) +
			(next && isCloseSequentialCandidate(candidate, next) ? 35 : 0);
		patternScores.set(pattern, currentScore - penalty);
	}

	return patternScores;
}

function createCandidateScoreBins(candidates: CandidateWithRef[]) {
	const sorted = [...candidates].sort(compareCandidateCursor);
	const patternScores = createPatternScoreBins(sorted);
	const strongestPattern = Array.from(patternScores.entries()).sort(
		([, a], [, b]) => b - a,
	)[0]?.[0];
	const titleAnchors = sorted.filter(
		(candidate) =>
			candidate.chapterSource === "title" && candidate.isStandalone,
	);
	const patternAnchors = strongestPattern
		? sorted.filter((candidate) => candidate.matchPattern === strongestPattern)
		: [];
	const anchors =
		patternAnchors.length > 0
			? patternAnchors
			: titleAnchors.length
				? titleAnchors
				: sorted;

	return sorted.map((candidate) => {
		const bin: CandidateScoreBin = {
			candidateRef: candidate,
			score: patternScores.get(candidate.matchPattern ?? "") ?? 50,
		};
		const previousAnchor = findPreviousCandidate(anchors, candidate);
		const nextAnchor = findNextCandidate(anchors, candidate);

		updateScoreForNeighbor(bin, previousAnchor, "previous");
		updateScoreForNeighbor(bin, nextAnchor, "next");
		if (
			previousAnchor &&
			nextAnchor &&
			candidate.series === previousAnchor.series &&
			candidate.series === nextAnchor.series &&
			candidate.index > previousAnchor.index &&
			candidate.index < nextAnchor.index
		) {
			bin.score += 50;
		}

		return bin;
	});
}

function compareCandidateScoreBins(a: CandidateScoreBin, b: CandidateScoreBin) {
	return (
		b.score - a.score ||
		compareCandidateCursor(a.candidateRef, b.candidateRef) ||
		(a.candidateRef.chapterSource === b.candidateRef.chapterSource
			? 0
			: a.candidateRef.chapterSource === "title"
				? -1
				: 1)
	);
}

function lineDistance(a: CandidateWithRef, b: CandidateWithRef) {
	if (a.linkIndex !== b.linkIndex || a.sliceIndex !== b.sliceIndex)
		return Number.POSITIVE_INFINITY;
	return Math.abs(a.line - b.line);
}

function isCloseSequentialCandidate(a: CandidateWithRef, b: CandidateWithRef) {
	return (
		a.series === b.series &&
		a.matchPattern === b.matchPattern &&
		Math.abs(a.index - b.index) === 1 &&
		lineDistance(a, b) <= CLOSE_SEQUENCE_LINE_DISTANCE
	);
}

function selectChapterMarkers(candidates: CandidateWithRef[]) {
	const binsByIndex = new Map<string, CandidateScoreBin[]>();
	for (const bin of createCandidateScoreBins(candidates)) {
		const key = getCandidateIdentity(bin.candidateRef);
		const bins = binsByIndex.get(key) ?? [];
		bins.push(bin);
		binsByIndex.set(key, bins);
	}

	return Array.from(binsByIndex.values()).flatMap((bins) => {
		const bin = bins.sort(compareCandidateScoreBins)[0];
		if (!bin || bin.score < 50) return [];
		const { candidateRef } = bin;
		return [
			{
				chapterIndex: candidateRef.index,
				series: candidateRef.series,
				title: candidateRef.title ?? "",
				linkIndex: candidateRef.linkIndex,
				sliceIndex: candidateRef.sliceIndex,
				lineIndex: candidateRef.line,
			},
		];
	});
}

function getOwningMarker(markers: ChapterMarker[], linkIndex: number) {
	const currentPageMarker = markers.find(
		(marker) => marker.linkIndex === linkIndex,
	);
	if (currentPageMarker) return currentPageMarker;
	return markers.filter((marker) => marker.linkIndex < linkIndex).at(-1);
}

function flattenLines(parsedPages: ParsedLinkPage[]) {
	return parsedPages.flatMap(({ linkIndex, page }) =>
		(page.slices ?? []).flatMap((slice, sliceIndex) =>
			slice.textLines.map((text, lineIndex) => ({
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
	const textLines = page.slices?.flatMap((slice) => slice.textLines) ?? [];
	const title =
		Array.from(page.title).find((item) => item.trim()) ??
		page.slices?.flatMap((slice) => slice.title).find((item) => item.trim());
	const commentPages = dedupeCommentPages(
		page.slices?.flatMap((slice) => slice.commentPages ?? []) ?? [],
	);
	return {
		title,
		textLines,
		startUrl: page.url,
		boundaryMode: "link-bounded",
		isComplete: true,
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
		textLines: stripDuplicatedHeading(
			lines.map((line) => line.text),
			start.title,
		),
		chapterIndex: start.chapterIndex,
		startUrl: parsedPages.find((page) => page.linkIndex === start.linkIndex)
			?.url,
		startLinkIndex: start.linkIndex,
		boundaryMode: "marker-bounded",
		isComplete: Boolean(end) || allLinksLoaded,
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
		textLines: lines.map((line) => line.text),
		chapterIndex: 0,
		startUrl: parsedPages[0]?.url,
		startLinkIndex: 0,
		boundaryMode: "marker-bounded",
		isComplete: Boolean(end) || allLinksLoaded,
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
			textLines: [],
			boundaryMode: "link-bounded",
			isComplete: false,
			nextBoundaryFound: false,
			commentPages: [],
			candidateMap: new Map(),
		};
	}

	const {
		linkIndex,
		parsedPages,
		parsedPageKey,
		loadedLastLinkIndex,
		allLinksLoaded,
	} = getParsedPageState(url, orderedUrls);
	const cached = page.resolvedChapter;
	if (
		cached?.isComplete &&
		cached.resolvedPageKey === parsedPageKey &&
		cached.resolvedThroughLinkIndex === loadedLastLinkIndex &&
		(cached.boundaryMode === "marker-bounded" || orderedUrls.length <= 1)
	) {
		return {
			...cached,
			nextBoundaryFound: cached.boundaryMode === "marker-bounded",
			candidateMap: new Map(),
		};
	}

	const { markers, candidatesByLink } = buildChapterIndex(parsedPages);
	const candidateMap = candidatesByLink.get(linkIndex) ?? new Map();
	const owningMarker = getOwningMarker(markers, linkIndex);
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
		if (!resolvedChapter.textLines.length) {
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
	resolvedChapter.resolvedPageKey = parsedPageKey;
	resolvedChapter.resolvedThroughLinkIndex = loadedLastLinkIndex;
	page.resolvedChapter = resolvedChapter;
	page.slices = [...page.slices];
	setPage(page);
	void storage.chapterCache.put(url, {
		schemaVersion: 1,
		title: resolvedChapter.title,
		textLines: resolvedChapter.textLines,
		chapterIndex: resolvedChapter.chapterIndex,
		startUrl: resolvedChapter.startUrl,
		startLinkIndex: resolvedChapter.startLinkIndex,
		boundaryMode: resolvedChapter.boundaryMode,
		isComplete: resolvedChapter.isComplete,
		commentPages: resolvedChapter.commentPages,
		resolvedPageKey: resolvedChapter.resolvedPageKey,
		resolvedThroughLinkIndex: resolvedChapter.resolvedThroughLinkIndex,
		lastAccess: Date.now(),
		updatedAt: Date.now(),
	});

	return {
		...resolvedChapter,
		nextBoundaryFound,
		candidateMap,
	};
}

export async function hydrateResolvedChapter(
	url: string,
	orderedUrls: string[] = [url],
): Promise<ResolvedChapter | undefined> {
	const page = peekPage(url);
	if (!page?.slices?.length) return;
	if (page.resolvedChapter?.textLines.length) return page.resolvedChapter;
	const cached = await storage.chapterCache.get(url);
	if (!cached || cached.schemaVersion !== 1) return;
	const { parsedPageKey, loadedLastLinkIndex } = getParsedPageState(
		url,
		orderedUrls,
	);
	if (
		cached.resolvedPageKey !== parsedPageKey ||
		cached.resolvedThroughLinkIndex !== loadedLastLinkIndex
	) {
		return;
	}
	page.resolvedChapter = {
		title: cached.title,
		textLines: cached.textLines,
		chapterIndex: cached.chapterIndex,
		startUrl: cached.startUrl,
		startLinkIndex: cached.startLinkIndex,
		boundaryMode: cached.boundaryMode,
		isComplete: cached.isComplete,
		commentPages: cached.commentPages,
		resolvedPageKey: cached.resolvedPageKey,
		resolvedThroughLinkIndex: cached.resolvedThroughLinkIndex,
	};
	setPage(page);
	return page.resolvedChapter;
}

function zhDigitToNumber(digit: string) {
	const zh = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
	const unit = ["千", "百", "十"];
	const quot = ["万", "亿", "兆"];
	let result = 0;

	if (!digit.split("").find((i) => zh.includes(i) || unit.includes(i)))
		return -1;
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
