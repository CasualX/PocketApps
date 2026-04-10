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
	todayDayNumber,
} from './app.js';

const STORAGE_KEY = 'upkeep-data';
const DEMO_HASH = '#demo';
const THEME_COLORS = Object.freeze({ light: '#f3ecdf', dark: '#141311' });

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
		},
		saveFeedback: {
			open: false,
			message: '',
		},
		saveFeedbackTimer: null,
		editor: {
			open: false,
			mode: 'create',
			template: createDefaultTemplateDraft(),
			draftChecklistItem: '',
		},
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

		handleEscape() {
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
			let stamp = new Date().toISOString().slice(0, 10);
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
			this.editor.template = createDefaultTemplateDraft();
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
				this.editor.template = createDefaultTemplateDraft();
			}
			else {
				let template = this.model.templateById(templateId);
				if (!template) {
					return;
				}
				this.editor.mode = 'edit';
				this.editor.template = deepCopy(template);
			}
			this.editor.draftChecklistItem = '';
			this.editor.open = true;
			this.$nextTick(() => {
				if (this.$refs.templateTitle) {
					this.$refs.templateTitle.focus();
				}
			});
		},

		closeTemplateEditor() {
			this.editor.open = false;
		},

		normalizeEditorRule(rule) {
			let normalized = normalizeRule(rule);
			if (!normalized) {
				return;
			}
			Object.keys(rule).forEach(key => delete rule[key]);
			Object.assign(rule, normalized);
		},

		addRule() {
			let previousRule = this.editor.template.recurrence[this.editor.template.recurrence.length - 1] || null;
			this.editor.template.recurrence = [...this.editor.template.recurrence, createDefaultRule(previousRule)];
		},

		removeRule(ruleId) {
			if (this.editor.template.recurrence.length === 1) {
				return;
			}
			this.editor.template.recurrence = this.editor.template.recurrence.filter(rule => rule.id !== ruleId);
		},

		acceptDraftChecklistItem() {
			let label = this.checklistDraftTrimmed;
			if (!label) {
				return;
			}

			this.editor.template.items = [
				...this.editor.template.items,
				{ id: createId('item'), label }
			];
			this.editor.draftChecklistItem = '';
		},

		removeChecklistItem(itemId) {
			this.editor.template.items = this.editor.template.items.filter(item => item.id !== itemId);
		},

		moveChecklistItem(index, delta) {
			let nextIndex = index + delta;
			if (nextIndex < 0 || nextIndex >= this.editor.template.items.length) {
				return;
			}
			let items = [...this.editor.template.items];
			let [item] = items.splice(index, 1);
			items.splice(nextIndex, 0, item);
			this.editor.template.items = items;
		},

		buildEditorTemplatePayload() {
			let draftChecklistItem = this.checklistDraftTrimmed;
			let items = this.editor.template.items
				.map(item => ({ id: item.id || createId('item'), label: String(item.label || '').trim() }))
				.filter(item => item.label.length > 0);

			if (draftChecklistItem) {
				items.push({ id: createId('item'), label: draftChecklistItem });
			}

			return {
				id: this.editor.template.id || createId('tpl'),
				title: String(this.editor.template.title || '').trim(),
				recurrence: this.editor.template.recurrence.map(rule => normalizeRule(rule)).filter(Boolean),
				items,
				generationWindowDays: this.editor.template.generationWindowDays,
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

		stepPlaceholder(index) {
			return `Step ${index + 1}`;
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

		get checklistDraftTrimmed() {
			return String(this.editor.draftChecklistItem || '').trim();
		},

		get showChecklistEmptyNote() {
			return this.editor.template.items.length === 0 && !this.checklistDraftTrimmed;
		}
	};
}

window.upkeepViewModel = upkeepViewModel;
