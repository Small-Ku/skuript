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
	 * @default 128
	 */
	maxConcurrency?: number;
	/**
	 * Target frame duration (ms) that the controller tries to maintain.
	 * Lower averages increase concurrency; higher averages reduce it.
	 * Corresponds to ~50 FPS by default.
	 * @default 20
	 */
	targetFrameMs?: number;
	/**
	 * Sensitivity factor for the cubic concurrency adjustment curve.
	 * Larger values react more aggressively to frame-time drift.
	 * @default 0.005
	 */
	sensitivity?: number;
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
		currentK: number;
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
	private readonly targetFrameMs: number;
	private readonly baseSensitivity: number;
	private readonly adjustIntervalMs: number;
	private readonly windowSize: number;
	private readonly onMonitoringChange?: (active: boolean) => void;
	private readonly onConcurrencyChange?: (info: {
		previousConcurrency: number;
		nextConcurrency: number;
		averageFrameMs: number;
		currentK: number;
	}) => void;

	private rafId: number | null = null;
	private lastTimestamp: number | null = null;
	private lastAdjustTime = 0;
	private readonly frameDurations: number[] = [];
	private currentConcurrency: number;
	private currentK: number;
	private lastDeltaSign = 0;

	constructor(
		queue: JobQueue<TJobContext, TContext, TResult>,
		options: FpsThrottleOptions = {},
	) {
		const {
			minConcurrency = 1,
			maxConcurrency = 128,
			targetFrameMs = 20,
			sensitivity = 0.005,
			adjustIntervalMs = 250,
			windowSize = 10,
			onMonitoringChange,
			onConcurrencyChange,
		} = options;

		this.queue = queue;
		this.minConcurrency = minConcurrency;
		this.maxConcurrency = maxConcurrency;
		this.targetFrameMs = targetFrameMs;
		this.baseSensitivity = sensitivity;
		this.adjustIntervalMs = adjustIntervalMs;
		this.windowSize = windowSize;
		this.currentConcurrency = minConcurrency;
		this.currentK = sensitivity;
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
		this.currentK = this.baseSensitivity;
		this.lastDeltaSign = 0;
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
			this.frameDurations.length > 0 &&
			timestamp - this.lastAdjustTime >= this.adjustIntervalMs
		) {
			this._adjustConcurrency();
			this.lastAdjustTime = timestamp;
		}

		this.rafId = requestAnimationFrame(this._loop);
	};

	private _adjustConcurrency(): void {
		if (this.frameDurations.length === 0) return;

		const avg =
			this.frameDurations.reduce((sum, d) => sum + d, 0) /
			this.frameDurations.length;
		const delta = Math.round(this.currentK * (this.targetFrameMs - avg) ** 3);

		if (delta !== 0) {
			const currentDeltaSign = Math.sign(delta);
			if (this.lastDeltaSign !== 0) {
				if (currentDeltaSign !== this.lastDeltaSign) {
					this.currentK = Math.max(
						this.baseSensitivity * 0.2,
						this.currentK * 0.5,
					);
				} else {
					this.currentK = Math.min(
						this.baseSensitivity * 5,
						this.currentK * 1.2,
					);
				}
			}
			this.lastDeltaSign = currentDeltaSign;
		} else {
			this.currentK =
				this.currentK + (this.baseSensitivity - this.currentK) * 0.1;
			this.lastDeltaSign = 0;
		}

		if (delta === 0) return;

		const next = Math.max(
			this.minConcurrency,
			Math.min(this.maxConcurrency, this.currentConcurrency + delta),
		);

		if (next !== this.currentConcurrency) {
			const previousConcurrency = this.currentConcurrency;
			this.currentConcurrency = next;
			this.onConcurrencyChange?.({
				previousConcurrency,
				nextConcurrency: next,
				averageFrameMs: avg,
				currentK: this.currentK,
			});
			this.queue.updateConcurrency(next);
		}
	}
}
