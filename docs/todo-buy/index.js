const VERSION = '1.0';
const STORAGE_KEY = 'todo_buy_data';
const THEME_OPTIONS = Object.freeze(['auto', 'light', 'dark']);
const THEME_COLORS = Object.freeze({ light: '#f4efe6', dark: '#000000' });

function defaultAppData() {
	return {
		version: VERSION,
		themeMode: 'auto',
		storeHistory: ['Grocery', 'Hardware Store'],
		itemHistory: { Grocery: ['Milk', 'Bread'] },
		entries: []
	};
}

function normalizeAppData(saved) {
	let defaults = defaultAppData();
	let themeMode = THEME_OPTIONS.includes(saved && saved.themeMode) ? saved.themeMode : defaults.themeMode;

	return {
		version: VERSION,
		themeMode,
		storeHistory: saved.storeHistory,
		itemHistory: saved.itemHistory,
		entries: saved.entries,
	};
}

function todoBuyApp() {
	return {
		data: {
			version: VERSION,
			themeMode: 'auto',
			storeHistory: [],
			itemHistory: {},
			entries: []
		},

		draft: {
			store: null,
			item: null,
			qty: null,
			notes: ''
		},

		state: {
			mode: 'add',
			view: 'stores',
			activeShopStore: null
		},

		themeOptions: THEME_OPTIONS,
		settingsOpen: false,
		activeOverlay: null,
		storeQuery: '',
		itemQuery: '',
		qtyInput: '',
		notesInput: '',
		saveFlash: false,
		saveFlashTimer: null,
		reorderAnimationFrame: null,
		pendingReorderPositions: new Map(),
		dragState: {
			active: false,
			pointerId: null,
			sourceKey: null,
			moved: false,
			previewEntry: null,
			previewTop: 0,
			previewLeft: 0,
			previewWidth: 0,
			offsetY: 0
		},

		isSupportedImportVersion(version) {
			return version == VERSION;
		},

		resetDraftAfterDataChange() {
			if (this.draft.store && !this.data.storeHistory.includes(this.draft.store)) {
				this.draft.store = null;
				this.draft.item = null;
			}

			if (this.draft.store && this.draft.item) {
				let itemList = (this.data.itemHistory && this.data.itemHistory[this.draft.store]) || [];
				if (!itemList.includes(this.draft.item)) this.draft.item = null;
			}

			if (!this.draft.item) {
				this.draft.qty = null;
				this.draft.notes = '';
			}

			this.state.view = 'stores';
			this.state.activeShopStore = null;
		},

		init() {
			this.loadData();
			this.state.mode = 'add';
			this.state.view = 'stores';
			this.state.activeShopStore = null;
			this.applyTheme();
			this.$watch('data.themeMode', () => {
				this.applyTheme();
				this.saveData();
			});
			window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
				this.applyTheme();
			});
		},

		loadData() {
			let raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				try {
					this.data = normalizeAppData(JSON.parse(raw));
				}
				catch (error) {
					this.data = normalizeAppData(defaultAppData());
				}
			}
			else {
				this.data = normalizeAppData(defaultAppData());
			}
			this.saveData();
		},

		saveData() {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
		},

		applyTheme() {
			let resolvedTheme = this.data.themeMode;
			if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') {
				resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
			}

			document.documentElement.setAttribute('data-theme', resolvedTheme);

			let themeColorMeta = document.querySelector('head > meta[name="theme-color"]');
			if (!themeColorMeta) {
				themeColorMeta = document.createElement('meta');
				themeColorMeta.setAttribute('name', 'theme-color');
				document.head.appendChild(themeColorMeta);
			}
			themeColorMeta.setAttribute('content', THEME_COLORS[resolvedTheme]);
		},

		handleEscape() {
			if (this.settingsOpen) {
				this.closeSettings();
				return;
			}
			this.closeOverlay();
		},

		openSettings() {
			this.resetItemDrag();
			this.closeOverlay();
			this.settingsOpen = true;
		},

		closeSettings() {
			this.settingsOpen = false;
		},

		setMode(mode) {
			this.resetItemDrag();
			this.state.mode = mode;
			this.state.view = 'stores';
			this.state.activeShopStore = null;
			this.closeOverlay();
		},

		mainActionLabel() {
			if (this.saveFlash) return 'Saved!';
			if (this.state.mode === 'shop') {
				let count = this.currentCompletionCount();
				if (count > 0) return `Complete ${count} Item${count === 1 ? '' : 's'}`;
				return 'Complete Shopping';
			}
			if (this.draft.store && this.draft.item) {
				return this.entryExistsExact(this.draft.store, this.draft.item) ? 'Update Item' : 'Add Item';
			}
			return 'Add Item';
		},

		mainActionDisabled() {
			if (this.saveFlash) return false;
			if (this.state.mode === 'shop') return this.currentCompletionCount() === 0;
			return !(this.draft.store && this.draft.item);
		},

		mainActionStyle() {
			if (this.saveFlash) {
				return {
					backgroundColor: 'var(--success)',
					color: 'var(--success-contrast)'
				};
			}
			return {};
		},

		handleMainAction() {
			if (this.state.mode === 'add') {
				this.addEntry();
				return;
			}
			this.completeShopping();
		},

		currentCompletionCount() {
			if (this.state.mode !== 'shop') return 0;
			if (this.state.view === 'items' && this.state.activeShopStore) {
				return this.markedItemCount(this.state.activeShopStore);
			}
			return this.markedItemCount();
		},

		markedItemCount(store = null) {
			return this.data.entries.filter(entry => {
				if (store && entry.store !== store) return false;
				return entry.marked === true;
			}).length;
		},

		openOverlay(type) {
			if (type === 'item' && !this.draft.store) return;
			if ((type === 'quantity' || type === 'notes') && (!this.draft.store || !this.draft.item)) return;

			this.activeOverlay = type;

			if (type === 'store') {
				this.storeQuery = '';
				this.$nextTick(() => this.$refs.inputStore && this.$refs.inputStore.focus());
			}
			if (type === 'item') {
				this.itemQuery = '';
				this.$nextTick(() => this.$refs.inputItem && this.$refs.inputItem.focus());
			}
			if (type === 'quantity') {
				this.qtyInput = (this.draft.qty === null || this.draft.qty === undefined) ? '' : String(this.draft.qty);
				this.$nextTick(() => this.$refs.inputQty && this.$refs.inputQty.focus());
			}
			if (type === 'notes') {
				this.notesInput = this.draft.notes;
				this.$nextTick(() => this.$refs.inputNotes && this.$refs.inputNotes.focus());
			}
		},

		closeOverlay() {
			this.activeOverlay = null;
		},

		promptRenameStore(name) {
			let nextName = prompt('Rename store', name);
			if (nextName === null) return;

			let trimmedName = nextName.trim();
			if (!trimmedName) {
				alert('Store name cannot be empty.');
				return;
			}

			if (trimmedName === name) return;

			this.renameStore(name, trimmedName);
			this.saveData();
		},

		promptRenameItem(name) {
			let nextName = prompt('Rename item', name);
			if (nextName === null) return;

			let trimmedName = nextName.trim();
			if (!trimmedName) {
				alert('Item name cannot be empty.');
				return;
			}

			if (trimmedName === name) return;

			this.renameItem(this.draft.store, name, trimmedName);
			this.saveData();
		},

		mergeEntryData(primaryEntry, incomingEntry) {
			return {
				...primaryEntry,
				quantity: (primaryEntry.quantity === null || primaryEntry.quantity === '') && incomingEntry.quantity !== null && incomingEntry.quantity !== ''
					? incomingEntry.quantity
					: primaryEntry.quantity,
				notes: primaryEntry.notes || incomingEntry.notes || '',
				marked: primaryEntry.marked === true || incomingEntry.marked === true
			};
		},

		dedupeEntriesForStore(store) {
			let mergedEntries = [];
			let indexesByItem = new Map();

			this.data.entries.forEach(entry => {
				if (entry.store !== store) {
					mergedEntries.push(entry);
					return;
				}

				let existingIndex = indexesByItem.get(entry.itemName);
				if (existingIndex === undefined) {
					indexesByItem.set(entry.itemName, mergedEntries.length);
					mergedEntries.push(entry);
					return;
				}

				mergedEntries[existingIndex] = this.mergeEntryData(mergedEntries[existingIndex], entry);
			});

			this.data.entries = mergedEntries;
		},

		renameStore(oldName, newName) {
			let nextStoreHistory = [];
			let replaced = false;

			this.data.storeHistory.forEach(storeName => {
				if (storeName === oldName) {
					if (!nextStoreHistory.includes(newName)) nextStoreHistory.push(newName);
					replaced = true;
					return;
				}

				if (storeName !== newName) nextStoreHistory.push(storeName);
			});

			if (!replaced && !nextStoreHistory.includes(newName)) nextStoreHistory.push(newName);
			this.data.storeHistory = nextStoreHistory;

			let previousItems = (this.data.itemHistory && this.data.itemHistory[oldName]) || [];
			let existingItems = (this.data.itemHistory && this.data.itemHistory[newName]) || [];
			this.data.itemHistory[newName] = [...new Set([...existingItems, ...previousItems])];
			if (oldName !== newName) delete this.data.itemHistory[oldName];

			this.data.entries = this.data.entries.map(entry => {
				if (entry.store !== oldName) return entry;
				return { ...entry, store: newName };
			});
			this.dedupeEntriesForStore(newName);

			if (this.draft.store === oldName) this.draft.store = newName;
			if (this.state.activeShopStore === oldName) this.state.activeShopStore = newName;
		},

		renameItem(store, oldName, newName) {
			if (!store) return;

			let itemHistory = this.data.itemHistory[store] || [];
			let nextItemHistory = [];
			let replaced = false;

			itemHistory.forEach(itemName => {
				if (itemName === oldName) {
					if (!nextItemHistory.includes(newName)) nextItemHistory.push(newName);
					replaced = true;
					return;
				}

				if (itemName !== newName) nextItemHistory.push(itemName);
			});

			if (!replaced && !nextItemHistory.includes(newName)) nextItemHistory.push(newName);
			this.data.itemHistory[store] = nextItemHistory;

			this.data.entries = this.data.entries.map(entry => {
				if (entry.store !== store || entry.itemName !== oldName) return entry;
				return { ...entry, itemName: newName };
			});
			this.dedupeEntriesForStore(store);

			if (this.draft.store === store && this.draft.item === oldName) this.draft.item = newName;
		},

		entryKey(entry) {
			return `${entry.store}::${entry.itemName}`;
		},

		isDraggingEntry(entry) {
			return this.dragState.active && this.dragState.sourceKey === this.entryKey(entry);
		},

		dragPreviewStyle() {
			return {
				top: `${this.dragState.previewTop}px`,
				left: `${this.dragState.previewLeft}px`,
				width: `${this.dragState.previewWidth}px`
			};
		},

		captureStoreRowPositions() {
			if (!this.$refs.shopItemsList) return new Map();

			return new Map(
				Array.from(this.$refs.shopItemsList.querySelectorAll('[data-entry-key]')).map(row => [
					row.dataset.entryKey,
					row.getBoundingClientRect().top
				])
			);
		},

		queueStoreReorderAnimation(previousPositions) {
			if (!previousPositions || previousPositions.size === 0) return;

			previousPositions.forEach((top, key) => {
				this.pendingReorderPositions.set(key, top);
			});

			if (this.reorderAnimationFrame !== null) return;

			this.reorderAnimationFrame = requestAnimationFrame(() => {
				this.reorderAnimationFrame = null;
				let pendingPositions = this.pendingReorderPositions;
				this.pendingReorderPositions = new Map();
				this.animateStoreReorder(pendingPositions);
			});
		},

		currentRowTranslateY(row) {
			let transform = getComputedStyle(row).transform;
			if (!transform || transform === 'none') return 0;

			let matrixMatch = transform.match(/matrix\(([^)]+)\)/);
			if (matrixMatch) {
				let values = matrixMatch[1].split(',').map(value => parseFloat(value.trim()));
				return Number.isFinite(values[5]) ? values[5] : 0;
			}

			let matrix3dMatch = transform.match(/matrix3d\(([^)]+)\)/);
			if (matrix3dMatch) {
				let values = matrix3dMatch[1].split(',').map(value => parseFloat(value.trim()));
				return Number.isFinite(values[13]) ? values[13] : 0;
			}

			return 0;
		},

		animateStoreReorder(previousPositions) {
			if (!previousPositions || previousPositions.size === 0 || !this.$refs.shopItemsList) return;

			Array.from(this.$refs.shopItemsList.querySelectorAll('[data-entry-key]')).forEach(row => {
				let key = row.dataset.entryKey;
				if (!key || (this.dragState.active && key === this.dragState.sourceKey)) return;

				let previousTop = previousPositions.get(key);
				if (previousTop === undefined) return;

				let currentTop = row.getBoundingClientRect().top;
				let nextTranslateY = this.currentRowTranslateY(row) + (previousTop - currentTop);

				row.style.transition = 'none';
				row.style.transform = Math.abs(nextTranslateY) < 0.5 ? 'translateY(0px)' : `translateY(${nextTranslateY}px)`;
				row.getBoundingClientRect();
				row.style.transition = '';
				row.style.transform = 'translateY(0px)';
			});
		},

		syncDragPreviewBounds() {
			let list = this.$refs.shopItemsList;
			if (!list) return;

			let rect = list.getBoundingClientRect();
			this.dragState.previewLeft = rect.left;
			this.dragState.previewWidth = rect.width;
		},

		startItemDrag(event, entry) {
			if (this.state.mode !== 'shop' || this.state.view !== 'items' || !this.state.activeShopStore) return;
			if (event.pointerType === 'mouse' && event.button !== 0) return;
			let row = event.currentTarget ? event.currentTarget.closest('[data-entry-key]') : null;
			if (!row) return;

			let rowRect = row.getBoundingClientRect();

			this.dragState.active = true;
			this.dragState.pointerId = event.pointerId;
			this.dragState.sourceKey = this.entryKey(entry);
			this.dragState.moved = false;
			this.dragState.previewEntry = entry;
			this.dragState.previewTop = rowRect.top;
			this.dragState.offsetY = event.clientY - rowRect.top;
			this.syncDragPreviewBounds();

			document.body.classList.add('drag-active');

			if (event.currentTarget && event.currentTarget.setPointerCapture) {
				try {
					event.currentTarget.setPointerCapture(event.pointerId);
				}
				catch (error) {
				}
			}

			event.preventDefault();
		},

		handleDragMove(event) {
			if (!this.dragState.active || event.pointerId !== this.dragState.pointerId) return;

			event.preventDefault();
			this.syncDragPreviewBounds();
			this.dragState.previewTop = event.clientY - this.dragState.offsetY;
			this.autoScrollShoppingList(event.clientY);

			let row = this.rowFromPointer(event.clientX, event.clientY);
			if (!row) return;

			let targetKey = row.dataset.entryKey;
			if (!targetKey || targetKey === this.dragState.sourceKey) return;

			let entryKeys = this.storeEntryKeys();
			let sourceIndex = entryKeys.indexOf(this.dragState.sourceKey);
			let targetIndex = entryKeys.indexOf(targetKey);
			if (sourceIndex === -1 || targetIndex === -1) return;

			let insertionIndex = targetIndex > sourceIndex ? targetIndex + 1 : targetIndex;

			let previousPositions = this.captureStoreRowPositions();
			let reordered = this.reorderActiveStoreEntry(this.dragState.sourceKey, insertionIndex);
			if (reordered) this.queueStoreReorderAnimation(previousPositions);
		},

		finishItemDrag(event) {
			if (!this.dragState.active || event.pointerId !== this.dragState.pointerId) return;

			let shouldSave = this.dragState.moved;
			this.resetItemDrag();
			if (shouldSave) this.saveData();
		},

		resetItemDrag() {
			if (!this.dragState.active && this.dragState.pointerId === null && this.dragState.sourceKey === null) return;

			this.dragState.active = false;
			this.dragState.pointerId = null;
			this.dragState.sourceKey = null;
			this.dragState.moved = false;
			this.dragState.previewEntry = null;
			this.dragState.previewTop = 0;
			this.dragState.previewLeft = 0;
			this.dragState.previewWidth = 0;
			this.dragState.offsetY = 0;
			document.body.classList.remove('drag-active');
		},

		rowFromPointer(clientX, clientY) {
			let list = this.$refs.shopItemsList;
			if (!list) return null;

			let rect = list.getBoundingClientRect();
			if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

			let styles = getComputedStyle(list);
			let gap = parseFloat(styles.rowGap || styles.gap || '0') || 0;
			let pointerY = clientY - rect.top;
			let cursorY = 0;

			for (let row of list.querySelectorAll('[data-entry-key]')) {
				let rowTop = cursorY;
				let rowBottom = rowTop + row.offsetHeight;

				if (pointerY >= rowTop && pointerY <= rowBottom) return row;

				cursorY = rowBottom + gap;
			}

			return null;
		},

		storeEntryKeys() {
			return this.shopItemsForActiveStore().map(entry => this.entryKey(entry));
		},

		autoScrollShoppingList(clientY) {
			let container = this.$refs.appContent;
			if (!container) return;

			let rect = container.getBoundingClientRect();
			let maxScrollTop = container.scrollHeight - container.clientHeight;
			if (maxScrollTop <= 0) return;

			let edge = 56;
			let step = 14;

			if (clientY < rect.top + edge) {
				container.scrollTop = Math.max(0, container.scrollTop - step);
			}
			else if (clientY > rect.bottom - edge) {
				container.scrollTop = Math.min(maxScrollTop, container.scrollTop + step);
			}
		},

		reorderActiveStoreEntry(sourceKey, targetIndex) {
			let store = this.state.activeShopStore;
			if (!store) return false;

			let storeEntries = this.data.entries.filter(entry => entry.store === store);
			let sourceIndex = storeEntries.findIndex(entry => this.entryKey(entry) === sourceKey);
			if (sourceIndex === -1) return false;

			let boundedTargetIndex = Math.max(0, Math.min(targetIndex, storeEntries.length));
			let nextIndex = boundedTargetIndex;
			if (sourceIndex < nextIndex) nextIndex -= 1;

			if (sourceIndex === nextIndex) return false;

			let reorderedStoreEntries = storeEntries.slice();
			let movedEntries = reorderedStoreEntries.splice(sourceIndex, 1);
			if (movedEntries.length === 0) return false;

			reorderedStoreEntries.splice(nextIndex, 0, movedEntries[0]);

			let storeCursor = 0;
			this.data.entries = this.data.entries.map(entry => {
				if (entry.store !== store) return entry;
				let replacement = reorderedStoreEntries[storeCursor];
				storeCursor += 1;
				return replacement;
			});

			this.dragState.moved = true;
			return true;
		},

		triggerImport() {
			if (this.$refs.importFile) {
				this.$refs.importFile.value = '';
				this.$refs.importFile.click();
			}
		},

		async handleImport(event) {
			let file = event && event.target && event.target.files ? event.target.files[0] : null;
			if (!file) return;

			try {
				let content = await file.text();
				let importedData = JSON.parse(content);
				if (!this.isSupportedImportVersion(importedData && importedData.version)) {
					throw new Error('Unsupported version');
				}
				this.data = normalizeAppData(importedData);
				this.saveData();
				this.resetDraftAfterDataChange();
				this.applyTheme();
				this.closeOverlay();
				this.closeSettings();
				alert('App data imported.');
			}
			catch (error) {
				alert('Import failed. Choose a Todo: Buy file with version 1.x.');
			}
			finally {
				if (event && event.target) event.target.value = '';
			}
		},

		exportData() {
			let stamp = new Date().toISOString().slice(0, 10);
			let payload = JSON.stringify(this.data, null, 2);
			let blob = new Blob([payload], { type: 'application/json' });
			let url = URL.createObjectURL(blob);
			let link = document.createElement('a');
			link.href = url;
			link.download = `todo-buy-data-${stamp}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		},

		confirmWipeData() {
			let ok = confirm('Wipe all saved app data? This will erase your shopping lists and history. Continue?');
			if (!ok) return;

			localStorage.removeItem(STORAGE_KEY);
			this.data = normalizeAppData(defaultAppData());
			this.saveData();
			this.resetDraftAfterDataChange();
			this.state.mode = 'add';
			this.applyTheme();
			this.closeOverlay();
			this.closeSettings();
			alert('Saved data wiped.');
		},

		filteredStores() {
			let q = this.storeQuery.toLowerCase();
			return this.data.storeHistory
				.filter(s => String(s).toLowerCase().includes(q))
				.sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }));
		},

		isStoreSelected(store) {
			return !!this.draft.store && String(this.draft.store).toLowerCase() === String(store).toLowerCase();
		},

		isStorePresent(store) {
			if (!store) return false;
			return this.data.entries.some(entry => entry.store === store);
		},

		canDeleteStore(store) {
			return !this.isStoreSelected(store) && !this.isStorePresent(store);
		},

		selectStore(name) {
			name = name.trim();
			if (!name) return;
			if (this.draft.store !== name) this.draft.item = null;
			this.draft.store = name;
			if (!this.data.storeHistory.includes(name)) {
				this.data.storeHistory.push(name);
				this.saveData();
			}
			this.closeOverlay();
		},

		deleteStore(name) {
			if (!this.canDeleteStore(name)) return;
			if (confirm(`Delete "${name}" from history?`)) {
				this.data.storeHistory = this.data.storeHistory.filter(s => s !== name);
				if (this.data.itemHistory) delete this.data.itemHistory[name];
				this.saveData();
			}
		},

		filteredItems() {
			let store = this.draft.store;
			let history = (this.data.itemHistory && store) ? (this.data.itemHistory[store] || []) : [];
			let q = this.itemQuery.toLowerCase();
			return history
				.filter(i => String(i).toLowerCase().includes(q))
				.sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }));
		},

		isItemSelected(item) {
			return !!this.draft.item && String(this.draft.item).toLowerCase() === String(item).toLowerCase();
		},

		canDeleteItem(item) {
			if (!this.draft.store || !item) return false;
			return !this.isItemPresentExact(this.draft.store, item);
		},

		isItemPresentForStore(store, itemName) {
			if (!store || !itemName) return false;
			let needle = String(itemName).toLowerCase();
			return this.data.entries.some(e => e.store === store && String(e.itemName).toLowerCase() === needle);
		},

		isItemPresentExact(store, itemName) {
			if (!store || !itemName) return false;
			return this.data.entries.some(e => e.store === store && e.itemName === itemName);
		},

		entryExistsExact(store, itemName) {
			return this.data.entries.some(e => e.store === store && e.itemName === itemName);
		},

		selectItem(name) {
			name = name.trim();
			if (!name) return;
			if (!this.draft.store) return;

			this.draft.item = name;

			if (!this.data.itemHistory[this.draft.store]) {
				this.data.itemHistory[this.draft.store] = [];
			}
			if (!this.data.itemHistory[this.draft.store].includes(name)) {
				this.data.itemHistory[this.draft.store].push(name);
				this.saveData();
			}

			this.closeOverlay();

			let existing = this.data.entries.find(e => e.store === this.draft.store && e.itemName === name);
			if (existing) {
				this.draft.qty = existing.quantity;
				this.draft.notes = existing.notes || '';
			}
			else {
				this.draft.qty = null;
				this.draft.notes = '';
			}
		},

		deleteItem(name) {
			name = name.trim();
			if (!name) return;
			let s = this.draft.store;
			if (!s) return;
			if (!this.canDeleteItem(name)) return;
			if (!this.data.itemHistory[s]) this.data.itemHistory[s] = [];
			this.data.itemHistory[s] = this.data.itemHistory[s].filter(i => i !== name);
			this.saveData();
		},

		confirmQuantity() {
			if (this.qtyInput === '') {
				this.draft.qty = null;
			}
			else {
				this.draft.qty = parseInt(this.qtyInput);
			}
			this.closeOverlay();
		},

		confirmNotes() {
			this.draft.notes = this.notesInput.trim();
			this.closeOverlay();
		},

		addEntry() {
			if (!this.draft.store || !this.draft.item) return;

			if (!this.data.itemHistory[this.draft.store]) {
				this.data.itemHistory[this.draft.store] = [];
			}
			if (!this.data.itemHistory[this.draft.store].includes(this.draft.item)) {
				this.data.itemHistory[this.draft.store].push(this.draft.item);
			}

			let idx = this.data.entries.findIndex(e => e.store === this.draft.store && e.itemName === this.draft.item);
			let newEntry = {
				store: this.draft.store,
				itemName: this.draft.item,
				quantity: this.draft.qty,
				notes: this.draft.notes,
				marked: false
			};

			if (idx > -1) {
				this.data.entries[idx] = newEntry;
			}
			else {
				this.data.entries.unshift(newEntry);
			}

			this.saveData();

			// Feedback: keep the button showing Saved!/green for ~1s.
			this.saveFlash = true;
			if (this.saveFlashTimer) clearTimeout(this.saveFlashTimer);
			this.saveFlashTimer = setTimeout(() => {
				this.saveFlash = false;
				this.saveFlashTimer = null;
			}, 1000);

			this.draft.item = null;
			this.draft.qty = null;
			this.draft.notes = '';
		},

		shopStores() {
			let stores = [...new Set(this.data.entries.map(e => e.store))];
			stores.sort((a, b) => this.storeItemCount(b) - this.storeItemCount(a));
			return stores;
		},

		storeItemCount(store) {
			return this.data.entries.filter(e => e.store === store).length;
		},

		openShopStore(store) {
			this.resetItemDrag();
			this.state.view = 'items';
			this.state.activeShopStore = store;
		},

		shopItemsForActiveStore() {
			let store = this.state.activeShopStore;
			return this.data.entries.filter(e => e.store === store);
		},

		toggleMarked(store, item) {
			let entry = this.data.entries.find(e => e.store === store && e.itemName === item);
			if (!entry) return;
			entry.marked = !entry.marked;
			this.saveData();
		},

		completeShopping() {
			if (this.state.view === 'stores') {
				if (confirm('Remove ALL items marked Done from ALL stores?')) this.executeCompletion();
				return;
			}

			let s = this.state.activeShopStore;
			if (confirm(`Remove items marked Done from ${s}?`)) this.executeCompletion(s);
		},

		executeCompletion(specificStore = null) {
			this.resetItemDrag();
			this.data.entries = this.data.entries.filter(e => {
				if (specificStore && e.store !== specificStore) return true;
				return e.marked !== true;
			});

			this.data.entries.forEach(e => {
				if (!specificStore || e.store === specificStore) e.marked = false;
			});

			this.saveData();

			let hasRemainingItems = this.data.entries.some(e => e.store === specificStore);
			if (!hasRemainingItems) {
				this.state.view = 'stores';
			}
		},

	};
}
