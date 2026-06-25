import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TEST_DATA_DIR = join(process.cwd(), ".temp/test-data");

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getCacheFilename(urlStr: string): string {
	const url = new URL(urlStr);
	const name = (url.hostname + url.pathname)
		.replace(/[^a-zA-Z0-9]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return `${name}.html`;
}

async function fetchWithRetry(
	url: string,
	referer: string,
	attempt = 1,
): Promise<Response> {
	// Use captured native fetch if available to avoid infinite mock recursion
	// biome-ignore lint/suspicious/noExplicitAny: test environment setup
	const fetchImpl = (globalThis as any).__nativeFetch || globalThis.fetch;
	const response = await fetchImpl(url, {
		headers: {
			"user-agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
			referer: referer,
		},
	});

	if (response.status !== 429) return response;
	if (attempt >= 8) {
		throw new Error(`429 persisted for ${url} after ${attempt} attempts`);
	}

	const retryAfter = Number(response.headers.get("retry-after"));
	const waitMs =
		(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 4000) +
		(attempt - 1) * 1500;
	console.log(
		`429 for ${url}, waiting ${waitMs}ms before retry ${attempt + 1}`,
	);
	await sleep(waitMs);
	return fetchWithRetry(url, referer, attempt + 1);
}

export async function getOrDownloadTestData(url: string): Promise<string> {
	await mkdir(TEST_DATA_DIR, { recursive: true });
	const filename = getCacheFilename(url);
	const filepath = join(TEST_DATA_DIR, filename);

	if (existsSync(filepath)) {
		return readFile(filepath, "utf8");
	}

	console.log(`Test data cache miss. Downloading: ${url}`);

	const parsedUrl = new URL(url);
	const referer = `${parsedUrl.protocol}//${parsedUrl.hostname}/`;

	const response = await fetchWithRetry(url, referer);
	if (!response.ok) {
		throw new Error(
			`Failed to download test data from ${url}: ${response.status} ${response.statusText}`,
		);
	}

	const html = await response.text();
	await writeFile(filepath, html, "utf8");
	// Sleep briefly between live fetches to avoid getting rate-limited
	await sleep(1500);
	return html;
}
