import {
	THEME_OPTIONS,
	createApp,
	entryKey as buildEntryKey,
	isSupportedImportVersion as supportsImportVersion,
} from './app.js';

const STORAGE_KEY = 'todo_buy_data';
const THEME_COLORS = Object.freeze({ light: '#f4efe6', dark: '#000000' });

function todoBuyViewModel() {
	return {
		model: createApp(),
		draft: {
			store: null,
			item: null,
			qty: null,
			notes: '',
		},
		state: {
			mode: 'add',
			view: 'stores',
			activeShopStore: null,
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
			offsetY: 0,
		},

		init() {
			this.restore();
			this.state.mode = 'add';
			this.state.view = 'stores';
			this.state.activeShopStore = null;
			this.applyTheme();
			this.$watch('model.themeMode', () => {
				this.applyTheme();
				this.persist();
			});
			window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
				this.applyTheme();
			});
		},

		restore() {
			let raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				this.model = createApp();
				this.persist();
				return;
			}

			try {
				this.model = createApp(JSON.parse(raw));
			}
			catch (error) {
				this.model = createApp();
			}

			this.persist();
		},

		persist() {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.model.toJSON()));
		},

		applyTheme() {
			let resolvedTheme = this.model.themeMode;
			if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') {
				resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
			}

			document.documentElement.setAttribute('data-theme', resolvedTheme);

			let themeColorMeta = document.querySelector('head > meta[name="theme-color"]');
			if (!(themeColorMeta instanceof HTMLMetaElement)) {
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

		resetDraftAfterDataChange() {
			if (this.draft.store && !this.model.hasStore(this.draft.store)) {
				this.draft.store = null;
				this.draft.item = null;
			}

			if (this.draft.store && this.draft.item) {
				let items = this.model.itemHistoryForStore(this.draft.store);
				if (!items.includes(this.draft.item)) {
					this.draft.item = null;
				}
			}

			if (!this.draft.item) {
				this.draft.qty = null;
				this.draft.notes = '';
			}

			if (this.state.activeShopStore && !this.model.hasStoreEntries(this.state.activeShopStore)) {
				this.state.activeShopStore = null;
			}

			this.state.view = 'stores';
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
			this.state.mode = mode === 'shop' ? 'shop' : 'add';
			this.state.view = 'stores';
			this.state.activeShopStore = null;
			this.closeOverlay();
		},

		goBackToStoreList() {
			this.resetItemDrag();
			this.state.view = 'stores';
			this.state.activeShopStore = null;
		},

		isAddMode() {
			return this.state.mode === 'add';
		},

		isShoppingStoresView() {
			return this.state.mode === 'shop' && this.state.view === 'stores';
		},

		isShoppingItemsView() {
			return this.state.mode === 'shop' && this.state.view === 'items';
		},

		selectedStoreLabel() {
			return this.draft.store || 'Select Store...';
		},

		selectedItemLabel() {
			return this.draft.item || 'Select Item...';
		},

		hasQuantity() {
			return this.draft.qty !== null;
		},

		quantityLabel() {
			return this.hasQuantity() ? String(this.draft.qty) : 'Tap to enter quantity...';
		},

		hasNotes() {
			return this.draft.notes.trim().length > 0;
		},

		notesLabel() {
			return this.hasNotes() ? this.draft.notes : 'Tap to add notes...';
		},

		mainActionLabel() {
			if (this.saveFlash) {
				return 'Saved!';
			}
			if (this.state.mode === 'shop') {
				let count = this.currentCompletionCount();
				return count > 0 ? `Complete ${count} Item${count === 1 ? '' : 's'}` : 'Complete Shopping';
			}
			if (this.draft.store && this.draft.item) {
				return this.model.entryExistsExact(this.draft.store, this.draft.item) ? 'Update Item' : 'Add Item';
			}
			return 'Add Item';
		},

		mainActionDisabled() {
			if (this.saveFlash) {
				return false;
			}
			if (this.state.mode === 'shop') {
				return this.currentCompletionCount() === 0;
			}
			return !(this.draft.store && this.draft.item);
		},

		mainActionStyle() {
			return this.saveFlash
				? { backgroundColor: 'var(--success)', color: 'var(--success-contrast)' }
				: {};
		},

		handleMainAction() {
			if (this.state.mode === 'add') {
				this.addEntry();
				return;
			}
			this.completeShopping();
		},

		currentCompletionCount() {
			if (this.state.mode !== 'shop') {
				return 0;
			}
			if (this.state.view === 'items' && this.state.activeShopStore) {
				return this.model.markedItemCount(this.state.activeShopStore);
			}
			return this.model.markedItemCount();
		},

		openOverlay(type) {
			if (type === 'item' && !this.draft.store) {
				return;
			}
			if ((type === 'quantity' || type === 'notes') && (!this.draft.store || !this.draft.item)) {
				return;
			}

			this.activeOverlay = type;

			if (type === 'store') {
				this.storeQuery = '';
				this.$nextTick(() => this.focusRef('inputStore'));
			}
			if (type === 'item') {
				this.itemQuery = '';
				this.$nextTick(() => this.focusRef('inputItem'));
			}
			if (type === 'quantity') {
				this.qtyInput = this.draft.qty === null ? '' : String(this.draft.qty);
				this.$nextTick(() => this.focusRef('inputQty'));
			}
			if (type === 'notes') {
				this.notesInput = this.draft.notes;
				this.$nextTick(() => this.focusRef('inputNotes'));
			}
		},

		focusRef(refName) {
			let ref = this.$refs[refName];
			if (ref instanceof HTMLElement) {
				ref.focus();
			}
		},

		closeOverlay() {
			this.activeOverlay = null;
		},

		promptRenameStore(name) {
			let nextName = prompt('Rename store', name);
			if (nextName === null) {
				return;
			}

			let trimmedName = nextName.trim();
			if (!trimmedName) {
				alert('Store name cannot be empty.');
				return;
			}

			if (trimmedName === name) {
				return;
			}

			if (this.model.renameStore(name, trimmedName)) {
				if (this.draft.store === name) {
					this.draft.store = trimmedName;
				}
				if (this.state.activeShopStore === name) {
					this.state.activeShopStore = trimmedName;
				}
				this.persist();
			}
		},

		promptRenameItem(name) {
			if (!this.draft.store) {
				return;
			}

			let nextName = prompt('Rename item', name);
			if (nextName === null) {
				return;
			}

			let trimmedName = nextName.trim();
			if (!trimmedName) {
				alert('Item name cannot be empty.');
				return;
			}

			if (trimmedName === name) {
				return;
			}

			if (this.model.renameItem(this.draft.store, name, trimmedName)) {
				if (this.draft.item === name) {
					this.draft.item = trimmedName;
				}
				this.persist();
			}
		},

		entryKey(entry) {
			return buildEntryKey(entry);
		},

		isDraggingEntry(entry) {
			return this.dragState.active && this.dragState.sourceKey === this.entryKey(entry);
		},

		dragPreviewStyle() {
			return {
				top: `${this.dragState.previewTop}px`,
				left: `${this.dragState.previewLeft}px`,
				width: `${this.dragState.previewWidth}px`,
			};
		},

		captureStoreRowPositions() {
			let list = this.$refs.shopItemsList;
			if (!(list instanceof HTMLElement)) {
				return new Map();
			}

			return new Map(
				Array.from(list.querySelectorAll('[data-entry-key]')).map((row) => [
					String(row.getAttribute('data-entry-key') || ''),
					row.getBoundingClientRect().top
				])
			);
		},

		queueStoreReorderAnimation(previousPositions) {
			if (!previousPositions || previousPositions.size === 0) {
				return;
			}

			previousPositions.forEach((top, key) => {
				this.pendingReorderPositions.set(key, top);
			});

			if (this.reorderAnimationFrame !== null) {
				return;
			}

			this.reorderAnimationFrame = requestAnimationFrame(() => {
				this.reorderAnimationFrame = null;
				let pendingPositions = this.pendingReorderPositions;
				this.pendingReorderPositions = new Map();
				this.animateStoreReorder(pendingPositions);
			});
		},

		currentRowTranslateY(row) {
			let transform = getComputedStyle(row).transform;
			if (!transform || transform === 'none') {
				return 0;
			}

			let matrixMatch = transform.match(/matrix\(([^)]+)\)/);
			if (matrixMatch) {
				let values = matrixMatch[1].split(',').map((value) => Number.parseFloat(value.trim()));
				return Number.isFinite(values[5]) ? values[5] : 0;
			}

			let matrix3dMatch = transform.match(/matrix3d\(([^)]+)\)/);
			if (matrix3dMatch) {
				let values = matrix3dMatch[1].split(',').map((value) => Number.parseFloat(value.trim()));
				return Number.isFinite(values[13]) ? values[13] : 0;
			}

			return 0;
		},

		animateStoreReorder(previousPositions) {
			let list = this.$refs.shopItemsList;
			if (!previousPositions || previousPositions.size === 0 || !(list instanceof HTMLElement)) {
				return;
			}

			Array.from(list.querySelectorAll('[data-entry-key]')).forEach((row) => {
				let key = String(row.getAttribute('data-entry-key') || '');
				if (!key || (this.dragState.active && key === this.dragState.sourceKey)) {
					return;
				}

				let previousTop = previousPositions.get(key);
				if (previousTop === undefined) {
					return;
				}

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
			if (!(list instanceof HTMLElement)) {
				return;
			}

			let rect = list.getBoundingClientRect();
			this.dragState.previewLeft = rect.left;
			this.dragState.previewWidth = rect.width;
		},

		startItemDrag(event, entry) {
			if (this.state.mode !== 'shop' || this.state.view !== 'items' || !this.state.activeShopStore) {
				return;
			}
			if (event.pointerType === 'mouse' && event.button !== 0) {
				return;
			}

			let currentTarget = event.currentTarget;
			if (!(currentTarget instanceof Element)) {
				return;
			}

			let row = currentTarget.closest('[data-entry-key]');
			if (!(row instanceof HTMLElement)) {
				return;
			}

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

			if (typeof currentTarget.setPointerCapture === 'function') {
				try {
					currentTarget.setPointerCapture(event.pointerId);
				}
				catch (error) {
				}
			}

			event.preventDefault();
		},

		handleDragMove(event) {
			if (!this.dragState.active || event.pointerId !== this.dragState.pointerId) {
				return;
			}

			event.preventDefault();
			this.syncDragPreviewBounds();
			this.dragState.previewTop = event.clientY - this.dragState.offsetY;
			this.autoScrollShoppingList(event.clientY);

			let row = this.rowFromPointer(event.clientX, event.clientY);
			if (!(row instanceof HTMLElement)) {
				return;
			}

			let targetKey = String(row.getAttribute('data-entry-key') || '');
			if (!targetKey || targetKey === this.dragState.sourceKey || !this.state.activeShopStore) {
				return;
			}

			let entryKeys = this.storeEntryKeys();
			let sourceIndex = entryKeys.indexOf(String(this.dragState.sourceKey || ''));
			let targetIndex = entryKeys.indexOf(targetKey);
			if (sourceIndex === -1 || targetIndex === -1) {
				return;
			}

			let insertionIndex = targetIndex > sourceIndex ? targetIndex + 1 : targetIndex;
			let previousPositions = this.captureStoreRowPositions();
			if (this.model.reorderStoreEntry(this.state.activeShopStore, String(this.dragState.sourceKey), insertionIndex)) {
				this.dragState.moved = true;
				this.queueStoreReorderAnimation(previousPositions);
			}
		},

		finishItemDrag(event) {
			if (!this.dragState.active || event.pointerId !== this.dragState.pointerId) {
				return;
			}

			let shouldSave = this.dragState.moved;
			this.resetItemDrag();
			if (shouldSave) {
				this.persist();
			}
		},

		resetItemDrag() {
			if (!this.dragState.active && this.dragState.pointerId === null && this.dragState.sourceKey === null) {
				return;
			}

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
			if (!(list instanceof HTMLElement)) {
				return null;
			}

			let rect = list.getBoundingClientRect();
			if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
				return null;
			}

			let styles = getComputedStyle(list);
			let gap = Number.parseFloat(styles.rowGap || styles.gap || '0') || 0;
			let pointerY = clientY - rect.top;
			let cursorY = 0;

			for (let row of list.querySelectorAll('[data-entry-key]')) {
				if (!(row instanceof HTMLElement)) {
					continue;
				}

				let rowTop = cursorY;
				let rowBottom = rowTop + row.offsetHeight;

				if (pointerY >= rowTop && pointerY <= rowBottom) {
					return row;
				}

				cursorY = rowBottom + gap;
			}

			return null;
		},

		storeEntryKeys() {
			return this.shopItemsForActiveStore().map((entry) => this.entryKey(entry));
		},

		autoScrollShoppingList(clientY) {
			let container = this.$refs.appContent;
			if (!(container instanceof HTMLElement)) {
				return;
			}

			let rect = container.getBoundingClientRect();
			let maxScrollTop = container.scrollHeight - container.clientHeight;
			if (maxScrollTop <= 0) {
				return;
			}

			let edge = 56;
			let step = 14;

			if (clientY < rect.top + edge) {
				container.scrollTop = Math.max(0, container.scrollTop - step);
			}
			else if (clientY > rect.bottom - edge) {
				container.scrollTop = Math.min(maxScrollTop, container.scrollTop + step);
			}
		},

		triggerImport() {
			let importFile = this.$refs.importFile;
			if (importFile instanceof HTMLInputElement) {
				importFile.value = '';
				importFile.click();
			}
		},

		async handleImport(event) {
			let target = event.target;
			let file = target instanceof HTMLInputElement && target.files ? target.files[0] : null;
			if (!file) {
				return;
			}

			try {
				let content = await file.text();
				let importedData = JSON.parse(content);
				if (!supportsImportVersion(importedData && importedData.version)) {
					throw new Error('Unsupported version');
				}
				this.model = createApp(importedData);
				this.persist();
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
				if (target instanceof HTMLInputElement) {
					target.value = '';
				}
			}
		},

		exportData() {
			let stamp = new Date().toISOString().slice(0, 10);
			let payload = JSON.stringify(this.model.toJSON(), null, 2);
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
			if (!confirm('Wipe all saved app data? This will erase your shopping lists and history. Continue?')) {
				return;
			}

			localStorage.removeItem(STORAGE_KEY);
			this.model = createApp();
			this.persist();
			this.resetDraftAfterDataChange();
			this.state.mode = 'add';
			this.applyTheme();
			this.closeOverlay();
			this.closeSettings();
			alert('Saved data wiped.');
		},

		trimmedStoreQuery() {
			return this.storeQuery.trim();
		},

		trimmedItemQuery() {
			return this.itemQuery.trim();
		},

		shouldShowStoreCreateOption() {
			return this.trimmedStoreQuery().length > 0;
		},

		storeCreateLabel() {
			return this.trimmedStoreQuery();
		},

		shouldShowItemCreateOption() {
			return this.trimmedItemQuery().length > 0;
		},

		itemCreateLabel() {
			return this.trimmedItemQuery();
		},

		filteredStores() {
			let query = this.storeQuery.toLowerCase();
			return this.model.storeHistory
				.filter((store) => store.toLowerCase().includes(query))
				.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
		},

		isStoreSelected(store) {
			return Boolean(this.draft.store) && String(this.draft.store).toLowerCase() === String(store).toLowerCase();
		},

		canDeleteStore(store) {
			return !this.isStoreSelected(store) && !this.model.hasStoreEntries(store);
		},

		selectStore(name) {
			let nextName = name.trim();
			if (!nextName) {
				return;
			}

			if (this.draft.store !== nextName) {
				this.draft.item = null;
				this.draft.qty = null;
				this.draft.notes = '';
			}

			let hadStore = this.model.hasStore(nextName);
			this.draft.store = nextName;
			this.model.ensureStoreHistory(nextName);
			if (!hadStore) {
				this.persist();
			}
			this.closeOverlay();
		},

		deleteStore(name) {
			if (!this.canDeleteStore(name)) {
				return;
			}

			if (confirm(`Delete "${name}" from history?`) && this.model.deleteStoreHistory(name)) {
				this.persist();
			}
		},

		filteredItems() {
			let history = this.draft.store ? this.model.itemHistoryForStore(this.draft.store) : [];
			let query = this.itemQuery.toLowerCase();
			return history
				.filter((item) => item.toLowerCase().includes(query))
				.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
		},

		isItemSelected(item) {
			return Boolean(this.draft.item) && String(this.draft.item).toLowerCase() === String(item).toLowerCase();
		},

		canDeleteItem(item) {
			return Boolean(this.draft.store && item) && !this.model.entryExistsExact(String(this.draft.store), item);
		},

		isItemPresentForStore(store, itemName) {
			return Boolean(store && itemName) && this.model.entryExistsIgnoreCase(store, itemName);
		},

		isItemPresentExact(store, itemName) {
			return Boolean(store && itemName) && this.model.entryExistsExact(store, itemName);
		},

		selectItem(name) {
			let nextName = name.trim();
			if (!nextName || !this.draft.store) {
				return;
			}

			let hadItem = this.model.itemHistoryForStore(this.draft.store).includes(nextName);
			this.draft.item = nextName;
			this.model.ensureItemHistory(this.draft.store, nextName);
			if (!hadItem) {
				this.persist();
			}

			this.closeOverlay();

			let existing = this.model.findEntry(this.draft.store, nextName);
			if (existing) {
				this.draft.qty = existing.quantity;
				this.draft.notes = existing.notes;
			}
			else {
				this.draft.qty = null;
				this.draft.notes = '';
			}
		},

		deleteItem(name) {
			let nextName = name.trim();
			if (!nextName || !this.draft.store || !this.canDeleteItem(nextName)) {
				return;
			}

			if (this.model.deleteItemHistory(this.draft.store, nextName)) {
				this.persist();
			}
		},

		confirmQuantity() {
			this.draft.qty = this.qtyInput === '' ? null : Number.parseInt(this.qtyInput, 10);
			if (Number.isNaN(this.draft.qty)) {
				this.draft.qty = null;
			}
			this.closeOverlay();
		},

		confirmNotes() {
			this.draft.notes = this.notesInput.trim();
			this.closeOverlay();
		},

		addEntry() {
			if (!this.draft.store || !this.draft.item) {
				return;
			}

			let result = this.model.addOrUpdateEntry(this.draft.store, this.draft.item, this.draft.qty, this.draft.notes);
			if (!result) {
				return;
			}

			this.persist();
			this.flashSavedState();
			this.draft.item = null;
			this.draft.qty = null;
			this.draft.notes = '';
		},

		flashSavedState() {
			this.saveFlash = true;
			if (this.saveFlashTimer) {
				clearTimeout(this.saveFlashTimer);
			}
			this.saveFlashTimer = setTimeout(() => {
				this.saveFlash = false;
				this.saveFlashTimer = null;
			}, 1000);
		},

		shopStores() {
			return this.model.shopStores();
		},

		hasShopStores() {
			return this.shopStores().length > 0;
		},

		storeItemCount(store) {
			return this.model.storeItemCount(store);
		},

		storeItemCountLabel(store) {
			let count = this.storeItemCount(store);
			return `${count} Item${count === 1 ? '' : 's'}`;
		},

		openShopStore(store) {
			this.resetItemDrag();
			this.state.view = 'items';
			this.state.activeShopStore = store;
		},

		shopItemsForActiveStore() {
			return this.state.activeShopStore ? this.model.entriesForStore(this.state.activeShopStore) : [];
		},

		activeShopStoreLabel() {
			return this.state.activeShopStore || '';
		},

		entryHasQuantity(entry) {
			return entry.quantity !== null;
		},

		entryQuantityLabel(entry) {
			return `x${entry.quantity}`;
		},

		entryHasNotes(entry) {
			return entry.notes.length > 0;
		},

		entryMarkedLabel(entry) {
			return entry.marked ? 'Undo' : 'Done';
		},

		previewEntryHasQuantity() {
			return Boolean(this.dragState.previewEntry && this.dragState.previewEntry.quantity !== null);
		},

		previewEntryQuantityLabel() {
			return this.dragState.previewEntry ? this.entryQuantityLabel(this.dragState.previewEntry) : '';
		},

		previewEntryHasNotes() {
			return Boolean(this.dragState.previewEntry && this.dragState.previewEntry.notes.length > 0);
		},

		previewEntryMarkedLabel() {
			return this.dragState.previewEntry ? this.entryMarkedLabel(this.dragState.previewEntry) : 'Done';
		},

		toggleMarked(store, item) {
			if (this.model.toggleMarked(store, item)) {
				this.persist();
			}
		},

		completeShopping() {
			if (this.state.view === 'stores') {
				if (confirm('Remove ALL items marked Done from ALL stores?')) {
					this.executeCompletion();
				}
				return;
			}

			let store = this.state.activeShopStore;
			if (store && confirm(`Remove items marked Done from ${store}?`)) {
				this.executeCompletion(store);
			}
		},

		executeCompletion(specificStore = null) {
			this.resetItemDrag();
			let removedCount = this.model.completeMarkedEntries(specificStore);
			if (removedCount === 0) {
				return;
			}

			this.persist();
			if (specificStore && this.model.storeItemCount(specificStore) === 0) {
				this.goBackToStoreList();
			}
		},

		themeSegmentStyle() {
			return {
				'--segment-count': this.themeOptions.length,
				'--segment-active': Math.max(this.themeOptions.indexOf(this.model.themeMode), 0),
			};
		},

		setThemeMode(theme) {
			this.model.setTheme(theme);
		},

		isThemeActive(theme) {
			return this.model.themeMode === theme;
		}
	};
}

window.todoBuyViewModel = todoBuyViewModel;
