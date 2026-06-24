interface MapItem<TData, TId> {
	id: TId; // Unique identifier for the item
	data: TData; // Your actual data payload
	prev: TId | null; // ID of previous item (not direct reference)
	next: TId | null; // ID of next item
}

export class LinkedMap<TData, TId = string> {
	private items = new Map<TId, MapItem<TData, TId>>(); // Hash map for O(1) lookups
	private head: TId | null = null; // ID of first item
	private tail: TId | null = null; // ID of last item

	// Add a new item to the list (or update if exists)
	addItem(item: MapItem<TData, TId>): void {
		this.items.set(item.id, item);

		// Initialize head/tail for first item
		if (this.items.size === 1) {
			this.head = this.tail = item.id;
			return;
		}

		// Update pointers of neighbors
		if (item.prev) {
			const prevItem = this.items.get(item.prev);
			if (prevItem) prevItem.next = item.id;
		}
		if (item.next) {
			const nextItem = this.items.get(item.next);
			if (nextItem) nextItem.prev = item.id;
		}

		// Update head/tail if needed
		if (!item.prev) this.head = item.id;
		if (!item.next) this.tail = item.id;
	}

	// Insert a new item AFTER a specific existing item
	insertAfter(newItemId: TId, newItemData: TData, afterId: TId): void {
		const refItem = this.items.get(afterId);
		if (!refItem) throw new Error("Reference item not found");

		const newItem: MapItem<TData, TId> = {
			id: newItemId,
			data: newItemData,
			prev: afterId,
			next: refItem.next,
		};

		// Update neighbor pointers
		if (refItem.next) {
			const nextItem = this.items.get(refItem.next)!;
			nextItem.prev = newItemId;
		} else {
			this.tail = newItemId; // New item is now the tail
		}

		refItem.next = newItemId;
		this.items.set(newItemId, newItem);
	}

	// Insert a new item BEFORE a specific existing item
	/** @mangle-force */
	insertBefore(newItemId: TId, newItemData: TData, beforeId: TId): void {
		const refItem = this.items.get(beforeId);
		if (!refItem) throw new Error("Reference item not found");

		const newItem: MapItem<TData, TId> = {
			id: newItemId,
			data: newItemData,
			prev: refItem.prev,
			next: beforeId,
		};

		// Update neighbor pointers
		if (refItem.prev) {
			const prevItem = this.items.get(refItem.prev)!;
			prevItem.next = newItemId;
		} else {
			this.head = newItemId; // New item is now the head
		}

		refItem.prev = newItemId;
		this.items.set(newItemId, newItem);
	}

	static fromArray<TSrc, TData, TId>(
		srcData: TSrc[],
		idSelector: (item: TSrc) => TId,
		dataSelector: (item: TSrc) => TData,
	): LinkedMap<TData, TId> {
		const instance = new LinkedMap<TData, TId>();

		for (let i = 0; i < srcData.length; i++) {
			const id = idSelector(srcData[i]);
			const prev = i > 0 ? idSelector(srcData[i - 1]) : null;
			const next = i < srcData.length - 1 ? idSelector(srcData[i + 1]) : null;

			instance.addItem({
				id,
				data: dataSelector(srcData[i]),
				prev,
				next,
			});
		}

		return instance;
	}

	// Get the full list in order (O(n))
	/** @mangle-force */
	toArray(): TData[] {
		const result: TData[] = [];
		let currentId = this.head;

		while (currentId) {
			const item = this.items.get(currentId)!;
			result.push(item.data);
			currentId = item.next;
		}

		return result;
	}

	// Optional: Get item by ID (O(1))
	getById(id: TId): MapItem<TData, TId> | undefined {
		return this.items.get(id);
	}

	// Add to your LinkedMap class:

	/**
	 * Updates ONLY the data of an existing item without modifying list structure.
	 * @param id ID of the item to update
	 * @param newData New data payload
	 * @returns true if updated, false if item doesn't exist
	 */
	updateData(id: TId, newData: TData): boolean {
		const item = this.items.get(id);
		if (!item) return false;

		this.items.set(id, {
			id: item.id,
			data: newData,
			prev: item.prev,
			next: item.next,
		});

		return true;
	}

	/**
	 * Update item data using a transformation function (recommended for immutability).
	 */
	updateItem(id: TId, updateFn: (current: TData) => TData): boolean {
		const item = this.items.get(id);
		if (!item) return false;

		this.items.set(id, {
			...item,
			data: updateFn(item.data),
		});

		return true;
	}
}
