/**
 * Decorator that batches calls to a callback function, invoking it once per
 * animation frame with all accumulated arguments.
 */
export function batchRaf<T>(fn: (accumulated: T[]) => void): (item: T) => void {
	let buffer: T[] = [];
	let rafId: number | null = null;

	return (item: T) => {
		buffer.push(item);
		if (rafId === null) {
			rafId = requestAnimationFrame(() => {
				const currentBuffer = buffer;
				buffer = [];
				rafId = null;
				fn(currentBuffer);
			});
		}
	};
}

/**
 * Creates a coalescer that buffers partial updates and flushes them to a callback
 * in the next animation frame, with support for immediate flush.
 */
export function createFrameCoalescer<T>(
	initialValue: () => T,
	onFlush: (value: T) => void,
): (nextPartial: Partial<T>, immediate?: boolean) => void {
	let rafId: number | null = null;
	let accumulated: T | null = null;

	return (nextPartial: Partial<T>, immediate = false) => {
		accumulated = {
			...(accumulated ?? initialValue()),
			...nextPartial,
		} as T;

		if (immediate) {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
			onFlush(accumulated);
			accumulated = null;
		} else if (rafId === null) {
			rafId = requestAnimationFrame(() => {
				if (accumulated !== null) {
					onFlush(accumulated);
					accumulated = null;
				}
				rafId = null;
			});
		}
	};
}

/**
 * Creates a debounced version of a function that schedules execution in the next animation frame,
 * canceling any pending execution if called again.
 */
export function debounceRaf(fn: () => void): () => void {
	let rafId: number | null = null;
	return () => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
		}
		rafId = requestAnimationFrame(() => {
			rafId = null;
			fn();
		});
	};
}

export interface ProgressiveRenderOptions {
	chunkSize?: number;
	initialNodes?: Node[];
	onChunkAppended?: () => void;
	isAborted?: () => boolean;
}

/**
 * Progressively renders an array of items, mapping them to DOM Nodes
 * and appending them to the container in chunks while yielding to the main thread.
 */
export async function renderProgressively<T>(
	container: HTMLElement,
	items: T[],
	renderItem: (item: T) => Node,
	options: ProgressiveRenderOptions = {},
): Promise<void> {
	const {
		chunkSize = 50,
		initialNodes = [],
		onChunkAppended,
		isAborted,
	} = options;

	const yieldToMain = () => {
		const scheduler = (
			globalThis as unknown as {
				scheduler?: { yield?: () => Promise<void> };
			}
		).scheduler;
		if (scheduler?.yield) {
			return scheduler.yield();
		}
		return new Promise((resolve) => setTimeout(resolve, 0));
	};

	let hasAppendedInitial = false;

	for (
		let i = 0;
		i < items.length || (!hasAppendedInitial && initialNodes.length > 0);
		i += chunkSize
	) {
		if (isAborted?.()) return;

		const fragment = document.createDocumentFragment();

		if (!hasAppendedInitial && initialNodes.length > 0) {
			for (const node of initialNodes) {
				fragment.appendChild(node);
			}
			hasAppendedInitial = true;
		}

		if (i < items.length) {
			const chunk = items.slice(i, i + chunkSize);
			for (const item of chunk) {
				fragment.appendChild(renderItem(item));
			}
		}

		container.appendChild(fragment);
		onChunkAppended?.();

		if (i + chunkSize < items.length) {
			await yieldToMain();
		}
	}
}

/**
 * Creates a helper to run a cancelable render task only when inputs change.
 * It tracks the inputs array and increments an internal iteration token if inputs change,
 * producing a cancelable isAborted signal.
 */
export function createIncrementalRenderer<Args extends unknown[]>() {
	let iteration = 0;
	let lastArgs: Args | null = null;

	const run = (
		args: Args,
		fn: (signal: { isAborted: () => boolean }) => void,
	) => {
		const changed =
			!lastArgs || args.some((arg, index) => arg !== lastArgs![index]);
		if (!changed) return;
		lastArgs = args;

		iteration++;
		const current = iteration;
		const isAborted = () => current !== iteration;
		fn({ isAborted });
	};

	run.reset = () => {
		lastArgs = null;
		iteration++;
	};

	return run;
}
