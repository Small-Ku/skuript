import { watch as fswatch } from "node:fs";
import path from "node:path";
import type { PackageJson } from "type-fest";
import winston from "winston";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import styleLoader from "./bun_plugins/style-loader";

const consoleTransport = new winston.transports.Console();
const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || "info",
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.cli(),
		winston.format.printf(
			(info) =>
				`${info.timestamp} ${info.level}: ${info.message} ${info.splat !== undefined ? info.splat : ""}`,
		),
	),
	transports: [consoleTransport],
	exceptionHandlers: [consoleTransport],
	rejectionHandlers: [consoleTransport],
	exitOnError: false,
});

const MINIMAL_USER_SCRIPT_HEADER_ITEMS = [
	"@name",
	"@namespace",
	"@version",
	"@description",
	"@license",
	"@author",
] as const;

const MINIMAL_USER_SCRIPT_HEADER_SET: Set<
	(typeof MINIMAL_USER_SCRIPT_HEADER_ITEMS)[number]
> = new Set(MINIMAL_USER_SCRIPT_HEADER_ITEMS);

type MinimalUserScriptHeader = {
	[K in (typeof MINIMAL_USER_SCRIPT_HEADER_ITEMS)[number]]: string[] | string;
};

type UserScriptHeader = MinimalUserScriptHeader & {
	[k: string]: string[] | string;
};

type MetaJson = {
	name: string;
	version: string;
	description: string;
	license: string;
	author: string;
	namespace: string;
} & { [k: string]: string[] | string };

const VALID_RELEASE_CHANNELS = [
	"GitHubRelease",
	"GitCommit",
	"OutOfBand",
] as const;

type ReleaseChannel = (typeof VALID_RELEASE_CHANNELS)[number];

const PACKAGE_JSON: PackageJson = require("./package.json");

function generateReleaseURL(
	releaseChannel: ReleaseChannel,
	inputs: { repoURL: string; name: string },
): string {
	if (releaseChannel === "OutOfBand") {
		return "";
	}

	const distUserScript = `${inputs.name}.user.js`;
	const url = inputs.repoURL.replace("git+", "").replace(".git", "");

	if (releaseChannel === "GitCommit")
		return `${url}/raw/main/dist/${distUserScript}`;

	if (releaseChannel === "GitHubRelease")
		return `${url}/releases/latest/download/${distUserScript}`;

	throw new Error(`invalid release channel ${releaseChannel}`);
}

function generateHeader(
	releaseChannel: ReleaseChannel,
	scriptName: string,
): UserScriptHeader {
	const META_JSON: MetaJson = require(`./src/${scriptName}/meta.json`);
	if (
		!META_JSON.name ||
		!META_JSON.version ||
		!META_JSON.description ||
		!META_JSON.license ||
		!META_JSON.author ||
		!META_JSON.namespace
	) {
		throw new Error("Missing required fields in package.json");
	}

	const url = (PACKAGE_JSON.repository as { url: string }).url
		.replace("git+", "")
		.replace(".git", "");
	const releaseURL = generateReleaseURL(releaseChannel, {
		name: scriptName,
		repoURL: (PACKAGE_JSON.repository as { url: string }).url,
	});

	const releaseHeader = releaseURL
		? {
				"@updateURL": releaseURL,
				"@downloadURL": releaseURL,
			}
		: null;

	const defaultHeader: MinimalUserScriptHeader = {
		"@name": META_JSON.name,
		"@namespace": url,
		"@version": META_JSON.version,
		"@description": META_JSON.description,
		"@license": META_JSON.license,
		"@author": META_JSON.author.toString(),
	};
	const header: UserScriptHeader = {
		...defaultHeader,
		...releaseHeader,
	};

	for (const key in META_JSON) {
		const value = META_JSON[key];
		if (typeof key !== "string") {
			logger.warn(
				`ignore non-string key in userscript header: "${key}"="${value}"`,
			);
		}

		header[`@${key}`] = value;
	}
	return header;
}

function generateHeaderText(
	header: UserScriptHeader,
	buildSuffix?: string,
): string {
	if (buildSuffix) header["@version"] += `.${buildSuffix}`;

	const HEADER_BEGIN = "// ==UserScript==\n";
	const HEADER_END = "// ==/UserScript==\n";
	let text = HEADER_BEGIN;

	for (const key of MINIMAL_USER_SCRIPT_HEADER_ITEMS) {
		const value = header[key];
		for (const row of typeof value === "string" ? [value] : value) {
			text += `// ${key} ${row}\n`;
		}
	}

	for (const key in header) {
		// biome-ignore lint/suspicious/noExplicitAny: key is a string header field at runtime
		if (MINIMAL_USER_SCRIPT_HEADER_SET.has(key as any)) {
			continue;
		}
		const value = header[key];
		for (const row of typeof value === "string" ? [value] : value) {
			text += `// ${key} ${row}\n`;
		}
	}
	text += HEADER_END;
	return text;
}

interface BuildOption {
	dev?: boolean;
	releaseChannel?: ReleaseChannel;
	entrypoint: string;
}

interface BuildOutput {
	readonly userscriptPath: string;
}

async function build(option: BuildOption): Promise<BuildOutput> {
	const { dev = false, releaseChannel = "OutOfBand", entrypoint } = option;

	const scriptName = path.dirname(path.relative("./src", entrypoint));

	logger.info(`Building ${entrypoint}`);
	const build = await Bun.build({
		entrypoints: [entrypoint],
		outdir: "./dist",
		naming: `${scriptName}.user.js`,
		minify: dev
			? false
			: {
					whitespace: true,
					syntax: true,
					identifiers: true,
				},
		sourcemap: dev ? "inline" : undefined,
		plugins: [
			styleLoader({
				cssModules: {
					pattern: "[local]", // short random scooped class name is not supported for now
				},
			}),
		],
		banner: generateHeaderText(
			generateHeader(releaseChannel, scriptName),
			dev ? Date.now().toString() : undefined,
		),
	});

	logger.info(Bun.inspect(build, { colors: true }));

	if (!build.success) {
		throw new Error("Bun build return errors");
	}

	const outputPath = build.outputs.find(
		(artifact) => artifact.kind === "entry-point",
	)?.path;
	if (!outputPath) {
		throw new Error("Cannot find entrypoint in built artifacts.");
	}
	return {
		userscriptPath: outputPath,
	};
}

interface Watcher {
	close: () => void;
}

function watch(options: BuildOption[]): Watcher {
	let stopped = false;
	const watchPath = `${import.meta.dir}/src`;
	const watcher = fswatch(watchPath, { recursive: true }, (event, filename) => {
		if (stopped) return;
		logger.info(`Detected ${event} in ${filename}`);
		Promise.all(
			options.map(async (option) =>
				build(option).then((r) => r.userscriptPath),
			),
		);
	});
	logger.info(`Watching path ${watchPath}`);
	return {
		close: () => {
			logger.info("Closing watcher...");
			stopped = true;
			watcher.close();
		},
	};
}

interface ServerOption {
	userscriptPaths: string[];
}

interface Server {
	close: () => void;
}

function serve(option: ServerOption): Server {
	const { userscriptPaths } = option;
	const routes = new Map(
		userscriptPaths.map((userscriptPath) => [
			`/${path.basename(userscriptPath)}`,
			userscriptPath,
		]),
	);
	const server = Bun.serve({
		async fetch(req) {
			const url = new URL(req.url);
			if (routes.has(url.pathname))
				return new Response(Bun.file(routes.get(url.pathname) as string));
			return Response.redirect("https://http.cat/404");
		},
	});
	logger.info(`Listening on http://${server.hostname}:${server.port}/`);
	return {
		close: () => {
			logger.info("Stopping dev server...");
			server.stop();
			server.unref();
		},
	};
}

async function main() {
	const argv = await yargs(hideBin(process.argv))
		.option("dev", {
			type: "boolean",
			description:
				"Build in development mode, which disables minify and enables inline source map",
			default: false,
		})
		.option("server", {
			type: "boolean",
			description: "Start a local HTTP server for the generated user script",
			default: false,
		})
		.option("watch", {
			type: "boolean",
			description:
				"Watch src folder and build whenever change happens to its files",
			default: false,
		})
		.option("release-channel", {
			type: "string",
			choices: VALID_RELEASE_CHANNELS,
			default: "OutOfBand",
		})
		.parse();

	const options: BuildOption[] = [
		{
			dev: argv.dev,
			releaseChannel: argv.releaseChannel as ReleaseChannel,
			entrypoint: "./src/novele/index.ts",
		},
	];

	// initial building is always needed, even for watching build
	const userscriptPaths = await Promise.all(
		options.map(async (option) => build(option).then((r) => r.userscriptPath)),
	);

	if (argv.server) {
		const s = serve({ userscriptPaths });
		process.on("SIGINT", () => {
			s.close();
		});
	}

	if (argv.watch) {
		const w = watch(options);
		process.on("SIGINT", () => {
			w.close();
		});
	}
}

await main();
