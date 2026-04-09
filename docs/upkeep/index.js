const VERSION = '1.0';
const STORAGE_KEY = 'upkeep-data';
const ASSET_VERSION = '20260409f';
const DEMO_HASH = '#demo';
const RESOLVED_RETENTION_DAYS = 1;
const CURRENT_WINDOW_DAYS = 1;
const THEME_OPTIONS = Object.freeze(['auto', 'light', 'dark']);
const THEME_COLORS = Object.freeze({ light: '#f3ecdf', dark: '#141311' });
const WEEKDAY_NAMES = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
const MONTH_LABELS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const ORDINAL_LABELS = Object.freeze({ 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' });

function defaultAppState() {
	return {
		version: VERSION,
		lastOpenedDate: undefined,
		themeMode: 'auto',
		templates: [],
		instances: []
	};
}

function createDemoAppState() {
	let templates = [
		{
			id: 'tpl_kitchen_reset',
			title: 'Kitchen reset',
			recurrence: [
				{ id: 'rule_kitchen_reset', type: 'weekly', interval: 1, day: 'Monday' }
			],
			items: [
				{ id: 'item_kitchen_counters', label: 'Clear counters' },
				{ id: 'item_kitchen_floor', label: 'Sweep floor' },
				{ id: 'item_kitchen_sink', label: 'Wipe sink and faucet' }
			],
			generationWindowDays: 10,
			createdAt: '2026-03-02',
			updatedAt: '2026-03-02'
		},
		{
			id: 'tpl_laundry_linens',
			title: 'Laundry and linens',
			recurrence: [
				{ id: 'rule_laundry_linens', type: 'weekly', interval: 1, day: 'Thursday' }
			],
			items: [
				{ id: 'item_laundry_towels', label: 'Wash towels' },
				{ id: 'item_laundry_linens', label: 'Replace kitchen linens' },
				{ id: 'item_laundry_fold', label: 'Fold the spare set' }
			],
			generationWindowDays: 10,
			createdAt: '2026-03-05',
			updatedAt: '2026-03-05'
		},
		{
			id: 'tpl_balcony_plants',
			title: 'Water balcony plants',
			recurrence: [
				{ id: 'rule_balcony_plants', type: 'daily', interval: 2 }
			],
			items: [
				{ id: 'item_plants_boxes', label: 'Front rail planters' },
				{ id: 'item_plants_herbs', label: 'Herb shelf' },
				{ id: 'item_plants_saucers', label: 'Drain saucers' }
			],
			generationWindowDays: 6,
			createdAt: '2026-04-06',
			updatedAt: '2026-04-06'
		},
		{
			id: 'tpl_storage_closet',
			title: 'Air out storage closet',
			recurrence: [
				{ id: 'rule_storage_closet', type: 'daily', interval: 1 }
			],
			items: [],
			generationWindowDays: 3,
			createdAt: '2026-04-01',
			updatedAt: '2026-04-01'
		},
		{
			id: 'tpl_smoke_alarms',
			title: 'Test smoke alarms',
			recurrence: [
				{ id: 'rule_smoke_alarms', type: 'monthly', interval: 1, mode: 'weekday_position', ordinal: 2, weekday: 'Saturday' }
			],
			items: [
				{ id: 'item_smoke_hall', label: 'Hallway detector' },
				{ id: 'item_smoke_bedrooms', label: 'Bedroom detectors' },
				{ id: 'item_smoke_batteries', label: 'Check backup batteries' }
			],
			generationWindowDays: 20,
			createdAt: '2026-01-10',
			updatedAt: '2026-01-10'
		},
		{
			id: 'tpl_hvac_filter',
			title: 'Swap HVAC filter',
			recurrence: [
				{ id: 'rule_hvac_filter', type: 'monthly', interval: 1, mode: 'day_of_month', day: 14 }
			],
			items: [
				{ id: 'item_hvac_off', label: 'Shut off the unit' },
				{ id: 'item_hvac_filter', label: 'Replace the filter' },
				{ id: 'item_hvac_reset', label: 'Reset the thermostat reminder' }
			],
			generationWindowDays: 20,
			createdAt: '2026-01-14',
			updatedAt: '2026-01-14'
		},
		{
			id: 'tpl_fridge_coils',
			title: 'Clean fridge coils',
			recurrence: [
				{ id: 'rule_fridge_coils', type: 'yearly', interval: 1, month: 5, day: 2 }
			],
			items: [
				{ id: 'item_fridge_pull', label: 'Pull fridge clear of the wall' },
				{ id: 'item_fridge_vacuum', label: 'Vacuum coils and vent' },
				{ id: 'item_fridge_level', label: 'Level and slide back into place' }
			],
			generationWindowDays: 30,
			createdAt: '2025-05-02',
			updatedAt: '2025-05-02'
		}
	];
	let instances = createDemoOverdueInstances(templates, {
		tpl_kitchen_reset: { count: 1, completedItems: 1 },
		tpl_balcony_plants: { count: 1, completedItems: 2 },
		tpl_smoke_alarms: { count: 1, completedItems: 0 }
	});

	return normalizeAppState({
		version: VERSION,
		themeMode: 'auto',
		templates,
		instances
	});
}

function createDemoOverdueInstances(templates, seedConfig) {
	let todayNumber = todayDayNumber();

	return templates.flatMap(template => {
		let config = seedConfig[template.id];
		if (!config) {
			return [];
		}

		let dueDates = findMatchingPastDueDates(template, config.count, todayNumber - 1, 90);
		return dueDates.map(dueDate => {
			let instance = buildInstance(template, dueDate);
			if (config.completedItems > 0) {
				instance.items = instance.items.map((item, index) => ({
					...item,
					state: index < config.completedItems ? 1 : 0
				}));
			}
			return instance;
		});
	});
}

function findMatchingPastDueDates(template, count, startDayNumber, maxLookbackDays) {
	let dueDates = [];
	let earliestDayNumber = Math.max(isoDateToDayNumber(template.createdAt), startDayNumber - maxLookbackDays);

	for (let dayNumber = startDayNumber; dayNumber >= earliestDayNumber; dayNumber -= 1) {
		let dueDate = dayNumberToIsoDate(dayNumber);
		if (!templateMatchesDate(template, dueDate)) {
			continue;
		}

		dueDates.push(dueDate);
		if (dueDates.length >= count) {
			break;
		}
	}

	return dueDates;
}

function createStorage() {
	let demoMode = window.location.hash === DEMO_HASH;

	return {
		locked: demoMode,

		load() {
			if (demoMode) {
				return createDemoAppState();
			}

			let raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return defaultAppState();
			}

			try {
				return migrateAppState(JSON.parse(raw));
			}
			catch (error) {
				return defaultAppState();
			}
		},

		save(data) {
			if (demoMode) {
				return;
			}
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		},

		clear() {
			if (demoMode) {
				return;
			}
			localStorage.removeItem(STORAGE_KEY);
		}
	};
}

function migrateAppState(saved) {
	return normalizeAppState(saved || {});
}

function normalizeAppState(saved) {
	let state = defaultAppState();
	let lastOpenedDate = isIsoDate(saved.lastOpenedDate) ? saved.lastOpenedDate : state.lastOpenedDate;
	let themeMode = THEME_OPTIONS.includes(saved.themeMode) ? saved.themeMode : state.themeMode;
	let templates = Array.isArray(saved.templates) ? saved.templates.map(normalizeTemplate).filter(Boolean) : [];
	let templateIds = new Set(templates.map(template => template.id));
	let instances = Array.isArray(saved.instances) ? saved.instances.map(normalizeInstance).filter(instance => instance && templateIds.has(instance.templateId)) : [];

	return {
		version: VERSION,
		lastOpenedDate,
		themeMode,
		templates,
		instances
	};
}

function normalizeTemplate(saved) {
	if (!saved || typeof saved !== 'object') {
		return null;
	}

	let title = String(saved.title || '').trim();
	let recurrence = Array.isArray(saved.recurrence) ? saved.recurrence.map(normalizeRule).filter(Boolean) : [];
	let items = Array.isArray(saved.items) ? saved.items.map(normalizeTemplateItem).filter(Boolean) : [];
	if (!title || recurrence.length === 0) {
		return null;
	}

	return {
		id: String(saved.id || createId('tpl')),
		title,
		recurrence,
		items,
		generationWindowDays: clampNumber(saved.generationWindowDays, 0, 365, 7),
		createdAt: isIsoDate(saved.createdAt) ? saved.createdAt : todayIsoDate(),
		updatedAt: isIsoDate(saved.updatedAt) ? saved.updatedAt : (isIsoDate(saved.createdAt) ? saved.createdAt : todayIsoDate())
	};
}

function normalizeTemplateItem(saved) {
	if (!saved || typeof saved !== 'object') {
		return null;
	}

	let label = String(saved.label || '').trim();
	if (!label) {
		return null;
	}

	return {
		id: String(saved.id || createId('item')),
		label
	};
}

function normalizeRule(saved) {
	if (!saved || typeof saved !== 'object') {
		return null;
	}

	let type = ['daily', 'weekly', 'monthly', 'yearly'].includes(saved.type) ? saved.type : 'daily';
	let interval = clampNumber(saved.interval, 1, 365, 1);
	let rule = {
		id: String(saved.id || createId('rule')),
		type,
		interval
	};

	if (type === 'daily') {
		return rule;
	}

	if (type === 'weekly') {
		rule.mode = 'day_of_week';
		rule.day = WEEKDAY_NAMES.includes(saved.day) ? saved.day : 'Monday';
		return rule;
	}

	if (type === 'monthly') {
		rule.mode = saved.mode === 'weekday_position' ? 'weekday_position' : 'day_of_month';
		if (rule.mode === 'day_of_month') {
			rule.day = clampNumber(saved.day, 1, 31, 1);
		}
		else {
			rule.ordinal = clampOrdinal(saved.ordinal);
			rule.weekday = WEEKDAY_NAMES.includes(saved.weekday) ? saved.weekday : 'Monday';
		}
		return rule;
	}

	rule.month = clampNumber(saved.month, 1, 12, 1);
	rule.day = clampNumber(saved.day, 1, 31, 1);
	return rule;
}

function normalizeInstance(saved) {
	if (!saved || typeof saved !== 'object' || !isIsoDate(saved.dueDate)) {
		return null;
	}

	let items = Array.isArray(saved.items) ? saved.items.map(normalizeInstanceItem).filter(Boolean) : [];
	let completedAt = isIsoDateTime(saved.completedAt) ? saved.completedAt : null;

	if (!completedAt && saved.resolvedState === 'completed' && isIsoDateTime(saved.resolvedAt)) {
		completedAt = saved.resolvedAt;
	}

	if (!completedAt && saved.resolvedState === 'dismissed' && isIsoDateTime(saved.resolvedAt)) {
		completedAt = saved.resolvedAt;
	}

	return {
		id: String(saved.id || createId('inst')),
		templateId: String(saved.templateId || ''),
		dueDate: saved.dueDate,
		items,
		completedAt
	};
}

function normalizeInstanceItem(saved) {
	if (!saved || typeof saved !== 'object') {
		return null;
	}

	let state = saved.state === 1 ? 1 : 0;
	return {
		id: String(saved.id || createId('iteminst')),
		label: String(saved.label || '').trim(),
		state
	};
}

function createId(prefix) {
	if (window.crypto && typeof window.crypto.randomUUID === 'function') {
		return `${prefix}_${window.crypto.randomUUID()}`;
	}
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value, min, max, fallback) {
	let number = Number(value);
	if (!Number.isFinite(number)) {
		return fallback;
	}
	return Math.max(min, Math.min(max, Math.round(number)));
}

function clampOrdinal(value) {
	return [1, 2, 3, 4, -1].includes(Number(value)) ? Number(value) : 1;
}

function isIsoDate(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function isIsoDateTime(value) {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function utcDate(year, monthIndex, day) {
	return new Date(Date.UTC(year, monthIndex, day));
}

function todayIsoDate() {
	return dayNumberToIsoDate(todayDayNumber());
}

function todayDayNumber() {
	let now = new Date();
	return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

function isoDateToDayNumber(value) {
	let [year, month, day] = String(value).split('-').map(Number);
	return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function dayNumberToIsoDate(dayNumber) {
	let date = new Date(dayNumber * 86400000);
	let year = date.getUTCFullYear();
	let month = String(date.getUTCMonth() + 1).padStart(2, '0');
	let day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function isoDateToDate(value) {
	let [year, month, day] = String(value).split('-').map(Number);
	return new Date(year, month - 1, day);
}

function formatDate(value, options) {
	return isoDateToDate(value).toLocaleDateString(undefined, options);
}

function formatDateTime(value) {
	return new Date(value).toLocaleString(undefined, {
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

function weekdayNameFromDayIndex(dayIndex) {
	return WEEKDAY_NAMES[(dayIndex + 6) % 7];
}

function weekdayNameFromIsoDate(value) {
	return weekdayNameFromDayIndex(isoDateToDate(value).getDay());
}

function startOfWeek(dayNumber) {
	let weekday = new Date(dayNumber * 86400000).getUTCDay();
	let mondayOffset = (weekday + 6) % 7;
	return dayNumber - mondayOffset;
}

function monthDifference(anchorDate, candidateDate) {
	let anchor = isoDateToDate(anchorDate);
	let candidate = isoDateToDate(candidateDate);
	return (candidate.getFullYear() - anchor.getFullYear()) * 12 + (candidate.getMonth() - anchor.getMonth());
}

function yearDifference(anchorDate, candidateDate) {
	return isoDateToDate(candidateDate).getFullYear() - isoDateToDate(anchorDate).getFullYear();
}

function daysInMonth(year, monthIndex) {
	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function nthWeekdayOfMonth(year, monthIndex, weekdayName, ordinal) {
	if (!WEEKDAY_NAMES.includes(weekdayName)) {
		return null;
	}

	if (ordinal === -1) {
		for (let day = daysInMonth(year, monthIndex); day >= 1; day -= 1) {
			if (weekdayNameFromDayIndex(utcDate(year, monthIndex, day).getUTCDay()) === weekdayName) {
				return day;
			}
		}
		return null;
	}

	let count = 0;
	for (let day = 1; day <= daysInMonth(year, monthIndex); day += 1) {
		if (weekdayNameFromDayIndex(utcDate(year, monthIndex, day).getUTCDay()) === weekdayName) {
			count += 1;
			if (count === ordinal) {
				return day;
			}
		}
	}

	return null;
}

function matchesRule(template, rule, dueDate) {
	let dueDayNumber = isoDateToDayNumber(dueDate);
	let anchorDayNumber = isoDateToDayNumber(template.createdAt);
	if (dueDayNumber < anchorDayNumber) {
		return false;
	}

	if (rule.type === 'daily') {
		return (dueDayNumber - anchorDayNumber) % rule.interval === 0;
	}

	if (rule.type === 'weekly') {
		if (weekdayNameFromIsoDate(dueDate) !== rule.day) {
			return false;
		}

		let dueWeekStart = startOfWeek(dueDayNumber);
		let anchorWeekStart = startOfWeek(anchorDayNumber);
		return ((dueWeekStart - anchorWeekStart) / 7) % rule.interval === 0;
	}

	if (rule.type === 'monthly') {
		let diff = monthDifference(template.createdAt, dueDate);
		if (diff < 0 || diff % rule.interval !== 0) {
			return false;
		}

		let date = isoDateToDate(dueDate);
		let year = date.getFullYear();
		let monthIndex = date.getMonth();
		let day = date.getDate();

		if (rule.mode === 'weekday_position') {
			return day === nthWeekdayOfMonth(year, monthIndex, rule.weekday, rule.ordinal);
		}

		return day === Math.min(rule.day, daysInMonth(year, monthIndex));
	}

	let yearDiff = yearDifference(template.createdAt, dueDate);
	if (yearDiff < 0 || yearDiff % rule.interval !== 0) {
		return false;
	}

	let candidate = isoDateToDate(dueDate);
	let month = candidate.getMonth() + 1;
	let day = candidate.getDate();
	let maxDay = daysInMonth(candidate.getFullYear(), candidate.getMonth());
	return month === rule.month && day === Math.min(rule.day, maxDay);
}

function templateMatchesDate(template, dueDate) {
	return template.recurrence.some(rule => matchesRule(template, rule, dueDate));
}

function buildInstance(template, dueDate) {
	return {
		id: createId('inst'),
		templateId: template.id,
		dueDate,
		items: template.items.map(item => ({
			id: item.id,
			label: item.label,
			state: 0
		})),
		completedAt: null
	};
}

function isInstanceResolved(instance) {
	return isIsoDateTime(instance.completedAt);
}

function isExpiredResolvedInstance(instance, todayNumber) {
	if (!isInstanceResolved(instance) || !instance.completedAt) {
		return false;
	}

	let resolvedDayNumber = Math.floor(Date.parse(instance.completedAt) / 86400000);
	return todayNumber - resolvedDayNumber >= RESOLVED_RETENTION_DAYS;
}

function sortInstances(instances) {
	return instances
		.map((instance, index) => ({ instance, index }))
		.sort((left, right) => {
			let dueDelta = isoDateToDayNumber(left.instance.dueDate) - isoDateToDayNumber(right.instance.dueDate);
			if (dueDelta !== 0) {
				return dueDelta;
			}

			return left.index - right.index;
		})
		.map(entry => entry.instance);
}

function latestMatchingActiveInstance(instances, template, dayNumber) {
	let latestInstance = null;
	let latestDueDayNumber = -Infinity;

	instances.forEach(instance => {
		if (instance.templateId !== template.id || isInstanceResolved(instance)) {
			return;
		}

		let dueDayNumber = isoDateToDayNumber(instance.dueDate);
		if (dueDayNumber > dayNumber || !templateMatchesDate(template, instance.dueDate)) {
			return;
		}

		if (dueDayNumber > latestDueDayNumber) {
			latestInstance = instance;
			latestDueDayNumber = dueDayNumber;
		}
	});

	return latestInstance;
}

function findLatestMatchingDueDate(template, startDayNumber, endDayNumber) {
	let earliestDayNumber = Math.max(isoDateToDayNumber(template.createdAt), startDayNumber);
	for (let dayNumber = endDayNumber; dayNumber >= earliestDayNumber; dayNumber -= 1) {
		let dueDate = dayNumberToIsoDate(dayNumber);
		if (templateMatchesDate(template, dueDate)) {
			return dueDate;
		}
	}

	return null;
}

function laterDueDate(leftDueDate, rightDueDate) {
	if (!leftDueDate) {
		return rightDueDate;
	}
	if (!rightDueDate) {
		return leftDueDate;
	}

	return isoDateToDayNumber(leftDueDate) >= isoDateToDayNumber(rightDueDate) ? leftDueDate : rightDueDate;
}

function relevantActiveDueDate(template, instances, backfillStartDayNumber, todayNumber) {
	let todayDueDate = dayNumberToIsoDate(todayNumber);
	if (templateMatchesDate(template, todayDueDate)) {
		return todayDueDate;
	}

	let latestExistingInstance = latestMatchingActiveInstance(instances, template, todayNumber);
	let latestExistingDueDate = latestExistingInstance ? latestExistingInstance.dueDate : null;
	let latestBackfillDueDate = null;

	if (backfillStartDayNumber !== null && backfillStartDayNumber < todayNumber) {
		latestBackfillDueDate = findLatestMatchingDueDate(template, backfillStartDayNumber, todayNumber - 1);
	}

	return laterDueDate(latestExistingDueDate, latestBackfillDueDate);
}

function retainInstance(instances, existingKeys, instance) {
	let key = `${instance.templateId}::${instance.dueDate}`;
	if (existingKeys.has(key)) {
		return;
	}

	instances.push(instance);
	existingKeys.add(key);
}

function syncGeneratedInstances(data) {
	let todayNumber = todayDayNumber();
	let backfillStartDayNumber = isIsoDate(data.lastOpenedDate)
		? Math.min(isoDateToDayNumber(data.lastOpenedDate), todayNumber)
		: null;
	let activeTemplateIds = new Set(data.templates.map(template => template.id));
	let sourceInstances = data.instances.filter(instance => {
		return activeTemplateIds.has(instance.templateId) && !isExpiredResolvedInstance(instance, todayNumber);
	});
	let instances = [];
	let existingKeys = new Set();

	data.templates.forEach(template => {
		let endDay = todayNumber + clampNumber(template.generationWindowDays, 0, 365, 7);
		let templateInstances = sourceInstances.filter(instance => instance.templateId === template.id);
		let latestActiveInstance = latestMatchingActiveInstance(templateInstances, template, todayNumber);
		let activeDueDate = relevantActiveDueDate(template, templateInstances, backfillStartDayNumber, todayNumber);

		templateInstances.forEach(instance => {
			if (isInstanceResolved(instance)) {
				retainInstance(instances, existingKeys, instance);
				return;
			}

			let dueDayNumber = isoDateToDayNumber(instance.dueDate);
			if (dueDayNumber <= todayNumber) {
				return;
			}

			if (dueDayNumber > endDay || !templateMatchesDate(template, instance.dueDate)) {
				return;
			}

			retainInstance(instances, existingKeys, instance);
		});

		if (activeDueDate) {
			let activeKey = `${template.id}::${activeDueDate}`;
			if (!existingKeys.has(activeKey)) {
				if (latestActiveInstance && latestActiveInstance.dueDate === activeDueDate) {
					retainInstance(instances, existingKeys, latestActiveInstance);
				}
				else {
					retainInstance(instances, existingKeys, buildInstance(template, activeDueDate));
				}
			}
		}

		for (let dayNumber = todayNumber; dayNumber <= endDay; dayNumber += 1) {
			let dueDate = dayNumberToIsoDate(dayNumber);
			let key = `${template.id}::${dueDate}`;
			if (existingKeys.has(key)) {
				continue;
			}
			if (!templateMatchesDate(template, dueDate)) {
				continue;
			}

			instances.push(buildInstance(template, dueDate));
			existingKeys.add(key);
		}
	});

	data.instances = sortInstances(instances);
	return data;
}

function saveAppState(storage, data) {
	data.lastOpenedDate = todayIsoDate();
	storage.save(data);
}

function deepCopy(value) {
	return JSON.parse(JSON.stringify(value));
}

function createDefaultRule(previousRule = null) {
	if (previousRule) {
		let nextRule = normalizeRule(deepCopy(previousRule));
		nextRule.id = createId('rule');
		return nextRule;
	}

	return normalizeRule({
		type: 'weekly',
		interval: 1,
		day: 'Monday'
	});
}

function createDefaultTemplateDraft() {
	return {
		id: createId('tpl'),
		title: '',
		recurrence: [createDefaultRule()],
		items: [],
		generationWindowDays: 7
	};
}

function createRecurrenceDescription(rule) {
	let everyLabel = rule.interval === 1 ? 'Every' : `Every ${rule.interval}`;
	if (rule.type === 'daily') {
		return `${everyLabel} ${rule.interval === 1 ? 'day' : 'days'}`;
	}

	if (rule.type === 'weekly') {
		return `${everyLabel} ${rule.interval === 1 ? 'week' : 'weeks'} on ${rule.day}`;
	}

	if (rule.type === 'monthly') {
		if (rule.mode === 'weekday_position') {
			return `${everyLabel} ${rule.interval === 1 ? 'month' : 'months'} on the ${ORDINAL_LABELS[rule.ordinal]} ${rule.weekday}`;
		}
		return `${everyLabel} ${rule.interval === 1 ? 'month' : 'months'} on day ${rule.day}`;
	}

	return `${everyLabel} ${rule.interval === 1 ? 'year' : 'years'} on ${MONTH_LABELS[rule.month - 1]} ${rule.day}`;
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

function upkeepApp() {
	let storage = createStorage();

	return {
		data: defaultAppState(),
		storageLocked: storage.locked,
		viewOptions: ['active', 'templates'],
		themeOptions: THEME_OPTIONS,
		settingsOpen: false,
		ui: {
			view: 'active'
		},
		saveFeedback: {
			open: false,
			message: ''
		},
		saveFeedbackTimer: null,
		editor: {
			open: false,
			mode: 'create',
			template: createDefaultTemplateDraft(),
			draftChecklistItem: ''
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
			this.data = storage.load();
			syncGeneratedInstances(this.data);
			saveAppState(storage, this.data);
			this.applyTheme();

			this.$watch('data.themeMode', () => {
				this.applyTheme();
				saveAppState(storage, this.data);
			});

			watchSystemThemeChange(() => {
				this.applyTheme();
			});
		},

		persist() {
			syncGeneratedInstances(this.data);
			saveAppState(storage, this.data);
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

		todayHeaderLabel() {
			return new Date().toLocaleDateString(undefined, {
				weekday: 'long',
				month: 'long',
				day: 'numeric'
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
			this.data.themeMode = theme;
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
			if (!file) return;

			try {
				let content = await file.text();
				let importedData = JSON.parse(content);
				if (!this.isSupportedImportVersion(importedData && importedData.version)) {
					throw new Error('Unsupported version');
				}

				this.data = migrateAppState(importedData);
				syncGeneratedInstances(this.data);
				saveAppState(storage, this.data);
				this.applyTheme();
				this.closeTemplateEditor();
				this.closeSettings();
				alert('App data imported.');
			}
			catch (error) {
				alert('Import failed. Choose an Upkeep file with version 1.x.');
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
			link.download = `upkeep-data-${stamp}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		},

		confirmWipeData() {
			let ok = confirm('Wipe all saved app data? This will erase your templates, generated tasks, and settings. Continue?');
			if (!ok) return;

			storage.clear();
			this.data = normalizeAppState(defaultAppState());
			this.ui.view = 'active';
			this.editor.template = createDefaultTemplateDraft();
			this.applyTheme();
			this.closeTemplateEditor();
			this.closeSettings();
			saveAppState(storage, this.data);
			alert('Saved data wiped.');
		},

		sortedTemplates() {
			return [...this.data.templates].sort((left, right) => left.title.localeCompare(right.title));
		},

		templateById(templateId) {
			return this.data.templates.find(template => template.id === templateId) || null;
		},

		visibleInstances() {
			let todayNumber = todayDayNumber();
			return this.data.instances.filter(instance => {
				let template = this.templateById(instance.templateId);
				return template && !isExpiredResolvedInstance(instance, todayNumber);
			});
		},

		hasChecklist(instance) {
			return Array.isArray(instance.items) && instance.items.length > 0;
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

		groupCount(groupKey) {
			return this.visibleInstances().filter(instance => this.groupKeyForInstance(instance) === groupKey).length;
		},

		groupedActiveTasks() {
			let groups = [
				{ key: 'overdue', title: 'Overdue tasks', items: [] },
				{ key: 'current', title: 'Current tasks', items: [] },
				{ key: 'upcoming', title: 'Upcoming tasks', items: [] }
			];
			let items = this.visibleInstances();

			items.forEach(instance => {
				let key = this.groupKeyForInstance(instance);
				let group = groups.find(entry => entry.key === key);
				if (group) {
					group.items.push(instance);
				}
			});

			groups.forEach(group => {
				group.items = sortInstances(group.items);
			});

			return groups.filter(group => group.items.length > 0);
		},

		instanceTitle(instance) {
			let template = this.templateById(instance.templateId);
			return template ? template.title : 'Untitled task';
		},

		templateForInstance(instance) {
			return this.templateById(instance.templateId) || {
				title: 'Untitled task',
				recurrence: []
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

			return `${relative} · ${formatDate(dueDate, { weekday: 'long', month: 'long', day: 'numeric' })}`;
		},

		formatTaskDateLabel(instance) {
			if (instance.completedAt) {
				return `Completed ${formatDateTime(instance.completedAt)}`;
			}

			return this.formatDueLabel(instance.dueDate);
		},

		remainingItemLabel(instance) {
			if (instance.completedAt) {
				return '';
			}

			let remaining = instance.items.filter(item => item.state === 0).length;
			if (instance.items.length === 0) {
				return '';
			}
			return remaining === 0 ? 'Ready to resolve' : `${remaining} left`;
		},

		countTemplateInstances(templateId) {
			return this.visibleInstances().filter(instance => instance.templateId === templateId).length;
		},

		taskCardClasses(instance) {
			return {
				overdue: this.groupKeyForInstance(instance) === 'overdue',
				current: this.groupKeyForInstance(instance) === 'current',
				upcoming: this.groupKeyForInstance(instance) === 'upcoming',
				resolved: Boolean(instance.completedAt)
			};
		},

		itemButtonClasses(instance, item) {
			return {
				complete: item.state === 1,
				locked: isInstanceResolved(instance)
			};
		},

		itemCheckboxClasses(instance, item) {
			return {
				complete: item.state === 1,
				pending: item.state === 0,
				locked: isInstanceResolved(instance)
			};
		},

		isInstanceResolved(instance) {
			return isInstanceResolved(instance);
		},

		reopenInstance(instance) {
			instance.completedAt = null;
		},

		toggleInstanceItem(instanceId, itemId) {
			let instance = this.data.instances.find(entry => entry.id === instanceId);
			if (!instance || !this.hasChecklist(instance)) {
				return;
			}

			let item = instance.items.find(entry => entry.id === itemId);
			if (!item) {
				return;
			}

			let wasCompleted = Boolean(instance.completedAt);
			item.state = item.state === 1 ? 0 : 1;
			if (wasCompleted && item.state === 0) {
				this.reopenInstance(instance);
			}
			if (instance.items.every(entry => entry.state === 1)) {
				this.resolveInstance(instance);
			}
			this.persist();
		},

		resolveInstance(instance) {
			let timestamp = new Date().toISOString();
			instance.completedAt = timestamp;
			instance.items = instance.items.map(item => ({
				...item,
				state: item.state === 0 ? 1 : item.state
			}));
		},

		completeInstance(instanceId) {
			let instance = this.data.instances.find(entry => entry.id === instanceId);
			if (!instance || isInstanceResolved(instance)) {
				return;
			}

			this.resolveInstance(instance);
			this.persist();
		},

		toggleSingleActionInstance(instanceId) {
			let instance = this.data.instances.find(entry => entry.id === instanceId);
			if (!instance || this.hasChecklist(instance)) {
				return;
			}

			if (isInstanceResolved(instance)) {
				this.reopenInstance(instance);
			}
			else {
				this.resolveInstance(instance);
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
				let template = this.templateById(templateId);
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
			let label = String(this.editor.draftChecklistItem || '').trim();
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

		sanitizeEditorTemplate() {
			let title = String(this.editor.template.title || '').trim();
			let recurrence = this.editor.template.recurrence.map(normalizeRule).filter(Boolean);
			let draftChecklistItem = String(this.editor.draftChecklistItem || '').trim();
			let items = this.editor.template.items
				.map(item => ({ id: item.id || createId('item'), label: String(item.label || '').trim() }))
				.filter(item => item.label.length > 0);

			if (draftChecklistItem) {
				items.push({ id: createId('item'), label: draftChecklistItem });
			}

			if (!title) {
				alert('Template title is required.');
				return null;
			}
			if (recurrence.length === 0) {
				alert('Add at least one recurrence rule.');
				return null;
			}

			return {
				id: this.editor.template.id || createId('tpl'),
				title,
				recurrence,
				items,
				generationWindowDays: clampNumber(this.editor.template.generationWindowDays, 0, 365, 7)
			};
		},

		clearFutureInstancesForTemplate(templateId) {
			let todayNumber = todayDayNumber();
			this.data.instances = this.data.instances.filter(instance => {
				if (instance.templateId !== templateId) {
					return true;
				}

				if (isInstanceResolved(instance)) {
					return true;
				}

				return isoDateToDayNumber(instance.dueDate) < todayNumber;
			});
		},

		saveTemplate() {
			let sanitized = this.sanitizeEditorTemplate();
			if (!sanitized) {
				return;
			}

			let today = todayIsoDate();
			let feedbackMessage = '';
			if (this.editor.mode === 'edit') {
				let templateIndex = this.data.templates.findIndex(template => template.id === sanitized.id);
				if (templateIndex === -1) {
					return;
				}

				let existing = this.data.templates[templateIndex];
				this.data.templates.splice(templateIndex, 1, {
					...existing,
					...sanitized,
					createdAt: existing.createdAt,
					updatedAt: today
				});
				this.clearFutureInstancesForTemplate(existing.id);
				feedbackMessage = `Updated ${sanitized.title}`;
			}
			else {
				this.data.templates.push({
					...sanitized,
					createdAt: today,
					updatedAt: today
				});
				feedbackMessage = `Created ${sanitized.title}`;
			}

			this.persist();
			this.editor.open = false;
			this.ui.view = 'templates';
			this.showSaveFeedback(feedbackMessage);
		},

		deleteTemplate(templateId) {
			let template = this.templateById(templateId);
			if (!template) {
				return;
			}
			if (!confirm(`Delete "${template.title}" and its generated tasks?`)) {
				return;
			}

			this.data.templates = this.data.templates.filter(entry => entry.id !== templateId);
			this.data.instances = this.data.instances.filter(entry => entry.templateId !== templateId);
			this.persist();
			this.editor.open = false;
		},
	};
}
