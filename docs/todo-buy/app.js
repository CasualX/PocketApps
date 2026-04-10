// @ts-check

export const VERSION = '1.0';
export const THEME_OPTIONS = Object.freeze(['auto', 'light', 'dark']);

/** @typedef {'auto' | 'light' | 'dark'} Theme */

/**
 * @typedef Entry
 * @property {string} store
 * @property {string} itemName
 * @property {number | null} quantity
 * @property {string} notes
 * @property {boolean} marked
 */

/** @typedef {Record<string, string[]>} ItemHistory */

/**
 * @typedef AppState
 * @property {string} version
 * @property {Theme} themeMode
 * @property {string[]} storeHistory
 * @property {ItemHistory} itemHistory
 * @property {Entry[]} entries
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is Theme}
 */
function isTheme(value) {
	return typeof value === 'string' && THEME_OPTIONS.includes(value);
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
	return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeName(value) {
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function normalizeQuantity(value) {
	if (value === null || value === undefined || value === '') {
		return null;
	}

	if (typeof value === 'string') {
		let parsed = Number.parseInt(value.trim(), 10);
		return Number.isNaN(parsed) ? null : parsed;
	}

	if (!isFiniteNumber(value)) {
		return null;
	}

	return Math.trunc(value);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeStringList(value) {
	if (!Array.isArray(value)) {
		return [];
	}

	/** @type {string[]} */
	let normalized = [];
	for (let item of value) {
		let name = normalizeName(item);
		if (name && !normalized.includes(name)) {
			normalized.push(name);
		}
	}

	return normalized;
}

/**
 * @param {unknown} value
 * @returns {ItemHistory}
 */
function normalizeItemHistory(value) {
	if (!isPlainObject(value)) {
		return {};
	}

	/** @type {ItemHistory} */
	let normalized = {};
	for (let [storeName, items] of Object.entries(value)) {
		let normalizedStore = normalizeName(storeName);
		if (!normalizedStore) {
			continue;
		}

		let normalizedItems = normalizeStringList(items);
		if (normalizedItems.length > 0) {
			normalized[normalizedStore] = normalizedItems;
		}
	}

	return normalized;
}

/**
 * @param {unknown} value
 * @returns {Entry | null}
 */
function normalizeEntry(value) {
	if (!isPlainObject(value)) {
		return null;
	}

	let store = normalizeName(value.store);
	let itemName = normalizeName(value.itemName);
	if (!store || !itemName) {
		return null;
	}

	return {
		store,
		itemName,
		quantity: normalizeQuantity(value.quantity),
		notes: typeof value.notes === 'string' ? value.notes.trim() : '',
		marked: value.marked === true,
	};
}

/**
 * @param {unknown} value
 * @returns {Entry[]}
 */
function normalizeEntries(value) {
	if (!Array.isArray(value)) {
		return [];
	}

	/** @type {Entry[]} */
	let normalized = [];
	for (let entry of value) {
		let nextEntry = normalizeEntry(entry);
		if (nextEntry) {
			normalized.push(nextEntry);
		}
	}

	return normalized;
}

/**
 * @param {Entry} entry
 * @returns {string}
 */
export function entryKey(entry) {
	return `${entry.store}::${entry.itemName}`;
}

/**
 * @param {Entry} primaryEntry
 * @param {Entry} incomingEntry
 * @returns {Entry}
 */
export function mergeEntryData(primaryEntry, incomingEntry) {
	return {
		...primaryEntry,
		quantity: primaryEntry.quantity === null && incomingEntry.quantity !== null
			? incomingEntry.quantity
			: primaryEntry.quantity,
		notes: primaryEntry.notes || incomingEntry.notes || '',
		marked: primaryEntry.marked === true || incomingEntry.marked === true,
	};
}

/**
 * @param {Entry[]} entries
 * @returns {Entry[]}
 */
function dedupeEntries(entries) {
	/** @type {Entry[]} */
	let mergedEntries = [];
	/** @type {Map<string, number>} */
	let indexesByKey = new Map();

	for (let entry of entries) {
		let key = entryKey(entry);
		let existingIndex = indexesByKey.get(key);
		if (existingIndex === undefined) {
			indexesByKey.set(key, mergedEntries.length);
			mergedEntries.push({ ...entry });
			continue;
		}

		mergedEntries[existingIndex] = mergeEntryData(mergedEntries[existingIndex], entry);
	}

	return mergedEntries;
}

/**
 * @returns {AppState}
 */
function defaultAppState() {
	return {
		version: VERSION,
		themeMode: 'auto',
		storeHistory: ['Grocery', 'Hardware Store'],
		itemHistory: { Grocery: ['Milk', 'Bread'] },
		entries: [],
	};
}

/**
 * @param {AppState} state
 * @returns {AppState}
 */
function buildSnapshot(state) {
	return {
		version: VERSION,
		themeMode: state.themeMode,
		storeHistory: [...state.storeHistory],
		itemHistory: Object.fromEntries(
			Object.entries(state.itemHistory).map(([store, items]) => [store, [...items]])
		),
		entries: state.entries.map((entry) => ({ ...entry })),
	};
}

/**
 * @param {AppState} state
 * @returns {AppState}
 */
function finalizeNormalizedState(state) {
	let nextState = buildSnapshot(state);
	nextState.entries = dedupeEntries(nextState.entries);

	for (let entry of nextState.entries) {
		if (!nextState.storeHistory.includes(entry.store)) {
			nextState.storeHistory.push(entry.store);
		}

		let items = nextState.itemHistory[entry.store] || [];
		if (!items.includes(entry.itemName)) {
			nextState.itemHistory[entry.store] = [...items, entry.itemName];
		}
	}

	for (let store of nextState.storeHistory) {
		if (!nextState.itemHistory[store]) {
			nextState.itemHistory[store] = [];
		}
	}

	return nextState;
}

/**
 * @param {unknown} saved
 * @returns {AppState}
 */
export function normalizeAppState(saved) {
	let defaults = defaultAppState();
	let source = isPlainObject(saved) ? saved : {};

	return finalizeNormalizedState({
		version: VERSION,
		themeMode: isTheme(source.themeMode) ? source.themeMode : defaults.themeMode,
		storeHistory: normalizeStringList(source.storeHistory),
		itemHistory: normalizeItemHistory(source.itemHistory),
		entries: normalizeEntries(source.entries),
	});
}

/**
 * @param {unknown} version
 * @returns {boolean}
 */
export function isSupportedImportVersion(version) {
	return version === VERSION;
}

/**
 * @param {{ storeHistory: string[] }} model
 * @param {string} store
 * @returns {number}
 */
function findStoreEntryIndex(model, store) {
	return model.storeHistory.findIndex((value) => value === store);
}

/**
 * @param {{ entries: Entry[] }} model
 * @param {string} store
 * @param {string} itemName
 * @returns {number}
 */
function findEntryIndex(model, store, itemName) {
	return model.entries.findIndex((entry) => entry.store === store && entry.itemName === itemName);
}

/**
 * @param {unknown} [savedState]
 */
export function createApp(savedState = null) {
	let state = normalizeAppState(savedState);

	return {
		...state,

		/** @param {Partial<AppState> | null | undefined} [nextState] */
		reset(nextState = undefined) {
			Object.assign(this, normalizeAppState(nextState));
			return this;
		},

		/** @returns {AppState} */
		toJSON() {
			return buildSnapshot(this);
		},

		/**
		 * @param {Theme | string} theme
		 * @returns {Theme}
		 */
		setTheme(theme) {
			this.themeMode = isTheme(theme) ? theme : 'auto';
			return this.themeMode;
		},

		/**
		 * @param {string} store
		 * @returns {boolean}
		 */
		hasStore(store) {
			return findStoreEntryIndex(this, normalizeName(store)) !== -1;
		},

		/**
		 * @param {string} store
		 * @returns {string[]}
		 */
		itemHistoryForStore(store) {
			let normalizedStore = normalizeName(store);
			return normalizedStore ? [...(this.itemHistory[normalizedStore] || [])] : [];
		},

		/**
		 * @param {string} store
		 * @param {string} itemName
		 * @returns {Entry | null}
		 */
		findEntry(store, itemName) {
			let normalizedStore = normalizeName(store);
			let normalizedItem = normalizeName(itemName);
			if (!normalizedStore || !normalizedItem) {
				return null;
			}

			let found = this.entries.find((entry) => entry.store === normalizedStore && entry.itemName === normalizedItem);
			return found ? { ...found } : null;
		},

		/**
		 * @param {string} store
		 * @param {string} itemName
		 * @returns {boolean}
		 */
		entryExistsExact(store, itemName) {
			return findEntryIndex(this, normalizeName(store), normalizeName(itemName)) !== -1;
		},

		/**
		 * @param {string} store
		 * @param {string} itemName
		 * @returns {boolean}
		 */
		entryExistsIgnoreCase(store, itemName) {
			let normalizedStore = normalizeName(store).toLowerCase();
			let normalizedItem = normalizeName(itemName).toLowerCase();
			if (!normalizedStore || !normalizedItem) {
				return false;
			}

			return this.entries.some((entry) => entry.store.toLowerCase() === normalizedStore && entry.itemName.toLowerCase() === normalizedItem);
		},

		/**
		 * @param {string} store
		 * @returns {boolean}
		 */
		hasStoreEntries(store) {
			let normalizedStore = normalizeName(store);
			return normalizedStore ? this.entries.some((entry) => entry.store === normalizedStore) : false;
		},

		/**
		 * @param {string} store
		 * @returns {number}
		 */
		storeItemCount(store) {
			let normalizedStore = normalizeName(store);
			return normalizedStore ? this.entries.filter((entry) => entry.store === normalizedStore).length : 0;
		},

		/**
		 * @param {string | null} [store]
		 * @returns {number}
		 */
		markedItemCount(store = null) {
			let normalizedStore = normalizeName(store);
			return this.entries.filter((entry) => (!normalizedStore || entry.store === normalizedStore) && entry.marked === true).length;
		},

		/** @returns {string[]} */
		shopStores() {
			let stores = [...new Set(this.entries.map((entry) => entry.store))];
			stores.sort((left, right) => {
				let countDelta = this.storeItemCount(right) - this.storeItemCount(left);
				return countDelta !== 0 ? countDelta : left.localeCompare(right, undefined, { sensitivity: 'base' });
			});
			return stores;
		},

		/**
		 * @param {string} store
		 * @returns {Entry[]}
		 */
		entriesForStore(store) {
			let normalizedStore = normalizeName(store);
			return normalizedStore
				? this.entries.filter((entry) => entry.store === normalizedStore).map((entry) => ({ ...entry }))
				: [];
		},

		/** @param {string} store */
		ensureStoreHistory(store) {
			let normalizedStore = normalizeName(store);
			if (!normalizedStore || this.storeHistory.includes(normalizedStore)) {
				return;
			}

			this.storeHistory = [...this.storeHistory, normalizedStore];
			if (!this.itemHistory[normalizedStore]) {
				this.itemHistory = { ...this.itemHistory, [normalizedStore]: [] };
			}
		},

		/**
		 * @param {string} store
		 * @param {string} itemName
		 */
		ensureItemHistory(store, itemName) {
			let normalizedStore = normalizeName(store);
			let normalizedItem = normalizeName(itemName);
			if (!normalizedStore || !normalizedItem) {
				return;
			}

			this.ensureStoreHistory(normalizedStore);
			let nextItems = this.itemHistoryForStore(normalizedStore);
			if (!nextItems.includes(normalizedItem)) {
				nextItems.push(normalizedItem);
				this.itemHistory = { ...this.itemHistory, [normalizedStore]: nextItems };
			}
		},

		/**
		 * @param {string} store
		 * @returns {boolean}
		 */
		deleteStoreHistory(store) {
			let normalizedStore = normalizeName(store);
			if (!normalizedStore || this.hasStoreEntries(normalizedStore)) {
				return false;
			}

			if (!this.storeHistory.includes(normalizedStore)) {
				return false;
			}

			this.storeHistory = this.storeHistory.filter((value) => value !== normalizedStore);
			let nextItemHistory = { ...this.itemHistory };
			delete nextItemHistory[normalizedStore];
			this.itemHistory = nextItemHistory;
			return true;
		},

		/**
		 * @param {string} store
		 * @param {string} itemName
		 * @returns {boolean}
		 */
		deleteItemHistory(store, itemName) {
			let normalizedStore = normalizeName(store);
			let normalizedItem = normalizeName(itemName);
			if (!normalizedStore || !normalizedItem || this.entryExistsExact(normalizedStore, normalizedItem)) {
				return false;
			}

			let nextItems = this.itemHistoryForStore(normalizedStore).filter((value) => value !== normalizedItem);
			if (nextItems.length === this.itemHistoryForStore(normalizedStore).length) {
				return false;
			}

			this.itemHistory = { ...this.itemHistory, [normalizedStore]: nextItems };
			return true;
		},

		/**
		 * @param {string} store
		 * @param {string} itemName
		 * @param {number | string | null} [quantity]
		 * @param {string | null} [notes]
		 * @returns {'added' | 'updated' | null}
		 */
		addOrUpdateEntry(store, itemName, quantity = null, notes = '') {
			let normalizedStore = normalizeName(store);
			let normalizedItem = normalizeName(itemName);
			if (!normalizedStore || !normalizedItem) {
				return null;
			}

			this.ensureItemHistory(normalizedStore, normalizedItem);
			let nextEntry = {
				store: normalizedStore,
				itemName: normalizedItem,
				quantity: normalizeQuantity(quantity),
				notes: typeof notes === 'string' ? notes.trim() : '',
				marked: false,
			};

			let existingIndex = findEntryIndex(this, normalizedStore, normalizedItem);
			if (existingIndex === -1) {
				this.entries = [nextEntry, ...this.entries];
				return 'added';
			}

			let nextEntries = [...this.entries];
			nextEntries[existingIndex] = nextEntry;
			this.entries = nextEntries;
			return 'updated';
		},

		/**
		 * @param {string} store
		 * @param {string} itemName
		 * @returns {boolean}
		 */
		toggleMarked(store, itemName) {
			let normalizedStore = normalizeName(store);
			let normalizedItem = normalizeName(itemName);
			let existingIndex = findEntryIndex(this, normalizedStore, normalizedItem);
			if (existingIndex === -1) {
				return false;
			}

			let nextEntries = [...this.entries];
			nextEntries[existingIndex] = {
				...nextEntries[existingIndex],
				marked: !nextEntries[existingIndex].marked,
			};
			this.entries = nextEntries;
			return true;
		},

		/**
		 * @param {string | null} [specificStore]
		 * @returns {number}
		 */
		completeMarkedEntries(specificStore = null) {
			let normalizedStore = normalizeName(specificStore);
			let removedCount = 0;
			let remainingEntries = this.entries.filter((entry) => {
				let shouldRemove = (!normalizedStore || entry.store === normalizedStore) && entry.marked === true;
				if (shouldRemove) {
					removedCount += 1;
				}
				return !shouldRemove;
			});

			if (removedCount === 0) {
				return 0;
			}

			this.entries = remainingEntries.map((entry) => {
				if (normalizedStore && entry.store !== normalizedStore) {
					return entry;
				}
				return entry.marked ? { ...entry, marked: false } : entry;
			});
			return removedCount;
		},

		/**
		 * @param {string} oldName
		 * @param {string} newName
		 * @returns {boolean}
		 */
		renameStore(oldName, newName) {
			let normalizedOldName = normalizeName(oldName);
			let normalizedNewName = normalizeName(newName);
			if (!normalizedOldName || !normalizedNewName || normalizedOldName === normalizedNewName) {
				return false;
			}

			/** @type {string[]} */
			let nextStoreHistory = [];
			let replaced = false;
			for (let storeName of this.storeHistory) {
				if (storeName === normalizedOldName) {
					if (!nextStoreHistory.includes(normalizedNewName)) {
						nextStoreHistory.push(normalizedNewName);
					}
					replaced = true;
					continue;
				}

				if (!nextStoreHistory.includes(storeName)) {
					nextStoreHistory.push(storeName);
				}
			}

			if (!replaced && !nextStoreHistory.includes(normalizedNewName)) {
				nextStoreHistory.push(normalizedNewName);
			}

			let mergedItems = [...new Set([
				...this.itemHistoryForStore(normalizedNewName),
				...this.itemHistoryForStore(normalizedOldName),
			])];

			let nextItemHistory = { ...this.itemHistory, [normalizedNewName]: mergedItems };
			delete nextItemHistory[normalizedOldName];

			this.storeHistory = nextStoreHistory;
			this.itemHistory = nextItemHistory;
			this.entries = dedupeEntries(this.entries.map((entry) => (
				entry.store === normalizedOldName
					? { ...entry, store: normalizedNewName }
					: entry
			)));
			return true;
		},

		/**
		 * @param {string} store
		 * @param {string} oldName
		 * @param {string} newName
		 * @returns {boolean}
		 */
		renameItem(store, oldName, newName) {
			let normalizedStore = normalizeName(store);
			let normalizedOldName = normalizeName(oldName);
			let normalizedNewName = normalizeName(newName);
			if (!normalizedStore || !normalizedOldName || !normalizedNewName || normalizedOldName === normalizedNewName) {
				return false;
			}

			let itemHistory = this.itemHistoryForStore(normalizedStore);
			/** @type {string[]} */
			let nextItemHistory = [];
			let replaced = false;
			for (let itemNameValue of itemHistory) {
				if (itemNameValue === normalizedOldName) {
					if (!nextItemHistory.includes(normalizedNewName)) {
						nextItemHistory.push(normalizedNewName);
					}
					replaced = true;
					continue;
				}

				if (!nextItemHistory.includes(itemNameValue)) {
					nextItemHistory.push(itemNameValue);
				}
			}

			if (!replaced && !nextItemHistory.includes(normalizedNewName)) {
				nextItemHistory.push(normalizedNewName);
			}

			this.itemHistory = { ...this.itemHistory, [normalizedStore]: nextItemHistory };
			this.entries = dedupeEntries(this.entries.map((entry) => (
				entry.store === normalizedStore && entry.itemName === normalizedOldName
					? { ...entry, itemName: normalizedNewName }
					: entry
			)));
			return true;
		},

		/**
		 * @param {string} store
		 * @param {string} sourceKey
		 * @param {number} targetIndex
		 * @returns {boolean}
		 */
		reorderStoreEntry(store, sourceKey, targetIndex) {
			let normalizedStore = normalizeName(store);
			let normalizedSourceKey = normalizeName(sourceKey);
			if (!normalizedStore || !normalizedSourceKey) {
				return false;
			}

			let storeEntries = this.entries.filter((entry) => entry.store === normalizedStore);
			let sourceIndex = storeEntries.findIndex((entry) => entryKey(entry) === normalizedSourceKey);
			if (sourceIndex === -1) {
				return false;
			}

			let boundedTargetIndex = Math.max(0, Math.min(targetIndex, storeEntries.length));
			let nextIndex = boundedTargetIndex;
			if (sourceIndex < nextIndex) {
				nextIndex -= 1;
			}

			if (sourceIndex === nextIndex) {
				return false;
			}

			let reorderedStoreEntries = [...storeEntries];
			let movedEntries = reorderedStoreEntries.splice(sourceIndex, 1);
			if (movedEntries.length === 0) {
				return false;
			}

			reorderedStoreEntries.splice(nextIndex, 0, movedEntries[0]);

			let storeCursor = 0;
			this.entries = this.entries.map((entry) => {
				if (entry.store !== normalizedStore) {
					return entry;
				}
				let replacement = reorderedStoreEntries[storeCursor];
				storeCursor += 1;
				return replacement;
			});
			return true;
		},
	};
}
