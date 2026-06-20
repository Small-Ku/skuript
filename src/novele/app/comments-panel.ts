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

const { aside, button, div, form, iframe, input, p, span, textarea } = van.tags;

type CommentTreeNode = {
	item: ReaderData["currentComments"]["val"]["items"][number];
	replies: CommentTreeNode[];
};

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

function stripCommentIdPrefix(commentId: string | null) {
	return commentId?.replace(/^comment-/, "") ?? "";
}

function buildCommentTree(
	items: ReaderData["currentComments"]["val"]["items"],
) {
	const nodes = new Map<string, CommentTreeNode>();
	const roots: CommentTreeNode[] = [];
	for (const item of items) {
		if (!item.id) continue;
		nodes.set(item.id, {
			item,
			replies: [],
		});
	}
	for (const item of items) {
		const node = item.id ? nodes.get(item.id) : undefined;
		if (!node) continue;
		const parentNode = item.parentId ? nodes.get(item.parentId) : undefined;
		if (parentNode && parentNode !== node) {
			parentNode.replies.push(node);
			continue;
		}
		roots.push(node);
	}
	for (const item of items) {
		if (item.id) continue;
		roots.push({
			item,
			replies: [],
		});
	}
	return roots;
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
	const hiddenCommentParentInput = input({
		type: "hidden",
		name: "comment_parent",
		value: () => stripCommentIdPrefix(ui.replyingToCommentId.val),
	}) as HTMLInputElement;

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
		class: nameMap.commentTextarea,
		name: "comment",
		placeholder: "Type comment...",
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
		if (message?.isCloudflareChallenge) {
			handleCommentSubmissionFailure(new Error(CLOUDFLARE_CHALLENGE_MESSAGE));
			return;
		}
		const respStatus = getCommentFrameResponseStatus();
		const frameUrl = commentChallengeFrame.contentWindow?.location.href;
		if (message?.href && frameUrl && message.href !== frameUrl) {
			console.debug("[novele] comment iframe bridge href mismatch", {
				source,
				bridgeHref: message.href,
				frameUrl,
			});
			return;
		}
		console.debug(`[novele] comment iframe ${source}`, {
			bridgeCloudflare: message?.isCloudflareChallenge,
			bridgeHref: message?.href,
			url: frameUrl,
			respStatus,
		});
		try {
			const doc = commentChallengeFrame.contentDocument;
			const finalUrl = frameUrl;
			if (!doc || !finalUrl) return;
			const bundle = resolveCommentPostResult(
				pendingCommentRefs,
				doc,
				finalUrl,
				respStatus,
			);
			finalizeCommentPost();
			data.completeCurrentCommentSubmission(bundle);
			pendingScrollCommentId = bundle.commentId ?? null;
			ui.commentDraft.val = "";
			ui.replyingToCommentId.val = null;
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
			ui.replyingToCommentId.val,
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
		hiddenCommentParentInput.value = stripCommentIdPrefix(prepared.parentId);
	};

	const cancelReply = () => {
		ui.replyingToCommentId.val = null;
	};

	const startReply = (commentId: string) => {
		ui.replyingToCommentId.val = commentId;
	};

	const scrollToReplyTarget = () => {
		const targetId = ui.replyingToCommentId.val;
		if (!targetId) return;
		commentsRoot
			.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`)
			?.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
	};

	const renderCommentNode = (node: CommentTreeNode, depth = 0): HTMLElement => {
		const { item, replies } = node;
		return div(
			{
				class:
					depth > 0
						? `${nameMap.commentTreeNode} ${nameMap.commentReplyDepth}`
						: nameMap.commentTreeNode,
			},
			div(
				{
					class: nameMap.commentItem,
					id: item.id || undefined,
				},
				div(
					{ class: nameMap.commentMeta },
					span({ class: nameMap.user }, item.author),
					span({ class: nameMap.time }, item.time),
				),
				...item.text.map((line) => p({ class: nameMap.commentText }, line)),
				item.id
					? div(
							{ class: nameMap.commentActions },
							button(
								{
									class: nameMap.commentActionButton,
									type: "button",
									onclick: () => startReply(item.id),
								},
								ui.replyingToCommentId.val === item.id ? "Replying" : "Reply",
							),
						)
					: "",
			),
			replies.length
				? div(
						{ class: nameMap.nestedRepliesList },
						...replies.map((reply) => renderCommentNode(reply, depth + 1)),
					)
				: "",
		) as HTMLElement;
	};

	van.derive(() => {
		if (ui.activeOverlay.val === "comments") data.loadCurrentComments();
	});

	van.derive(() => {
		const state = data.currentComments.val;
		const replyingToComment =
			state.items.find(
				(comment) => comment.id === ui.replyingToCommentId.val,
			) ?? null;
		if (ui.replyingToCommentId.val && !replyingToComment) {
			ui.replyingToCommentId.val = null;
		}
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

		const commentTree = buildCommentTree(state.items);
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
			...commentTree.map((comment) => renderCommentNode(comment)),
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
				class: nameMap.commentFloatingInputArea,
				method: "POST",
				action: ZHENHUN_COMMENT_POST_URL,
				target: commentFrameName,
				onsubmit: onCommentSubmit,
			},
			() => {
				const replyTarget =
					data.currentComments.val.items.find(
						(comment) => comment.id === ui.replyingToCommentId.val,
					) ?? null;
				if (!replyTarget) return "";
				const snippet = replyTarget.text.join(" ").trim();
				const shortSnippet =
					snippet.length > 56
						? `${snippet.slice(0, 56).trimEnd()}...`
						: snippet;
				return div(
					{ class: nameMap.inputRow },
					div(
						{
							class: `${nameMap.replyingBanner} ${nameMap.pillPanel}`,
							onclick: scrollToReplyTarget,
						},
						span(
							{ class: nameMap.replyingText },
							`Replying to ${replyTarget.author}`,
							shortSnippet
								? span({ class: nameMap.replySnippet }, `: "${shortSnippet}"`)
								: "",
						),
					),
					button(
						{
							class: `${nameMap.cancelReplyButton} ${nameMap.pillPanel}`,
							type: "button",
							onclick: cancelReply,
						},
						"Cancel",
					),
				);
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
			hiddenCommentParentInput,
			div(
				{ class: nameMap.inputRow },
				div(
					{ class: `${nameMap.extraInputWrapper} ${nameMap.pillPanel}` },
					authorInputElement,
				),
				button(
					{
						class: `${nameMap.postActionButton} ${nameMap.pillPanel}`,
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
			div(
				{ class: nameMap.inputRow },
				div(
					{ class: `${nameMap.commentMainInputs} ${nameMap.pillPanel}` },
					commentInputElement,
				),
			),
		),
	);
}
