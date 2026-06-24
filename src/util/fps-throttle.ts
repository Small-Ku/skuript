import type { JobQueue } from "./job-queue";

/**
 * Configuration for the FPS-based concurrency controller.
 */
export interface FpsThrottleOptions {
	/**
	 * The minimum number of concurrent jobs to allow.
	 * @default 1
	 */
	minConcurrency?: number;
	/**
	 * The maximum number of concurrent jobs to allow.
	 * @default 3
	 */
	maxConcurrency?: number;
	/**
	 * Frame duration threshold (ms) below which concurrency is increased.
	 * Corresponds to ~55 FPS.
	 * @default 18
	 */
	fastFrameMs?: number;
	/**
	 * Frame duration threshold (ms) above which concurrency is decreased.
	 * Corresponds to ~45 FPS.
	 * @default 22
	 */
	slowFrameMs?: number;
	/**
	 * Minimum interval between concurrency adjustments (ms).
	 * Prevents thrashing when frame rate is noisy.
	 * @default 250
	 */
	adjustIntervalMs?: number;
	/**
	 * Number of recent frames to include in the rolling average.
	 * @default 10
	 */
	windowSize?: number;
	/**
	 * Optional callback fired when monitoring starts or stops.
	 */
	onMonitoringChange?: (active: boolean) => void;
	/**
	 * Optional callback fired when concurrency changes.
	 */
	onConcurrencyChange?: (info: {
		previousConcurrency: number;
		nextConcurrency: number;
		averageFrameMs: number;
	}) => void;
}

/**
 * Monitors the browser's frame rate via `requestAnimationFrame` and
 * dynamically adjusts a `JobQueue`'s concurrency to keep the UI responsive.
 *
 * - Concurrency increases when frames are fast (queue is under-utilized).
 * - Concurrency decreases when frames are slow (queue is stressing the main thread).
 * - Monitoring starts only when the queue becomes active and stops when it goes idle,
 *   so there is zero overhead during idle periods.
 */
export class FpsConcurrencyController<
	TJobContext extends object,
	TContext extends object,
	TResult = unknown,
> {
	private readonly queue: JobQueue<TJobContext, TContext, TResult>;
	private readonly minConcurrency: number;
	private readonly maxConcurrency: number;
	private readonly fastFrameMs: number;
	private readonly slowFrameMs: number;
	private readonly adjustIntervalMs: number;
	private readonly windowSize: number;
	private readonly onMonitoringChange?: (active: boolean) => void;
	private readonly onConcurrencyChange?: (info: {
		previousConcurrency: number;
		nextConcurrency: number;
		averageFrameMs: number;
	}) => void;

	private rafId: number | null = null;
	private lastTimestamp: number | null = null;
	private lastAdjustTime = 0;
	private readonly frameDurations: number[] = [];
	private currentConcurrency: number;

	constructor(
		queue: JobQueue<TJobContext, TContext, TResult>,
		options: FpsThrottleOptions = {},
	) {
		const {
			minConcurrency = 1,
			maxConcurrency = 3,
			fastFrameMs = 18,
			slowFrameMs = 22,
			adjustIntervalMs = 250,
			windowSize = 10,
			onMonitoringChange,
			onConcurrencyChange,
		} = options;

		this.queue = queue;
		this.minConcurrency = minConcurrency;
		this.maxConcurrency = maxConcurrency;
		this.fastFrameMs = fastFrameMs;
		this.slowFrameMs = slowFrameMs;
		this.adjustIntervalMs = adjustIntervalMs;
		this.windowSize = windowSize;
		this.currentConcurrency = maxConcurrency;
		this.onMonitoringChange = onMonitoringChange;
		this.onConcurrencyChange = onConcurrencyChange;
	}

	/**
	 * Handles active-state transitions from the queue.
	 * Pass this as the `onActiveChange` option when constructing `JobQueue`.
	 */
	readonly onActiveChange = (active: boolean): void => {
		if (active) {
			this._startMonitoring();
		} else {
			this._stopMonitoring();
		}
	};

	private _startMonitoring(): void {
		if (this.rafId !== null || typeof requestAnimationFrame === "undefined") {
			return;
		}
		this.lastTimestamp = null;
		this.frameDurations.length = 0;
		this.lastAdjustTime = 0;
		this.rafId = requestAnimationFrame(this._loop);
		this.onMonitoringChange?.(true);
	}

	private _stopMonitoring(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.lastTimestamp = null;
		this.onMonitoringChange?.(false);
	}

	private readonly _loop = (timestamp: number): void => {
		// Measure the duration of this frame
		if (this.lastTimestamp !== null) {
			const duration = timestamp - this.lastTimestamp;
			// Ignore outliers caused by tab switching or initial ramp-up (cap at 200ms)
			if (duration < 200) {
				this.frameDurations.push(duration);
				if (this.frameDurations.length > this.windowSize) {
					this.frameDurations.shift();
				}
			}
		}
		this.lastTimestamp = timestamp;

		// Adjust concurrency on the configured interval
		if (
			this.frameDurations.length >= 3 &&
			timestamp - this.lastAdjustTime >= this.adjustIntervalMs
		) {
			this._adjustConcurrency();
			this.lastAdjustTime = timestamp;
		}

		this.rafId = requestAnimationFrame(this._loop);
	};

	private _adjustConcurrency(): void {
		const avg =
			this.frameDurations.reduce((sum, d) => sum + d, 0) /
			this.frameDurations.length;

		let next = this.currentConcurrency;

		if (avg < this.fastFrameMs && next < this.maxConcurrency) {
			next += 1;
		} else if (avg > this.slowFrameMs && next > this.minConcurrency) {
			next -= 1;
		}

		if (next !== this.currentConcurrency) {
			const previousConcurrency = this.currentConcurrency;
			this.currentConcurrency = next;
			this.onConcurrencyChange?.({
				previousConcurrency,
				nextConcurrency: next,
				averageFrameMs: avg,
			});
			this.queue.updateConcurrency(next);
		}
	}
}
