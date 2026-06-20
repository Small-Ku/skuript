type WriteCoalescerOptions<TKey extends string, TValue> = {
	flushDelayMs: number;
	onFlush: (entries: Map<TKey, TValue>) => void;
};

export type WriteCoalescer<TKey extends string, TValue> = {
	set: (key: TKey, value: TValue) => void;
	flush: () => void;
};

export function createWriteCoalescer<TKey extends string, TValue>(
	options: WriteCoalescerOptions<TKey, TValue>,
): WriteCoalescer<TKey, TValue> {
	let pending = new Map<TKey, TValue>();
	let flushTimer: number | undefined;

	const flush = () => {
		if (flushTimer) {
			window.clearTimeout(flushTimer);
			flushTimer = undefined;
		}
		if (!pending.size) return;
		const nextEntries = pending;
		pending = new Map<TKey, TValue>();
		options.onFlush(nextEntries);
	};

	return {
		set(key, value) {
			pending.set(key, value);
			if (flushTimer) return;
			flushTimer = window.setTimeout(flush, options.flushDelayMs);
		},
		flush,
	};
}
