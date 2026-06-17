import { hostname } from "./hostname-map";
import type { CommentItem, CommentPageRef, CommentScope } from "./storage";

export type CommentPage = {
	ref: CommentPageRef;
	items: CommentItem[];
	postId?: string;
};

export type CommentBundle = {
	refs: CommentPageRef[];
	items: CommentItem[];
	postId?: string;
	supported: boolean;
};

const commentPages = new Map<string, CommentPage>();

function normalizeCommentBaseUrl(url: string): string {
	const baseUrl = new URL(url);
	baseUrl.hash = "";
	baseUrl.pathname = baseUrl.pathname.replace(/\/comment-page-\d+\/?$/, "");
	return baseUrl.href.replace(/\/$/, "");
}

function commentPageUrl(baseUrl: string, pageNumber: number) {
	return `${baseUrl}/comment-page-${pageNumber}/`;
}

function getCurrentCommentPageNumber(url: string) {
	return Number(new URL(url).pathname.match(/comment-page-(\d+)/)?.[1] ?? "") || 1;
}

function getCurrentCommentPageNumberFromDoc(doc: Document) {
	const currentText = doc
		.querySelector(".page-numbers.current")
		?.textContent?.trim();
	return Number(currentText ?? "") || 1;
}

function getCommentPostId(doc: Document): string | undefined {
	const likeId = doc.querySelector<HTMLElement>("#action-like[data-id]")?.dataset
		.id;
	if (likeId) return likeId;
	return doc.querySelector<HTMLInputElement>("input[name='comment_post_ID']")
		?.value;
}

export function getCommentPageRefs(
	doc: Document,
	url: string,
	scope: CommentScope,
): CommentPageRef[] {
	switch (hostname) {
		case "www.zhenhunxiaoshuo.com": {
			const hasComments =
				Boolean(doc.querySelector("#postcomments")) ||
				Boolean(doc.querySelector("#respond")) ||
				Boolean(getCommentPostId(doc));
			if (!hasComments) return [];

			const baseUrl = normalizeCommentBaseUrl(url);
			const currentPage = Math.max(
				getCurrentCommentPageNumber(url),
				getCurrentCommentPageNumberFromDoc(doc),
			);
			const linkedPages = Array.from(
				doc.querySelectorAll<HTMLAnchorElement>(
					'a.page-numbers[href*="comment-page-"]',
				),
			).flatMap((link) => {
				const pageNumber = Number(
					link.href.match(/comment-page-(\d+)/)?.[1] ?? "",
				);
				return Number.isFinite(pageNumber) && pageNumber > 0
					? [pageNumber]
					: [];
			});
			const maxPage = Math.max(1, currentPage, ...linkedPages);
			return Array.from({ length: maxPage }, (_, index) => {
				const pageNumber = index + 1;
				return {
					url: commentPageUrl(baseUrl, pageNumber),
					scope,
					pageNumber,
					ownerUrl: baseUrl,
				};
			});
		}
		default:
			return [];
	}
}

function extractTextLines(root: Element): string[] {
	const textRoot = root.cloneNode(true) as Element;
	textRoot.querySelectorAll(".comt-meta, .reply, script, style").forEach((item) => {
		item.remove();
	});
	const paragraphs = Array.from(textRoot.querySelectorAll("p")).flatMap((item) => {
		const text = item.textContent?.trim();
		return text ? text.split(/\r?\n/).map((line) => line.trim()) : [];
	});
	if (paragraphs.length) return paragraphs.filter(Boolean);
	const text = textRoot.textContent?.trim();
	return text ? [text] : [];
}

function parseZhenhunComments(doc: Document, ref: CommentPageRef): CommentPage {
	const items = Array.from(
		doc.querySelectorAll<HTMLElement>("#postcomments > .commentlist .comment"),
	).flatMap((item): CommentItem[] => {
		const main = item.querySelector(".comt-main");
		if (!main) return [];
		const meta = item.querySelector(".comt-meta");
		const author =
			meta?.querySelector(".comt-author")?.textContent?.trim() ?? "匿名";
		const time =
			Array.from(meta?.childNodes ?? [])
				.find(
					(node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
				)
				?.textContent?.trim() ?? "";
		const parentId = item.parentElement?.classList.contains("children")
			? item.parentElement.previousElementSibling?.id
			: undefined;
		return [
			{
				id: item.id || main.id,
				author,
				text: extractTextLines(main),
				time,
				parentId,
				pageNumber: ref.pageNumber,
				sourceUrl: ref.url,
			},
		];
	});
	return {
		ref,
		items,
		postId: getCommentPostId(doc),
	};
}

export function parseCommentPage(doc: Document, ref: CommentPageRef): CommentPage {
	let page: CommentPage;
	switch (hostname) {
		case "www.zhenhunxiaoshuo.com":
			page = parseZhenhunComments(doc, ref);
			break;
		default:
			page = { ref, items: [] };
	}
	commentPages.set(ref.url, page);
	return page;
}

export function getCachedCommentBundle(refs: CommentPageRef[]): CommentBundle {
	const pages = refs.flatMap((ref) => {
		const page = commentPages.get(ref.url);
		return page ? [page] : [];
	});
	return {
		refs,
		items: pages.flatMap((page) => page.items),
		postId: pages.find((page) => page.postId)?.postId,
		supported: refs.length > 0,
	};
}
