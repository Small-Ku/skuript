import {
	isCloudflareChallengeDocument,
	ZHENHUN_COMMENT_POST_URL,
} from "./extract/comments";
import { hostname } from "./extract/hostname-map";
import { createNoveleLogger } from "./log";

export const COMMENT_FRAME_BRIDGE_MESSAGE_TYPE =
	"novele:comment-frame-update" as const;
export const COMMENT_FRAME_BRIDGE_CALLBACK_NAME =
	"__noveleReceiveCommentFrameUpdate" as const;

export type CommentFrameBridgeMessage = {
	type: typeof COMMENT_FRAME_BRIDGE_MESSAGE_TYPE;
	href: string;
	isCloudflareChallenge: boolean;
	title: string;
};

export type CommentFrameBridgeReceiver = (
	message: CommentFrameBridgeMessage,
) => void;

type ParentWindowWithCommentBridge = Window & {
	[COMMENT_FRAME_BRIDGE_CALLBACK_NAME]?: CommentFrameBridgeReceiver;
};

const logger = createNoveleLogger("comment-bridge");

export function isCommentFrameBridgeMessage(
	data: unknown,
): data is CommentFrameBridgeMessage {
	if (!data || typeof data !== "object") return false;
	const candidate = data as Partial<CommentFrameBridgeMessage>;
	return (
		candidate.type === COMMENT_FRAME_BRIDGE_MESSAGE_TYPE &&
		typeof candidate.href === "string" &&
		typeof candidate.isCloudflareChallenge === "boolean" &&
		typeof candidate.title === "string"
	);
}

function collectCommentFrameBridgePayload(): CommentFrameBridgeMessage {
	return {
		type: COMMENT_FRAME_BRIDGE_MESSAGE_TYPE,
		href: window.location.href,
		isCloudflareChallenge: isCloudflareChallengeDocument(document),
		title: document.title,
	};
}

export function installCommentFrameBridge() {
	if (
		window.top === window.self ||
		!window.parent ||
		window.parent === window ||
		hostname !== "www.zhenhunxiaoshuo.com"
	) {
		logger.debug("skipped iframe bridge install", {
			href: window.location.href,
			hostname,
		});
		return false;
	}

	let updateScheduled = false;

	const postUpdate = () => {
		updateScheduled = false;
		const message = collectCommentFrameBridgePayload();
		try {
			const parentWindow = window.parent as ParentWindowWithCommentBridge;
			const directReceiver = parentWindow[COMMENT_FRAME_BRIDGE_CALLBACK_NAME];
			if (typeof directReceiver === "function") {
				logger.debug("sent iframe bridge update through direct receiver", {
					href: message.href,
					isCloudflareChallenge: message.isCloudflareChallenge,
				});
				directReceiver(message);
				return;
			}
			logger.debug("sent iframe bridge update through postMessage", {
				href: message.href,
				isCloudflareChallenge: message.isCloudflareChallenge,
			});
			window.parent.postMessage(message, window.location.origin);
		} catch (error) {
			logger.debug("comment iframe bridge postMessage failed", error);
		}
	};

	const scheduleUpdate = () => {
		if (updateScheduled) return;
		updateScheduled = true;
		window.setTimeout(postUpdate, 0);
	};

	const observer = new MutationObserver(() => {
		scheduleUpdate();
	});
	observer.observe(document, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true,
	});

	window.addEventListener("load", scheduleUpdate);
	window.addEventListener("pageshow", scheduleUpdate);
	document.addEventListener("readystatechange", scheduleUpdate);

	if (
		window.location.href === ZHENHUN_COMMENT_POST_URL ||
		isCloudflareChallengeDocument(document)
	) {
		scheduleUpdate();
	}

	logger.info("installed iframe comment bridge observers", {
		href: window.location.href,
	});
	return true;
}
