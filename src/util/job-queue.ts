/**
 * Defines the structure of a job within the queue.
 * @template TJobContext The type for the job-specific, typically immutable context.
 * @template TResult The type of the result that the job's task function will produce.
 */
interface Job<TJobContext extends object, TResult = any> {
    /** The asynchronous function to be executed for this job. */
    task: (args: TJobContext) => Promise<TResult>;
    /** The priority of the job (lower numbers mean higher priority). */
    priority: number;
    /** The job-specific context. */
    context: TJobContext;
    /** @internal For internal use: resolves the Promise returned by addJob. */
    _resolve: (value: TResult | PromiseLike<TResult>) => void;
    /** @internal For internal use: rejects the Promise returned by addJob. */
    _reject: (reason?: any) => void;
}

/**
 * An asynchronous job queue that processes tasks with dynamic priority,
 * concurrency control, and context-aware prioritization.
 *
 * @template TJobContext The type for the job-specific, typically immutable context
 * associated with each task. This context is passed to the `priorityFn`.
 * @template TContext The type for the queue-wide, mutable context that influences
 * priority calculation. This context is also passed to the `priorityFn`.
 * @template TResult The default or common result type for tasks in the queue.
 * Individual tasks can still have more specific result types.
 */
export class JobQueue<
    TJobContext extends object,
    TContext extends object,
    TResult = any
> {
    // Configuration & Core State
    private concurrency: number;
    private readonly priorityFn: (jobContext: TJobContext, context: TContext) => number;
    private context: TContext; // Queue-wide mutable context

    // Operational State
    private queue: Job<TJobContext, TResult>[] = [];
    private runningJobs: number = 0;
    
    // State flags for deferred processing
    private priorityStale: boolean = false;
    private orderStale: boolean = false;

    /**
     * Creates an instance of JobQueue.
     * @param priorityFn A function that calculates a job's priority.
     * It takes the job's specific context (`TJobContext`) and the queue's
     * current context (`TContext`) and returns a numerical priority
     * (lower numbers are higher priority).
     * @param initialContext The initial state of the queue's context (`TContext`).
     * @param concurrency The maximum number of jobs to run concurrently. Must be a positive integer. Defaults to 3.
     */
    constructor(
        priorityFn: (jobContext: TJobContext, context: TContext) => number,
        initialContext: TContext,
        concurrency: number = 3
    ) {
        if (typeof priorityFn !== 'function') {
            throw new Error("A priority function (priorityFn) must be provided.");
        }
        if (initialContext === undefined || initialContext === null) {
            throw new Error("An initial queue context (initialContext) must be provided.");
        }
        
        this.priorityFn = priorityFn;
        this.context = initialContext;

        if (typeof concurrency !== 'number' || concurrency < 1 || !Number.isInteger(concurrency)) {
            this.concurrency = 1;
        } else {
            this.concurrency = concurrency;
        }
    }

    // --- Public API Methods ---

    /**
     * Adds a new job to the queue.
     * The job's priority is calculated using the `priorityFn`.
     * If the queue's priority or order state is stale, the job is pushed to the end;
     * otherwise, it's inserted in its sorted position.
     * @param task The asynchronous function to execute for this job. It should return a `Promise<TResult>`.
     * @param jobContext The job-specific context (`TJobContext`) for this task.
     * @returns A `Promise<TResult>` that resolves with the result of the task when it completes,
     * or rejects if the task fails or is cancelled (e.g., by `clearQueue`).
     */
    public async addJob(task: () => Promise<TResult>, jobContext: TJobContext): Promise<TResult> {
        const priority = this.priorityFn(jobContext, this.context);
        
        let taskResolve!: (value: TResult | PromiseLike<TResult>) => void;
        let taskReject!: (reason?: any) => void;
        const resultPromise = new Promise<TResult>((resolve, reject) => {
            taskResolve = resolve;
            taskReject = reject;
        });

        const newJob: Job<TJobContext, TResult> = {
            task, priority, context: jobContext,
            _resolve: taskResolve, _reject: taskReject  
        };

        if (this.priorityStale || this.orderStale) {
            this.queue.push(newJob);
            this.orderStale = true; 
        } else {
            const insertIndex = this._findInsertIndex(newJob);
            this.queue.splice(insertIndex, 0, newJob);
        }
        
        this._processQueue(); 
        return resultPromise; 
    }

    /**
     * Updates the queue's general context (`TContext`).
     * This may mark job priorities as stale, requiring recalculation before the next processing.
     * @param newContext The new context for the queue.
     * @returns A `Promise<void>` that resolves when the context is set and processing is triggered.
     */
    public async setContext(newContext: Partial<TContext>): Promise<void> {
        const _newContext = { ...this.context, ...newContext } as TContext; // Merge new context with existing
        if (this.context !== _newContext) {
            this.context = _newContext;
            this.priorityStale = true;
        }
        this._processQueue();
    }

    /**
     * Updates the maximum number of concurrently running jobs.
     * @param newConcurrency The new concurrency limit. Must be a positive integer.
     * Invalid values will be defaulted to 1.
     * @returns A `Promise<void>` that resolves when concurrency is updated and processing is triggered.
     */
    public async updateConcurrency(newConcurrency: number): Promise<void> {
        if (typeof newConcurrency !== 'number' || newConcurrency < 1 || !Number.isInteger(newConcurrency)) {
            newConcurrency = 1;
        }
        this.concurrency = newConcurrency;
        this._processQueue();
    }

    /**
     * Clears all pending jobs from the queue.
     * Promises associated with cleared jobs will be rejected.
     * Currently running jobs are not affected.
     * @returns A `Promise<void>` that resolves when the queue is cleared.
     */
    public async clearQueue(): Promise<void> {
        for (const job of this.queue) {
            job._reject(new Error("Job cancelled: queue cleared."));
        }
        this.queue = [];
        this.priorityStale = false;
        this.orderStale = false;
    }

    // --- Public Getter Methods ---

    /**
     * Gets the current number of jobs waiting in the queue.
     * @returns The number of jobs in the queue.
     */
    public getQueueSize(): number { 
        return this.queue.length; 
    }

    /**
     * Gets the current number of actively running jobs.
     * @returns The number of running jobs.
     */
    public getRunningJobsCount(): number { 
        return this.runningJobs; 
    }

    // --- Private Core Logic & Helper Methods ---

    /**
     * Core processing logic.
     * Ensures queue state (priorities, order) is fresh if needed, then dispatches jobs
     * from the queue up to the concurrency limit.
     * This method is called internally whenever there's a chance a new job can start.
     * @internal
     */
    private _processQueue(): void {
        if (this.queue.length === 0) {
            this.priorityStale = false;
            this.orderStale = false;
            return;
        }
        if (this.runningJobs >= this.concurrency) {
            return;
        }

        if (this.priorityStale) {
            this._recalcPriorities(); 
        }
        if (this.orderStale) {
            this._sortQueue(); 
        }

        while (this.runningJobs < this.concurrency && this.queue.length > 0) {
            const job = this.queue.shift()!; 
            this.runningJobs++;
            
            job.task(job.context)
                .then((result: TResult) => { job._resolve(result); })
                .catch(error => {
                    console.error(`Job (context: ${JSON.stringify(job.context)}) failed:`, error);
                    job._reject(error);   
                })
                .finally(() => {
                    this.runningJobs--;
                    this._processQueue(); 
                });
        }
    }

    /**
     * Recalculates priorities for all existing jobs in the queue.
     * Updates job priorities in-place and may set `orderStale` to true if relative order changes
     * and `orderStale` was not already true.
     * Sets `priorityStale` to false after execution.
     * @internal
     */
    private _recalcPriorities(): void {
        if (this.queue.length > 0) {
            let previousJobNewPriority: number | null = null;
            for (const job of this.queue) {
                const newPriority = this.priorityFn(job.context, this.context);
                if (!this.orderStale) { 
                    if (previousJobNewPriority !== null && newPriority < previousJobNewPriority) {
                        this.orderStale = true; 
                    }
                    previousJobNewPriority = newPriority;
                }
                job.priority = newPriority; 
            }
        }
        this.priorityStale = false;
    }
    
    /**
     * Sorts the queue based on job priority.
     * Sets `orderStale` to false after sorting.
     * Relies on the stability of `Array.prototype.sort()` for same-priority jobs.
     * @internal
     */
    private _sortQueue(): void {
        this.queue.sort((a, b) => a.priority - b.priority);
        this.orderStale = false;
    }
    
    /**
     * Finds the correct index to insert a new job to maintain sorted order.
     * Assumes the queue is currently sorted if `priorityStale` and `orderStale` are false.
     * For jobs with equal priority, new jobs are placed after existing ones.
     * @param jobToInsert The job to find an insertion index for.
     * @returns The index at which the job should be inserted.
     * @internal
     */
    private _findInsertIndex(jobToInsert: Job<TJobContext, TResult>): number {
        let low = 0, high = this.queue.length;
        while (low < high) {
            const mid = low + Math.floor((high - low) / 2);
            const midJob = this.queue[mid];
            if (jobToInsert.priority < midJob.priority) {
                high = mid;
            } else if (jobToInsert.priority > midJob.priority) {
                low = mid + 1;
            } else { // Equal priorities
                low = mid + 1; 
            }
        }
        return low;
    }
}