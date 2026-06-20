export class IndexedDbDriver {
	private dbPromise: Promise<IDBDatabase> | undefined;

	constructor(
		private readonly dbName: string,
		private readonly version: number,
		private readonly onUpgrade: (
			db: IDBDatabase,
			transaction: IDBTransaction,
			oldVersion: number,
		) => void,
	) {}

	open(): Promise<IDBDatabase> {
		if (!this.dbPromise) {
			this.dbPromise = new Promise((resolve, reject) => {
				const request = indexedDB.open(this.dbName, this.version);
				request.onerror = () => {
					reject(request.error ?? new Error("Failed to open IndexedDB"));
				};
				request.onupgradeneeded = (event) => {
					const database = request.result;
					const transaction = request.transaction;
					if (!transaction) {
						reject(new Error("IndexedDB upgrade transaction missing"));
						return;
					}
					this.onUpgrade(database, transaction, event.oldVersion);
				};
				request.onsuccess = () => {
					resolve(request.result);
				};
			});
		}
		return this.dbPromise;
	}
}
