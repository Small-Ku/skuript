import { getPage, type Page } from "./pages";

type ChapterData = {
	title?: string;
	pages: string[];
	candidates: Map<string, ChapterCandidate[]>;
};
type ChapterCandidate = {
	title?: string;
	standalone: boolean;
};
const numberRegex = "[\\d零一二三四五六七八九千百十万亿兆]";
const titleRegex = [
	`第\\s*(${numberRegex}+)\\s*章`,
	`(${numberRegex}+)\\s*正文完`,
	`番外\\s*(${numberRegex}+)`,
	`\\{bookTitle\\}[\\p{Unified_Ideograph}\\s：]*(${numberRegex}+)`, //巨星的小神厨
];
const regexSource = `[^\\p{Unified_Ideograph}\\n]*(?:${titleRegex.join("|")})[^<>']*`;
const chapterRegex = new RegExp(regexSource, "gu");

const chapters: Map<number, ChapterData> = new Map();

export function getChapter(index: number): ChapterData {
	if (!chapters.has(index)) throw new Error(`Chapter ${index} not found`);
	const chapter = chapters.get(index);
	// biome-ignore lint/style/noNonNullAssertion: checked above
	return chapter!;
}

export function listChapters(): number[] {
	return Array.from(
		chapters
			.entries()
			.flatMap(([index, chapter]) => (chapter.pages.length > 0 ? [index] : [])),
	).sort((a, b) => a - b);
}

export async function parsePageChapter(url: string) {
	const page = await getPage(url);
	if (!page) throw new Error("Page not found");
	let _candidates: Map<number, ChapterCandidate[]> = new Map();
	if (page.content)
		_candidates = new Map([
			..._candidates,
			...matchChapterTitle(page.content, false),
		]);
	if (page.title)
		_candidates = new Map([
			..._candidates,
			...matchChapterTitle([...page.title], true),
		]);
	_candidates.keys().forEach((index) => {
		if (!chapters.has(index)) {
			chapters.set(index, {
				pages: [],
				candidates: new Map(),
			});
		}
		// biome-ignore lint/style/noNonNullAssertion: checked above
		const _chapter = chapters.get(index)!;
		// biome-ignore lint/style/noNonNullAssertion: checked above
		_chapter.candidates.set(url, _candidates.get(index)!);

		// TODO: handle multiple candidates and deal with merging chapters
		// biome-ignore lint/style/noNonNullAssertion: checked above
		const chapter = chapters.get(index)!;
		if (!chapter.pages || chapter.pages.length === 0)
			chapter.pages = [[...chapter.candidates.entries()][0][0]];
	});
	return _candidates;
}

function matchChapterTitle(text: string[], standalone: boolean) {
	const _candidates: Map<number, ChapterCandidate[]> = new Map();
	const allMatches = text.map((t, line) => t.matchAll(chapterRegex));

	allMatches.forEach((matches, i) => {
		matches.forEach((match) => {
			const chapterFullText = match[0];
			const chapterTextIndex = match
				.slice(1)
				.findIndex((text) => text !== undefined);
			// biome-ignore lint/style/noNonNullAssertion: checked above
			const chapterText = match.slice(1).at(chapterTextIndex)!;
			let chapterIndex =
				parseInt(chapterText, 10) || zhDigitToNumber(chapterText);
			if (chapterIndex < 0) return;
			chapterIndex *= chapterTextIndex === 2 ? -1 : 1;
			if (!_candidates.has(chapterIndex)) {
				_candidates.set(chapterIndex, []);
			}
			// biome-ignore lint/style/noNonNullAssertion: checked above
			const currCandidate = _candidates.get(chapterIndex)!;
			currCandidate.push({
				title: chapterFullText,
				standalone,
			});
			if (standalone || i === 0) return;
			chapterIndex -= chapterTextIndex === 2 ? -1 : 1;
			if (!_candidates.has(chapterIndex)) {
				_candidates.set(chapterIndex, []);
			}
			// biome-ignore lint/style/noNonNullAssertion: checked above
			const prevCandidate = _candidates.get(chapterIndex)!;
			prevCandidate.push({
				standalone,
			});
		});
	});
	return _candidates;
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
