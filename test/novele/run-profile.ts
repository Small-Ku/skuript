import { storage } from "../../src/novele/core/storage";
import rawProfiles from "./profiles.json";

export interface ChapterTestProfile {
	index: number;
	linkIndex: number;
	title?: string;
	urlContains?: string;
	minTextLines?: number;
}

export interface ExtractTestProfile {
	name: string;
	url: string;
	linkCount: number;
	chapterCount: number;
	chapters: ChapterTestProfile[];
}

const profileIndex = Number(process.argv[process.argv.length - 1]);
if (!Number.isFinite(profileIndex)) {
	console.error("Invalid profile index argument");
	process.exit(1);
}

const profile = (rawProfiles as ExtractTestProfile[])[profileIndex];
if (!profile) {
	console.error(`Profile not found for index ${profileIndex}`);
	process.exit(1);
}

// Set window.location.href to the target host/URL before importing modules
globalThis.window.location.href = profile.url;

// Import modules dynamically to ensure timing is correct
const { resolveLinks } = await import("../../src/novele/core/extract/links");
const { getPage, registerPageRaw } = await import(
	"../../src/novele/core/extract/pages"
);
const { getOrDownloadTestData } = await import("../test-helper");

async function run() {
	console.log(`Running profile: ${profile.name}`);

	// 1. Test catalog links
	const catalogHtml = await getOrDownloadTestData(profile.url);
	const parser = new DOMParser();
	const catalogDoc = parser.parseFromString(catalogHtml, "text/html");

	const links = await resolveLinks(catalogDoc);
	if (links.length !== profile.linkCount) {
		throw new Error(
			`Link count mismatch. Expected: ${profile.linkCount}, Got: ${links.length}`,
		);
	}

	for (const expectedChapter of profile.chapters) {
		// Clear page cache for clean resolution
		await storage.pageCache.clear();

		const link = links[expectedChapter.linkIndex];
		if (!link) {
			throw new Error(
				`Link not found at linkIndex ${expectedChapter.linkIndex}`,
			);
		}

		// Load start page
		const chapterUrl = link.url;
		const html = await getOrDownloadTestData(chapterUrl);
		registerPageRaw(chapterUrl, html);
		await getPage(chapterUrl);

		// Optionally load next page to bound the chapter
		if (expectedChapter.linkIndex + 1 < links.length) {
			const nextUrl = links[expectedChapter.linkIndex + 1].url;
			const nextHtml = await getOrDownloadTestData(nextUrl);
			registerPageRaw(nextUrl, nextHtml);
			await getPage(nextUrl);
		}

		// 2. Resolve chapter and verify
		const { resolvePageChapter } = await import(
			"../../src/novele/core/extract/chapters"
		);
		const resolvedChapter = await resolvePageChapter(
			chapterUrl,
			links.map((l) => l.url),
		);

		if (!resolvedChapter) {
			throw new Error(
				`Failed to resolve chapter for expected chapter index ${expectedChapter.index}`,
			);
		}

		// Verify chapterIndex
		if (resolvedChapter.chapterIndex !== expectedChapter.index) {
			throw new Error(
				`Chapter index mismatch for expected chapter ${expectedChapter.index}. Expected: ${expectedChapter.index}, Got: ${resolvedChapter.chapterIndex}`,
			);
		}

		// Verify title
		if (expectedChapter.title !== undefined) {
			if (!resolvedChapter.title?.includes(expectedChapter.title)) {
				throw new Error(
					`Title mismatch for chapter index ${expectedChapter.index}. Expected to contain: "${expectedChapter.title}", Got: "${resolvedChapter.title}"`,
				);
			}
		}

		// Verify urlContains
		if (expectedChapter.urlContains !== undefined) {
			if (!resolvedChapter.startUrl?.includes(expectedChapter.urlContains)) {
				throw new Error(
					`Start URL mismatch for chapter index ${expectedChapter.index}. Expected to contain: "${expectedChapter.urlContains}", Got: "${resolvedChapter.startUrl}"`,
				);
			}
		}

		// Verify minTextLines
		if (expectedChapter.minTextLines !== undefined) {
			const totalLines = resolvedChapter.textLines.length;
			if (totalLines < expectedChapter.minTextLines) {
				throw new Error(
					`Text lines count mismatch for chapter index ${expectedChapter.index}. Expected at least: ${expectedChapter.minTextLines}, Got: ${totalLines}`,
				);
			}
		}
	}

	console.log(`Profile ${profile.name} passed successfully!`);
}

run()
	.then(() => {
		process.exit(0);
	})
	.catch((err) => {
		console.error("Test failed with error:", err);
		process.exit(1);
	});
