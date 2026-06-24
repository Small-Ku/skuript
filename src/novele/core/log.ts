/** @dev-only */
type ConsoleMethod = "debug" | "info" | "warn" | "error";

type LoggerMethod = (message: string, ...args: unknown[]) => void;

export type NoveleLogger = Record<ConsoleMethod, LoggerMethod>;
function writeLog(
	level: ConsoleMethod,
	scope: string,
	message: string,
	args: unknown[],
) {
	console[level](`[novele:${scope}] ${message}`, ...args);
}

export function createNoveleLogger(scope: string): NoveleLogger {
	return {
		debug(message, ...args) {
			writeLog("debug", scope, message, args);
		},
		info(message, ...args) {
			writeLog("info", scope, message, args);
		},
		warn(message, ...args) {
			writeLog("warn", scope, message, args);
		},
		error(message, ...args) {
			writeLog("error", scope, message, args);
		},
	};
}
