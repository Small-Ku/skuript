import van from "vanjs-core";
import {
	COMMENT_FRAME_BRIDGE_CALLBACK_NAME,
	type CommentFrameBridgeMessage,
	isCommentFrameBridgeMessage,
} from "../core/comment-frame-bridge";
import {
	CLOUDFLARE_CHALLENGE_MESSAGE,
	COMMENT_MISSING_AFTER_REDIRECT_MESSAGE,
	COMMENT_RATE_LIMIT_MESSAGE,
	resolveCommentPostResult,
	ZHENHUN_COMMENT_POST_URL,
} from "../core/extract/comments";
import type { CommentPageRef } from "../core/extract/storage";
import {
	drawerClass,
	drawerHeader,
	type ReaderData,
	type UiState,
} from "./overlay-shared";
import nameMap from "./styles/style.module.scss";

const { aside, div, form, iframe, input, p, span, textarea, button } = van.tags;

type WindowWithCommentFrameBridge = Window & {
	[COMMENT_FRAME_BRIDGE_CALLBACK_NAME]?: (
		message: CommentFrameBridgeMessage,
	) => void;
};

function commentStatusText(data: ReaderData) {
	const state = data.currentComments.val;
	if (state.isLoading && !state.items.length)
		return `Loading ${state.refs.length} comment page(s)...`;
	if (!state.commentingAvailable)
		return "No site comment section was found for this page.";
	if (!state.items.length) return "No comments yet.";
	return "";
}

function commentHeaderTail(data: ReaderData) {
	return span(
		{ class: nameMap.commentTicker },
		() => `(${data.currentComments.val.items.length})`,
	);
}

export function CommentsPanel(
	ui: UiState,
	data: ReaderData,
	onInteraction: () => void,
	close: () => void,
) {
	const commentFrameName = "novele-comment-post-target";
	const commentPostTimeoutMs = 15000;
	const commentChallengeFrame = iframe({
		class: () =>
			[
				nameMap.commentChallengeFrame,
				data.currentComments.val.needsCloudflareVerification
					? ""
					: nameMap.commentChallengeFrameHidden,
			]
				.filter(Boolean)
				.join(" "),
		title: "Cloudflare verification",
		name: commentFrameName,
	}) as HTMLIFrameElement;
	const commentsRoot = div({
		class: nameMap.commentsList,
		onscroll: onInteraction,
	});
	let pendingCommentRefs: CommentPageRef[] | null = null;
	let commentPostTimeoutId: number | null = null;
	let pendingScrollCommentId: string | null = null;
	const authorInputElement = input({
		class: nameMap.textInput,
		type: "text",
		name: "author",
		placeholder: "Nickname",
		value: () => ui.commentAuthor.val,
		oninput: (event: Event) => {
			ui.commentAuthor.val = (event.target as HTMLInputElement).value;
		},
		disabled: () =>
			data.currentComments.val.isLoading ||
			data.currentComments.val.posting ||
			!data.currentComments.val.postId,
	}) as HTMLInputElement;
	const commentInputElement = textarea({
		class: nameMap.textInput,
		name: "comment",
		placeholder: "Add a comment...",
		value: () => ui.commentDraft.val,
		oninput: (event: Event) => {
			ui.commentDraft.val = (event.target as HTMLTextAreaElement).value;
		},
		disabled: () =>
			data.currentComments.val.isLoading ||
			data.currentComments.val.posting ||
			!data.currentComments.val.postId,
	}) as HTMLTextAreaElement;

	const clearCommentPostTimeout = () => {
		if (commentPostTimeoutId === null) return;
		window.clearTimeout(commentPostTimeoutId);
		commentPostTimeoutId = null;
	};

	const resetCommentFrame = () => {
		commentChallengeFrame.src = "about:blank";
	};

	const finalizeCommentPost = () => {
		pendingCommentRefs = null;
		clearCommentPostTimeout();
	};

	const handleCommentSubmissionFailure = (error: unknown) => {
		const message = error instanceof Error ? error.message : `${error}`;
		if (message === CLOUDFLARE_CHALLENGE_MESSAGE) {
			clearCommentPostTimeout();
			data.failCurrentCommentSubmission(error);
			console.info(
				"[novele] comment submission waiting for Cloudflare verification",
			);
			return;
		}

		finalizeCommentPost();
		data.failCurrentCommentSubmission(error);
		resetCommentFrame();
		if (message === COMMENT_MISSING_AFTER_REDIRECT_MESSAGE) {
			console.warn("[novele] redirected comment missing from returned page");
		}
		if (message === COMMENT_RATE_LIMIT_MESSAGE) {
			console.warn("[novele] comment request hit HTTP 429");
		}
	};

	const getCommentFrameResponseStatus = (): number | undefined => {
		try {
			const navigationEntry = commentChallengeFrame.contentWindow?.performance
				.getEntriesByType("navigation")
				.at(0) as PerformanceNavigationTiming | undefined;
			const status = navigationEntry?.responseStatus;
			return typeof status === "number" && status > 0 ? status : undefined;
		} catch (error) {
			console.debug(
				"[novele] comment iframe responseStatus unavailable",
				error,
			);
			return undefined;
		}
	};

	const handleCommentFrameResult = (
		source: "load" | "message",
		message?: CommentFrameBridgeMessage,
	) => {
		if (!pendingCommentRefs) return;
		const responseStatus = getCommentFrameResponseStatus();
		console.debug(`[novele] comment iframe ${source}`, {
			bridgeCloudflare: message?.isCloudflareChallenge,
			bridgeHref: message?.href,
			url: commentChallengeFrame.contentWindow?.location.href,
			responseStatus,
		});
		try {
			const doc = commentChallengeFrame.contentDocument;
			const finalUrl = commentChallengeFrame.contentWindow?.location.href;
			if (!doc || !finalUrl) return;
			const bundle = resolveCommentPostResult(
				pendingCommentRefs,
				doc,
				finalUrl,
				responseStatus,
			);
			finalizeCommentPost();
			data.completeCurrentCommentSubmission(bundle);
			pendingScrollCommentId = bundle.commentId ?? null;
			ui.commentDraft.val = "";
			resetCommentFrame();
		} catch (error) {
			handleCommentSubmissionFailure(error);
			console.debug(`[novele] comment iframe ${source} failed`, error);
		}
	};

	(window as WindowWithCommentFrameBridge)[COMMENT_FRAME_BRIDGE_CALLBACK_NAME] =
		(message) => {
			if (
				commentChallengeFrame.contentWindow &&
				commentChallengeFrame.contentWindow !== window
			) {
				handleCommentFrameResult("message", message);
			}
		};

	commentChallengeFrame.addEventListener("load", () => {
		window.setTimeout(() => {
			handleCommentFrameResult("load");
		}, 0);
	});

	window.addEventListener("message", (event: MessageEvent) => {
		if (event.origin !== window.location.origin) return;
		if (event.source !== commentChallengeFrame.contentWindow) return;
		if (!isCommentFrameBridgeMessage(event.data)) return;
		handleCommentFrameResult("message", event.data);
	});

	const onCommentSubmit = (event: Event) => {
		const prepared = data.prepareCurrentCommentSubmission(
			ui.commentAuthor.val,
			ui.commentDraft.val,
		);
		if (!prepared) {
			event.preventDefault();
			return;
		}

		pendingCommentRefs = prepared.refs;
		clearCommentPostTimeout();
		commentPostTimeoutId = window.setTimeout(() => {
			if (!pendingCommentRefs) return;
			console.warn("[novele] comment iframe timed out");
			finalizeCommentPost();
			data.failCurrentCommentSubmission(
				new Error("Comment submission timed out."),
			);
			resetCommentFrame();
		}, commentPostTimeoutMs);
		ui.commentAuthor.val = prepared.author;
		ui.commentDraft.val = prepared.text;
		authorInputElement.value = prepared.author;
		commentInputElement.value = prepared.text;
	};

	van.derive(() => {
		if (ui.activeOverlay.val === "comments") data.loadCurrentComments();
	});

	van.derive(() => {
		const state = data.currentComments.val;
		const status = commentStatusText(data);
		if (status) {
			commentsRoot.replaceChildren(
				div(
					{ class: nameMap.commentItem },
					div(
						{ class: nameMap.commentMeta },
						span({ class: nameMap.user }, "Site comments"),
						span({ class: nameMap.time }, state.isLoading ? "Loading" : "Idle"),
					),
					p({ class: nameMap.commentText }, status),
				),
			);
			return;
		}

		commentsRoot.replaceChildren(
			...(state.isLoading
				? [
						div(
							{ class: nameMap.commentItem },
							div(
								{ class: nameMap.commentMeta },
								span({ class: nameMap.user }, "Site comments"),
								span({ class: nameMap.time }, "Loading"),
							),
							p(
								{ class: nameMap.commentText },
								`Loading ${state.refs.length} comment page(s)...`,
							),
						),
					]
				: []),
			...state.items.map((comment) =>
				div(
					{
						class: nameMap.commentItem,
						id: comment.id || undefined,
					},
					div(
						{ class: nameMap.commentMeta },
						span({ class: nameMap.user }, comment.author),
						span({ class: nameMap.time }, comment.time),
					),
					...comment.text.map((line) =>
						p(
							{ class: nameMap.commentText },
							comment.parentId ? `> ${line}` : line,
						),
					),
				),
			),
		);
		if (pendingScrollCommentId) {
			const target = commentsRoot.querySelector<HTMLElement>(
				pendingScrollCommentId,
			);
			if (target) {
				target.scrollIntoView({
					behavior: "smooth",
					block: "center",
				});
				pendingScrollCommentId = null;
			}
		}
	});

	return aside(
		{
			class: drawerClass(ui, "comments", [nameMap.commentsSheet]),
			onclick: (event) => event.stopPropagation(),
		},
		drawerHeader("Comments", close, commentHeaderTail(data)),
		div({ class: nameMap.commentsContentWrapper }, commentsRoot),
		form(
			{
				class: nameMap.commentInputArea,
				method: "POST",
				action: ZHENHUN_COMMENT_POST_URL,
				target: commentFrameName,
				onsubmit: onCommentSubmit,
			},
			() =>
				data.currentComments.val.error
					? div({ class: nameMap.commentError }, data.currentComments.val.error)
					: "",
			() => commentChallengeFrame,
			input({
				type: "hidden",
				name: "submit",
				value: "",
			}),
			input({
				type: "hidden",
				name: "comment_post_ID",
				value: () => data.currentComments.val.postId ?? "",
			}),
			input({
				type: "hidden",
				name: "comment_parent",
				value: "",
			}),
			div({ class: nameMap.inputWrapper }, authorInputElement),
			div(
				{ class: nameMap.inputWrapper },
				commentInputElement,
				button(
					{
						disabled: () => {
							const comments = data.currentComments.val;
							return (
								comments.isLoading ||
								comments.posting ||
								comments.waitingForCloudflareVerification ||
								!comments.postId ||
								!ui.commentDraft.val.trim()
							);
						},
						type: "submit",
					},
					() =>
						data.currentComments.val.needsCloudflareVerification
							? "VERIFY"
							: data.currentComments.val.posting
								? "POSTING"
								: "POST",
				),
			),
		),
	);
}
