import {
	CURRENT_WINDOW_DAYS,
	MONTH_LABELS,
	THEME_OPTIONS,
	WEEKDAY_NAMES,
	createApp,
	createDefaultRule,
	createDefaultTemplateDraft,
	createDemoAppState,
	createId,
	createRecurrenceDescription,
	hasChecklist,
	isoDateToDate,
	isoDateToDayNumber,
	isInstanceResolved,
	migrateAppState,
	normalizeRule,
	suggestGenerationWindowDays,
	suggestRuleStartDate,
	todayDayNumber,
	todayIsoDate,
} from './app.js';

const STORAGE_KEY = 'upkeep-data';
const DEMO_HASH = '#demo';
const THEME_COLORS = Object.freeze({ light: '#f3ecdf', dark: '#141311' });
let transparentDragImage = null;

function deepCopy(value) {
	return JSON.parse(JSON.stringify(value));
}

function createStorage() {
	let demoMode = window.location.hash === DEMO_HASH;

	return {
		locked: demoMode,

		load() {
			if (demoMode) {
				return createApp(createDemoAppState());
			}

			let raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return createApp();
			}

			try {
				return createApp(migrateAppState(JSON.parse(raw)));
			}
			catch (error) {
				return createApp();
			}
		},

		save(model) {
			if (demoMode) {
				return;
			}
			localStorage.setItem(STORAGE_KEY, JSON.stringify(model.toJSON()));
		},

		clear() {
			if (demoMode) {
				return;
			}
			localStorage.removeItem(STORAGE_KEY);
		}
	};
}

function watchSystemThemeChange(callback) {
	let mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	let handler = () => {
		callback();
	};

	if (typeof mediaQuery.addEventListener === 'function') {
		mediaQuery.addEventListener('change', handler);
	}
	else if (typeof mediaQuery.addListener === 'function') {
		mediaQuery.addListener(handler);
	}

	return mediaQuery;
}

function clampWholeNumber(value, min, max, fallback) {
	let number = Number(value);
	if (!Number.isFinite(number)) {
		return fallback;
	}
	return Math.max(min, Math.min(max, Math.round(number)));
}

function isIsoDateString(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function createBlankTemplateDraft() {
	let draft = createDefaultTemplateDraft();
	draft.recurrence = [];
	draft.generationWindowDays = suggestGenerationWindowDays([]);
	return draft;
}

function createChecklistDraftItem() {
	return {
		id: createId('item'),
		label: '',
		isDraft: true,
	};
}

function createChecklistEditorItems(items = []) {
	let normalized = [];
	let hasDraft = false;

	items.forEach(item => {
		if (!item || typeof item !== 'object') {
			return;
		}

		let normalizedItem = {
			id: String(item.id || createId('item')),
			label: String(item.label || ''),
			isDraft: Boolean(item.isDraft),
		};

		if (normalizedItem.isDraft) {
			if (hasDraft) {
				return;
			}
			hasDraft = true;
		}

		normalized.push(normalizedItem);
	});

	if (!hasDraft) {
		normalized.push(createChecklistDraftItem());
	}

	return normalized;
}

function createChecklistDragState() {
	return {
		activeId: null,
		targetId: null,
	};
}

function getTransparentDragImage() {
	if (transparentDragImage) {
		return transparentDragImage;
	}

	let image = document.createElement('div');
	image.setAttribute('aria-hidden', 'true');
	image.style.position = 'fixed';
	image.style.top = '-9999px';
	image.style.left = '-9999px';
	image.style.width = '1px';
	image.style.height = '1px';
	image.style.opacity = '0';
	image.style.pointerEvents = 'none';
	document.body.appendChild(image);
	transparentDragImage = image;
	return transparentDragImage;
}

function createRuleEditorState() {
	return {
		open: false,
		mode: 'create',
		ruleId: null,
		draft: createDefaultRule(),
		referenceDate: todayIsoDate(),
		advancedOpen: false,
	};
}

function ensureRuleDraftShape(rule) {
	if (!rule || typeof rule !== 'object') {
		return createDefaultRule();
	}

	rule.id = String(rule.id || createId('rule'));
	rule.type = ['daily', 'weekly', 'monthly', 'yearly'].includes(String(rule.type)) ? String(rule.type) : 'weekly';
	rule.interval = clampWholeNumber(rule.interval, 1, 365, 1);

	if (rule.type === 'weekly') {
		rule.day = WEEKDAY_NAMES.includes(String(rule.day)) ? String(rule.day) : 'Monday';
	}

	if (rule.type === 'monthly') {
		rule.mode = rule.mode === 'weekday_position' ? 'weekday_position' : 'day_of_month';
		rule.day = clampWholeNumber(rule.day, 1, 31, 1);
		rule.ordinal = [1, 2, 3, 4, -1].includes(Number(rule.ordinal)) ? Number(rule.ordinal) : 1;
		rule.weekday = WEEKDAY_NAMES.includes(String(rule.weekday)) ? String(rule.weekday) : 'Monday';
	}

	if (rule.type === 'yearly') {
		rule.month = clampWholeNumber(rule.month, 1, 12, 1);
		rule.day = clampWholeNumber(rule.day, 1, 31, 1);
	}

	return rule;
}

function createRuleDraft(type, sourceRule = null) {
	let draft = sourceRule ? deepCopy(sourceRule) : createDefaultRule();
	draft.id = createId('rule');
	draft.type = type;
	return ensureRuleDraftShape(draft);
}

function summarizeDays(value) {
	if (value <= 0) {
		return 'the same day';
	}
	if (value === 1) {
		return '1 day early';
	}
	return `${value} days early`;
}

function upkeepViewModel() {
	let storage = createStorage();

	return {
		model: createApp(),
		storageLocked: storage.locked,
		viewOptions: ['active', 'templates'],
		themeOptions: THEME_OPTIONS,
		settingsOpen: false,
		ui: {
			view: 'active',
			openTaskIds: [],
		},
		saveFeedback: {
			open: false,
			message: '',
		},
		saveFeedbackTimer: null,
		editor: {
			open: false,
			mode: 'create',
			template: {
				...createBlankTemplateDraft(),
				items: createChecklistEditorItems(),
			},
			ruleEditor: createRuleEditorState(),
			windowMode: 'auto',
			advancedTimingOpen: false,
		},
		checklistDrag: createChecklistDragState(),
		recurrenceTypes: [
			{ value: 'daily', label: 'Daily' },
			{ value: 'weekly', label: 'Weekly' },
			{ value: 'monthly', label: 'Monthly' },
			{ value: 'yearly', label: 'Yearly' }
		],
		weekdayOptions: WEEKDAY_NAMES.map(day => ({ value: day, label: day })),
		ordinalOptions: [
			{ value: 1, label: 'First' },
			{ value: 2, label: 'Second' },
			{ value: 3, label: 'Third' },
			{ value: 4, label: 'Fourth' },
			{ value: -1, label: 'Last' }
		],
		monthOptions: MONTH_LABELS.map((label, index) => ({ value: index + 1, label })),

		isSupportedImportVersion(version) {
			return typeof version === 'string' && /^1\./.test(version);
		},

		init() {
			this.model = storage.load();
			this.model.syncGeneratedInstances();
			this.pruneOpenTasks();
			this.persistSnapshot();
			this.applyTheme();

			this.$watch('model.themeMode', () => {
				this.applyTheme();
				this.persistSnapshot();
			});

			watchSystemThemeChange(() => {
				this.applyTheme();
			});
		},

		persist() {
			this.model.syncGeneratedInstances();
			this.pruneOpenTasks();
			this.persistSnapshot();
		},

		persistSnapshot() {
			this.model.setLastOpenedDate();
			storage.save(this.model);
		},

		showSaveFeedback(message) {
			if (this.saveFeedbackTimer) {
				window.clearTimeout(this.saveFeedbackTimer);
			}

			this.saveFeedback.open = true;
			this.saveFeedback.message = message;

			this.saveFeedbackTimer = window.setTimeout(() => {
				this.saveFeedback.open = false;
			}, 2800);
		},

		resolvedTheme() {
			if (this.model.themeMode === 'light' || this.model.themeMode === 'dark') {
				return this.model.themeMode;
			}
			return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		},

		applyTheme() {
			let resolvedTheme = this.resolvedTheme();
			document.documentElement.setAttribute('data-theme', resolvedTheme);

			let themeColorMeta = document.querySelector('head > meta[name="theme-color"]');
			if (!themeColorMeta) {
				themeColorMeta = document.createElement('meta');
				themeColorMeta.setAttribute('name', 'theme-color');
				document.head.appendChild(themeColorMeta);
			}
			themeColorMeta.setAttribute('content', THEME_COLORS[resolvedTheme]);
		},

		todayHeaderLabel() {
			return new Date().toLocaleDateString(undefined, {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
			});
		},

		viewLabel(viewName) {
			return viewName === 'active' ? 'Active' : 'Templates';
		},

		themeLabel(theme) {
			if (theme === 'auto') return 'Auto';
			if (theme === 'light') return 'Light';
			return 'Dark';
		},

		setTheme(theme) {
			this.model.setTheme(theme);
		},

		setView(viewName) {
			this.ui.view = viewName === 'templates' ? 'templates' : 'active';
		},

		isTaskOpen(instanceId) {
			return this.ui.openTaskIds.includes(instanceId);
		},

		toggleTaskOpen(instanceId) {
			if (this.isTaskOpen(instanceId)) {
				this.ui.openTaskIds = this.ui.openTaskIds.filter(id => id !== instanceId);
				return;
			}

			this.ui.openTaskIds = [...this.ui.openTaskIds, instanceId];
		},

		pruneOpenTasks() {
			let visibleIds = new Set(this.visibleInstances.map(instance => instance.id));
			this.ui.openTaskIds = this.ui.openTaskIds.filter(id => visibleIds.has(id));
		},

		handleEscape() {
			if (this.editor.ruleEditor.open) {
				this.closeRuleEditor();
				return;
			}

			if (this.editor.open) {
				this.closeTemplateEditor();
				return;
			}

			if (this.settingsOpen) {
				this.closeSettings();
			}
		},

		openSettings() {
			this.editor.open = false;
			this.settingsOpen = true;
		},

		closeSettings() {
			this.settingsOpen = false;
		},

		triggerImport() {
			if (this.$refs.importFile) {
				this.$refs.importFile.value = '';
				this.$refs.importFile.click();
			}
		},

		async handleImport(event) {
			let file = event && event.target && event.target.files ? event.target.files[0] : null;
			if (!file) {
				return;
			}

			try {
				let content = await file.text();
				let importedData = JSON.parse(content);
				if (!this.isSupportedImportVersion(importedData && importedData.version)) {
					throw new Error('Unsupported version');
				}

				this.model.reset(importedData);
				this.model.syncGeneratedInstances();
				this.pruneOpenTasks();
				this.persistSnapshot();
				this.applyTheme();
				this.closeTemplateEditor();
				this.closeSettings();
				alert('App data imported.');
			}
			catch (error) {
				alert('Import failed. Choose an Upkeep file with version 1.x.');
			}
			finally {
				if (event && event.target) {
					event.target.value = '';
				}
			}
		},

		exportData() {
			let stamp = todayIsoDate();
			let payload = JSON.stringify(this.model.toJSON(), null, 2);
			let blob = new Blob([payload], { type: 'application/json' });
			let url = URL.createObjectURL(blob);
			let link = document.createElement('a');
			link.href = url;
			link.download = `upkeep-data-${stamp}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		},

		confirmWipeData() {
			let ok = confirm('Wipe all saved app data? This will erase your templates, generated tasks, and settings. Continue?');
			if (!ok) {
				return;
			}

			storage.clear();
			this.model.reset();
			this.ui.view = 'active';
			this.ui.openTaskIds = [];
			this.setEditorTemplate(createBlankTemplateDraft());
			this.editor.ruleEditor = createRuleEditorState();
			this.editor.windowMode = 'auto';
			this.applyTheme();
			this.closeTemplateEditor();
			this.closeSettings();
			this.persistSnapshot();
			alert('Saved data wiped.');
		},

		templateForInstance(instance) {
			return this.model.templateById(instance.templateId) || {
				title: 'Untitled task',
				recurrence: [],
			};
		},

		templateRuleSummary(template) {
			if (!template || !Array.isArray(template.recurrence) || template.recurrence.length === 0) {
				return 'No recurrence rules yet';
			}
			return template.recurrence.map(createRecurrenceDescription).join(' • ');
		},

		describeRule(rule) {
			return createRecurrenceDescription(rule);
		},

		formatDate(value, options) {
			return isoDateToDate(value).toLocaleDateString(undefined, options);
		},

		formatDateTime(value) {
			return new Date(value).toLocaleString(undefined, {
				month: 'long',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
			});
		},

		formatDueLabel(dueDate) {
			let diff = isoDateToDayNumber(dueDate) - todayDayNumber();
			let relative = 'Due ';
			if (diff === 0) {
				relative += 'today';
			}
			else if (diff === 1) {
				relative += 'tomorrow';
			}
			else if (diff === -1) {
				relative += 'yesterday';
			}
			else if (diff < 0) {
				relative += `${Math.abs(diff)} days ago`;
			}
			else {
				relative += `in ${diff} days`;
			}

			return `${relative} · ${this.formatDate(dueDate, { weekday: 'long', month: 'long', day: 'numeric' })}`;
		},

		formatTaskDateLabel(instance) {
			if (instance.completedAt) {
				return `Completed ${this.formatDateTime(instance.completedAt)}`;
			}

			return this.formatDueLabel(instance.dueDate);
		},

		groupKeyForInstance(instance) {
			let diff = isoDateToDayNumber(instance.dueDate) - todayDayNumber();
			if (diff < 0) {
				return 'overdue';
			}
			if (diff < CURRENT_WINDOW_DAYS) {
				return 'current';
			}
			return 'upcoming';
		},

		taskCardClasses(instance) {
			return {
				overdue: this.groupKeyForInstance(instance) === 'overdue',
				current: this.groupKeyForInstance(instance) === 'current',
				upcoming: this.groupKeyForInstance(instance) === 'upcoming',
				resolved: Boolean(instance.completedAt),
			};
		},

		itemButtonClasses(instance, item) {
			return {
				complete: item.state === 1,
				locked: isInstanceResolved(instance),
			};
		},

		itemCheckboxClasses(instance, item) {
			return {
				complete: item.state === 1,
				pending: item.state === 0,
				locked: isInstanceResolved(instance),
			};
		},

		isInstanceResolved(instance) {
			return isInstanceResolved(instance);
		},

		hasChecklist(instance) {
			return hasChecklist(instance);
		},

		toggleInstanceItem(instanceId, itemId) {
			if (!this.model.toggleInstanceItem(instanceId, itemId)) {
				return;
			}
			this.persist();
		},

		completeInstance(instanceId) {
			if (!this.model.completeInstance(instanceId)) {
				return;
			}
			this.persist();
		},

		toggleSingleActionInstance(instanceId) {
			if (!this.model.toggleSingleActionInstance(instanceId)) {
				return;
			}
			this.persist();
		},

		openTemplateEditor(templateId = null) {
			this.closeSettings();

			if (!templateId) {
				this.editor.mode = 'create';
				this.setEditorTemplate(createBlankTemplateDraft());
				this.editor.windowMode = 'auto';
			}
			else {
				let template = this.model.templateById(templateId);
				if (!template) {
					return;
				}

				this.editor.mode = 'edit';
				this.setEditorTemplate(deepCopy(template));
				this.editor.windowMode = this.isAutomaticGenerationWindow(template) ? 'auto' : 'custom';
			}

			this.resetChecklistDragState();
			this.editor.ruleEditor = createRuleEditorState();
			this.editor.advancedTimingOpen = false;
			this.editor.open = true;
			this.$nextTick(() => {
				if (this.$refs.templateTitle) {
					this.$refs.templateTitle.focus();
				}
			});
		},

		closeTemplateEditor() {
			this.resetChecklistDragState();
			this.editor.ruleEditor = createRuleEditorState();
			this.editor.open = false;
		},

		setEditorTemplate(template) {
			this.editor.template = {
				...template,
				items: createChecklistEditorItems(template && Array.isArray(template.items) ? template.items : []),
			};
		},

		resetChecklistDragState() {
			this.checklistDrag = createChecklistDragState();
		},

		reorderChecklistItems(activeId, nextIndex) {
			let currentItems = [...this.editor.template.items];
			let currentIndex = currentItems.findIndex(item => item.id === activeId);
			if (currentIndex === -1) {
				return;
			}

			let insertionIndex = Math.max(0, Math.min(nextIndex, currentItems.length - 1));

			if (currentIndex === insertionIndex) {
				return;
			}

			let [activeItem] = currentItems.splice(currentIndex, 1);
			currentItems.splice(insertionIndex, 0, activeItem);
			this.editor.template.items = currentItems;
		},

		startChecklistDrag(event, itemId) {
			let transfer = event.dataTransfer;
			if (!transfer) {
				return;
			}

			this.resetChecklistDragState();
			this.checklistDrag.activeId = itemId;
			transfer.effectAllowed = 'move';
			transfer.dropEffect = 'move';
			transfer.setData('text/plain', itemId);
			transfer.setDragImage(getTransparentDragImage(), 0, 0);
		},

		setChecklistDropTarget(itemId) {
			if (!this.checklistDrag.activeId) {
				return;
			}

			let targetIndex = this.editor.template.items.findIndex(item => item.id === itemId);
			if (targetIndex === -1) {
				return;
			}

			this.checklistDrag.targetId = itemId;
		},

		handleChecklistDrop(event, itemId = this.checklistDrag.targetId) {
			if (!this.checklistDrag.activeId) {
				return;
			}

			event.preventDefault();
			let targetIndex = this.editor.template.items.findIndex(item => item.id === itemId);
			if (targetIndex !== -1) {
				this.reorderChecklistItems(this.checklistDrag.activeId, targetIndex);
			}
			this.resetChecklistDragState();
		},

		finishChecklistDrag() {
			if (!this.checklistDrag.activeId) {
				return;
			}

			this.resetChecklistDragState();
		},

		checklistItemClasses(item) {
			return {
				'is-draft': item.isDraft,
				'is-dragging': this.checklistDrag.activeId === item.id,
				'is-drop-target': this.checklistDrag.targetId === item.id && this.checklistDrag.activeId !== item.id,
			};
		},

		confirmChecklistItem(itemId) {
			let items = [...this.editor.template.items];
			let index = items.findIndex(item => item.id === itemId);
			if (index === -1) {
				return;
			}

			let item = items[index];
			let label = String(item.label || '').trim();
			items[index] = {
				...item,
				label,
			};

			if (!item.isDraft || !label) {
				this.editor.template.items = items;
				return;
			}

			items[index] = {
				...items[index],
				isDraft: false,
			};
			items.push(createChecklistDraftItem());
			this.editor.template.items = items;
		},

		beginNewRule(type = 'weekly') {
			let previousRule = this.editor.template.recurrence[this.editor.template.recurrence.length - 1] || null;
			this.editor.ruleEditor = {
				open: true,
				mode: 'create',
				ruleId: null,
				draft: createRuleDraft(type, previousRule),
				referenceDate: todayIsoDate(),
				advancedOpen: false,
			};
		},

		editRule(ruleId) {
			let rule = this.editor.template.recurrence.find(entry => entry.id === ruleId);
			if (!rule) {
				return;
			}

			this.editor.ruleEditor = {
				open: true,
				mode: 'edit',
				ruleId,
				draft: ensureRuleDraftShape(deepCopy(rule)),
				referenceDate: isIsoDateString(rule.startsOn) ? rule.startsOn : (this.editor.template.createdAt || todayIsoDate()),
				advancedOpen: false,
			};
		},

		closeRuleEditor() {
			this.editor.ruleEditor = createRuleEditorState();
		},

		setRuleDraftType(type) {
			this.editor.ruleEditor.draft.type = type;
			ensureRuleDraftShape(this.editor.ruleEditor.draft);
		},

		setRuleDraftMonthlyMode(mode) {
			this.editor.ruleEditor.draft.mode = mode;
			ensureRuleDraftShape(this.editor.ruleEditor.draft);
		},

		saveRuleDraft() {
			let normalized = normalizeRule(this.editor.ruleEditor.draft);
			if (!normalized) {
				alert('Choose how often this should happen.');
				return;
			}

			if (normalized.interval > 1) {
				if (!isIsoDateString(this.editor.ruleEditor.referenceDate)) {
					alert('Choose a start date for repeating intervals greater than 1.');
					return;
				}

				normalized.startsOn = suggestRuleStartDate(normalized, this.editor.ruleEditor.referenceDate);
			}
			else if (normalized.startsOn) {
				delete normalized.startsOn;
			}

			if (this.editor.ruleEditor.mode === 'edit' && this.editor.ruleEditor.ruleId) {
				this.editor.template.recurrence = this.editor.template.recurrence.map(rule => {
					return rule.id === this.editor.ruleEditor.ruleId ? normalized : rule;
				});
			}
			else {
				this.editor.template.recurrence = [...this.editor.template.recurrence, normalized];
			}

			this.closeRuleEditor();
		},

		removeRule(ruleId) {
			this.editor.template.recurrence = this.editor.template.recurrence.filter(rule => rule.id !== ruleId);
			if (this.editor.ruleEditor.ruleId === ruleId) {
				this.closeRuleEditor();
			}
		},

		removeChecklistItem(itemId) {
			this.editor.template.items = createChecklistEditorItems(this.editor.template.items.filter(item => item.id !== itemId));
			if (this.checklistDrag.activeId === itemId) {
				this.resetChecklistDragState();
			}
		},

		setGenerationWindowMode(mode) {
			this.editor.windowMode = mode === 'custom' ? 'custom' : 'auto';
			if (this.editor.windowMode === 'custom') {
				this.editor.template.generationWindowDays = this.effectiveGenerationWindow;
			}
		},

		isAutomaticGenerationWindow(template) {
			if (!template) {
				return true;
			}
			return clampWholeNumber(template.generationWindowDays, 0, 365, suggestGenerationWindowDays(template.recurrence)) === suggestGenerationWindowDays(template.recurrence);
		},

		buildEditorTemplatePayload() {
			let items = this.editor.template.items
				.map(item => ({
					id: item.id || createId('item'),
					label: String(item.label || '').trim(),
				}))
				.filter(item => item.label.length > 0);

			let recurrence = this.editor.template.recurrence.map(rule => normalizeRule(rule)).filter(Boolean);

			return {
				id: this.editor.template.id || createId('tpl'),
				title: String(this.editor.template.title || '').trim(),
				recurrence,
				items,
				generationWindowDays: this.effectiveGenerationWindow,
			};
		},

		saveTemplate() {
			let templatePayload = this.buildEditorTemplatePayload();
			let feedbackMessage = '';

			try {
				if (this.editor.mode === 'edit') {
					this.model.updateTemplate(templatePayload.id, templatePayload);
					feedbackMessage = `Updated ${templatePayload.title}`;
				}
				else {
					this.model.createTemplate(templatePayload);
					feedbackMessage = `Created ${templatePayload.title}`;
				}
			}
			catch (error) {
				alert(error instanceof Error ? error.message : 'Could not save the template.');
				return;
			}

			this.persist();
			this.editor.open = false;
			this.ui.view = 'templates';
			this.showSaveFeedback(feedbackMessage);
		},

		deleteTemplate(templateId) {
			let template = this.model.templateById(templateId);
			if (!template) {
				return;
			}
			if (!confirm(`Delete "${template.title}" and its generated tasks?`)) {
				return;
			}

			this.model.deleteTemplate(templateId);
			this.persist();
			this.editor.open = false;
		},

		themeSegmentStyle() {
			return {
				'--segment-count': this.themeOptions.length,
				'--segment-active': Math.max(this.themeOptions.indexOf(this.model.themeMode), 0),
			};
		},

		expandShellStyle(open, expandInner) {
			if (!open || !expandInner) {
				return 'max-height: 0px';
			}
			return `max-height: ${expandInner.scrollHeight}px`;
		},

		constructionStepClasses(stepName) {
			let titleReady = this.editorTitleTrimmed.length > 0;
			let recurrenceReady = this.editor.template.recurrence.length > 0;
			let muted = false;

			if (stepName === 'recurrence') {
				muted = !titleReady;
			}
			else if (stepName === 'checklist' || stepName === 'timing' || stepName === 'submit') {
				muted = !titleReady || !recurrenceReady;
			}

			if (this.editor.ruleEditor.open && stepName !== 'recurrence') {
				muted = true;
			}

			return {
				muted,
				complete: (stepName === 'title' && titleReady) || (stepName === 'recurrence' && recurrenceReady),
				active: stepName === 'recurrence' && this.editor.ruleEditor.open,
			};
		},

		ruleCardMeta(rule) {
			if (rule.interval <= 1) {
				return '';
			}

			if (isIsoDateString(rule.startsOn)) {
				return `Counting from ${this.formatDate(rule.startsOn, { month: 'short', day: 'numeric', year: 'numeric' })}`;
			}

			return '';
		},

		ruleEditorStartLabel() {
			if (this.editor.ruleEditor.draft.interval <= 1) {
				return 'Not used for every 1';
			}

			let effectiveDate = this.ruleEditorEffectiveStartDate;
			return `First due on ${this.formatDate(effectiveDate, { month: 'short', day: 'numeric', year: 'numeric' })}`;
		},

		ruleEditorStartHint() {
			if (this.editor.ruleEditor.draft.interval <= 1) {
				return 'Only used when repeat is greater than 1.';
			}

			return this.ruleEditorStartLabel();
		},

		ruleEditorPreview() {
			let normalized = normalizeRule(this.editor.ruleEditor.draft);
			if (!normalized) {
				return 'Choose how often this should happen.';
			}

			let summary = createRecurrenceDescription(normalized);
			if (normalized.interval <= 1) {
				return summary;
			}

			let startDate = this.ruleEditorEffectiveStartDate;
			return `${summary} · starts ${this.formatDate(startDate, { month: 'short', day: 'numeric' })}`;
		},

		generationWindowSummary() {
			if (this.effectiveGenerationWindow === 0) {
				return 'This will appear on the day it is due.';
			}

			return `This will appear ${summarizeDays(this.effectiveGenerationWindow)}.`;
		},

		get isModalOpen() {
			return this.settingsOpen || this.editor.open;
		},

		get isActiveView() {
			return this.ui.view === 'active';
		},

		get showActiveEmptyState() {
			return this.isActiveView && this.visibleInstances.length === 0;
		},

		get showActiveTasks() {
			return this.isActiveView && this.visibleInstances.length > 0;
		},

		get showTemplatesView() {
			return this.ui.view === 'templates';
		},

		get visibleInstances() {
			return this.model.visibleInstances();
		},

		get groupedActiveTasks() {
			let groups = [
				{ key: 'overdue', title: 'Overdue tasks', items: [] },
				{ key: 'current', title: 'Current tasks', items: [] },
				{ key: 'upcoming', title: 'Upcoming tasks', items: [] }
			];

			this.visibleInstances.forEach(instance => {
				let key = this.groupKeyForInstance(instance);
				let group = groups.find(entry => entry.key === key);
				if (group) {
					group.items.push(instance);
				}
			});

			groups.forEach(group => {
				group.items = group.items.slice().sort((left, right) => {
					let dueDelta = isoDateToDayNumber(left.dueDate) - isoDateToDayNumber(right.dueDate);
					if (dueDelta !== 0) {
						return dueDelta;
					}
					return left.id.localeCompare(right.id);
				});
			});

			return groups.filter(group => group.items.length > 0);
		},

		get sortedTemplates() {
			return this.model.sortedTemplates();
		},

		get editorTitle() {
			return this.editor.mode === 'create' ? 'New Template' : 'Edit Template';
		},

		get editorTitleTrimmed() {
			return String(this.editor.template.title || '').trim();
		},

		get effectiveGenerationWindow() {
			if (this.editor.windowMode === 'auto') {
				return suggestGenerationWindowDays(this.editor.template.recurrence);
			}

			return clampWholeNumber(this.editor.template.generationWindowDays, 0, 365, suggestGenerationWindowDays(this.editor.template.recurrence));
		},

		get ruleEditorEffectiveStartDate() {
			let normalized = normalizeRule(this.editor.ruleEditor.draft);
			if (!normalized) {
				return todayIsoDate();
			}

			if (normalized.interval <= 1) {
				return todayIsoDate();
			}

			let referenceDate = this.editor.ruleEditor.referenceDate || this.editor.template.createdAt || todayIsoDate();
			return suggestRuleStartDate(normalized, referenceDate);
		},

		get showRuleBuilder() {
			return this.editor.ruleEditor.open;
		}
	};
}

window.upkeepViewModel = upkeepViewModel;
