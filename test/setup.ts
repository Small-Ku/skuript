import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register Happy DOM globals
GlobalRegistrator.register();

// Capture native fetch before wrapping it
(globalThis as unknown as { __nativeFetch: typeof fetch }).__nativeFetch =
	globalThis.fetch;

// Mock Tampermonkey / Greasemonkey storage APIs to prevent ReferenceErrors
const noop = () => {};
globalThis.GM_getValue = (_key: string, defaultValue: unknown) => defaultValue;
globalThis.GM_setValue = noop;
globalThis.GM_getValues = (defaults: unknown) => defaults;
globalThis.GM_addValueChangeListener = () => 1;
globalThis.GM_removeValueChangeListener = noop;
globalThis.GM_info = {
	script: {
		name: "Novele Test Suite",
		version: "1.0.0",
	},
} as unknown as typeof GM_info;

// Import test-helper after setting __nativeFetch to avoid dependency initialization ordering issues
import { getOrDownloadTestData } from "./test-helper";

const nativeFetch = (globalThis as unknown as { __nativeFetch: typeof fetch })
	.__nativeFetch;

// Mock global fetch to redirect calls through test-helper cache
globalThis.fetch = async (
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> => {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: (input as Request).url;

	// Intercept GET requests to remote sites, bypassing the mock for internal downloader fetches
	if (
		url.startsWith("http") &&
		(!init?.method || init.method.toUpperCase() === "GET")
	) {
		try {
			const html = await getOrDownloadTestData(url);
			return new Response(html, {
				status: 200,
				headers: { "content-type": "text/html" },
			});
		} catch (err) {
			console.error(`Mock fetch error for ${url}:`, err);
			throw err;
		}
	}

	return nativeFetch(input, init);
};
