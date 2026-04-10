// @ts-check

export const VERSION = '1.0';
export const RESOLVED_RETENTION_DAYS = 1;
export const CURRENT_WINDOW_DAYS = 1;
export const THEME_OPTIONS = Object.freeze(['auto', 'light', 'dark']);
export const WEEKDAY_NAMES = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
export const MONTH_LABELS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
export const ORDINAL_LABELS = /** @type {Readonly<Record<string, string>>} */ (Object.freeze({ 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' }));
export const DEFAULT_GENERATION_WINDOWS = Object.freeze({
	daily: 1,
	weekly: 2,
	monthly: 5,
	yearly: 14,
});

/** @typedef {'auto' | 'light' | 'dark'} ThemeMode */
/** @typedef {'daily' | 'weekly' | 'monthly' | 'yearly'} RuleType */

/**
 * @typedef TemplateItem
 * @property {string} id
 * @property {string} label
 */

/**
 * @typedef InstanceItem
 * @property {string} id
 * @property {string} label
 * @property {0 | 1} state
 */

/**
 * @typedef RecurrenceRule
 * @property {string} id
 * @property {RuleType} type
 * @property {number} interval
 * @property {'day_of_week' | 'day_of_month' | 'weekday_position'} [mode]
 * @property {number | string} [day]
 * @property {number} [ordinal]
 * @property {string} [weekday]
 * @property {number} [month]
 * @property {string} [startsOn]
 */

/**
 * @typedef Template
 * @property {string} id
 * @property {string} title
 * @property {RecurrenceRule[]} recurrence
 * @property {TemplateItem[]} items
 * @property {number} generationWindowDays
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef Instance
 * @property {string} id
 * @property {string} templateId
 * @property {string} dueDate
 * @property {InstanceItem[]} items
 * @property {string | null} completedAt
 * @property {string | null} completedOn
 */

/**
 * @typedef AppState
 * @property {string} version
 * @property {string | undefined} lastOpenedDate
 * @property {ThemeMode} themeMode
 * @property {Template[]} templates
 * @property {Instance[]} instances
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @template T
 * @param {T | null} value
 * @returns {value is T}
 */
function isPresent(value) {
	return value !== null;
}

/**
 * @returns {AppState}
 */
export function defaultAppState() {
	return {
		version: VERSION,
		lastOpenedDate: undefined,
		themeMode: 'auto',
		templates: [],
		instances: [],
	};
}

/**
 * @param {unknown} value
 * @returns {value is ThemeMode}
 */
function isThemeMode(value) {
	return typeof value === 'string' && THEME_OPTIONS.includes(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isIsoDate(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isIsoDateTime(value) {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeCompletedOn(value) {
	return isIsoDate(value) ? String(value) : null;
}

/**
 * @param {string | null} completedAt
 * @returns {string | null}
 */
function deriveCompletedOn(completedAt) {
	if (!completedAt || !isIsoDateTime(completedAt)) {
		return null;
	}

	return todayIsoDate(new Date(completedAt));
}

/**
 * @param {number} year
 * @param {number} monthIndex
 * @param {number} day
 * @returns {Date}
 */
function utcDate(year, monthIndex, day) {
	return new Date(Date.UTC(year, monthIndex, day));
}

/**
 * @param {Date} [now]
 * @returns {number}
 */
export function todayDayNumber(now = new Date()) {
	return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

/**
 * @param {Date} [now]
 * @returns {string}
 */
export function todayIsoDate(now = new Date()) {
	return dayNumberToIsoDate(todayDayNumber(now));
}

/**
 * @param {string} value
 * @returns {number}
 */
export function isoDateToDayNumber(value) {
	let [year, month, day] = String(value).split('-').map(Number);
	return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

/**
 * @param {number} dayNumber
 * @returns {string}
 */
export function dayNumberToIsoDate(dayNumber) {
	let date = new Date(dayNumber * 86400000);
	let year = date.getUTCFullYear();
	let month = String(date.getUTCMonth() + 1).padStart(2, '0');
	let day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * @param {string} value
 * @returns {Date}
 */
export function isoDateToDate(value) {
	let [year, month, day] = String(value).split('-').map(Number);
	return new Date(year, month - 1, day);
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampNumber(value, min, max, fallback) {
	let number = Number(value);
	if (!Number.isFinite(number)) {
		return fallback;
	}
	return Math.max(min, Math.min(max, Math.round(number)));
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function clampOrdinal(value) {
	return [1, 2, 3, 4, -1].includes(Number(value)) ? Number(value) : 1;
}

/**
 * @returns {string}
 */
function createIdSegment() {
	return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {string} prefix
 * @returns {string}
 */
export function createId(prefix) {
	if (typeof globalThis.crypto?.randomUUID === 'function') {
		return `${prefix}_${globalThis.crypto.randomUUID()}`;
	}
	return `${prefix}_${createIdSegment()}`;
}

/**
 * @param {unknown} saved
 * @returns {TemplateItem | null}
 */
function normalizeTemplateItem(saved) {
	if (!isPlainObject(saved)) {
		return null;
	}

	let label = String(saved.label || '').trim();
	if (!label) {
		return null;
	}

	return {
		id: String(saved.id || createId('item')),
		label,
	};
}

/**
 * @param {unknown} saved
 * @returns {RecurrenceRule | null}
 */
export function normalizeRule(saved) {
	if (!isPlainObject(saved)) {
		return null;
	}

	let type = ['daily', 'weekly', 'monthly', 'yearly'].includes(String(saved.type)) ? /** @type {RuleType} */ (saved.type) : 'daily';
	let interval = clampNumber(saved.interval, 1, 365, 1);
	/** @type {RecurrenceRule} */
	let rule = {
		id: String(saved.id || createId('rule')),
		type,
		interval,
	};

	if (isIsoDate(saved.startsOn)) {
		rule.startsOn = String(saved.startsOn);
	}

	if (type === 'daily') {
		return rule;
	}

	if (type === 'weekly') {
		rule.mode = 'day_of_week';
		rule.day = WEEKDAY_NAMES.includes(String(saved.day)) ? String(saved.day) : 'Monday';
		return rule;
	}

	if (type === 'monthly') {
		rule.mode = saved.mode === 'weekday_position' ? 'weekday_position' : 'day_of_month';
		if (rule.mode === 'day_of_month') {
			rule.day = clampNumber(saved.day, 1, 31, 1);
		}
		else {
			rule.ordinal = clampOrdinal(saved.ordinal);
			rule.weekday = WEEKDAY_NAMES.includes(String(saved.weekday)) ? String(saved.weekday) : 'Monday';
		}
		return rule;
	}

	rule.month = clampNumber(saved.month, 1, 12, 1);
	rule.day = clampNumber(saved.day, 1, 31, 1);
	return rule;
}

/**
 * @param {unknown} saved
 * @returns {InstanceItem | null}
 */
function normalizeInstanceItem(saved) {
	if (!isPlainObject(saved)) {
		return null;
	}

	return {
		id: String(saved.id || createId('iteminst')),
		label: String(saved.label || '').trim(),
		state: saved.state === 1 ? 1 : 0,
	};
}

/**
 * @param {unknown} saved
 * @returns {Template | null}
 */
function normalizeTemplate(saved) {
	if (!isPlainObject(saved)) {
		return null;
	}

	let title = String(saved.title || '').trim();
	let recurrence = /** @type {RecurrenceRule[]} */ (Array.isArray(saved.recurrence) ? saved.recurrence.map(normalizeRule).filter(isPresent) : []);
	let items = /** @type {TemplateItem[]} */ (Array.isArray(saved.items) ? saved.items.map(normalizeTemplateItem).filter(isPresent) : []);
	if (!title || recurrence.length === 0) {
		return null;
	}

	let createdAt = isIsoDate(saved.createdAt) ? saved.createdAt : todayIsoDate();
	return {
		id: String(saved.id || createId('tpl')),
		title,
		recurrence,
		items,
		generationWindowDays: clampNumber(saved.generationWindowDays, 0, 365, suggestGenerationWindowDays(recurrence)),
		createdAt,
		updatedAt: isIsoDate(saved.updatedAt) ? saved.updatedAt : createdAt,
	};
}

/**
 * @param {unknown} saved
 * @returns {Instance | null}
 */
function normalizeInstance(saved) {
	if (!isPlainObject(saved) || !isIsoDate(saved.dueDate)) {
		return null;
	}

	let items = /** @type {InstanceItem[]} */ (Array.isArray(saved.items) ? saved.items.map(normalizeInstanceItem).filter(isPresent) : []);
	let completedAt = isIsoDateTime(saved.completedAt) ? saved.completedAt : null;

	if (!completedAt && saved.resolvedState === 'completed' && isIsoDateTime(saved.resolvedAt)) {
		completedAt = saved.resolvedAt;
	}

	if (!completedAt && saved.resolvedState === 'dismissed' && isIsoDateTime(saved.resolvedAt)) {
		completedAt = saved.resolvedAt;
	}

	let completedOn = normalizeCompletedOn(saved.completedOn) || deriveCompletedOn(completedAt);

	return {
		id: String(saved.id || createId('inst')),
		templateId: String(saved.templateId || ''),
		dueDate: saved.dueDate,
		items,
		completedAt,
		completedOn,
	};
}

/**
 * @param {unknown} saved
 * @returns {AppState}
 */
export function normalizeAppState(saved) {
	let state = defaultAppState();
	let source = isPlainObject(saved) ? saved : {};
	let lastOpenedDate = isIsoDate(source.lastOpenedDate) ? source.lastOpenedDate : state.lastOpenedDate;
	let themeMode = isThemeMode(source.themeMode) ? source.themeMode : state.themeMode;
	let templates = /** @type {Template[]} */ (Array.isArray(source.templates) ? source.templates.map(normalizeTemplate).filter(isPresent) : []);
	let templateIds = new Set(templates.map(template => template.id));
	let normalizedInstances = /** @type {Instance[]} */ (Array.isArray(source.instances)
		? source.instances.map(normalizeInstance).filter(isPresent)
		: []);
	let instances = normalizedInstances.filter(instance => templateIds.has(instance.templateId));

	return {
		version: VERSION,
		lastOpenedDate,
		themeMode,
		templates,
		instances,
	};
}

/**
 * @param {AppState} model
 * @returns {AppState}
 */
function buildModelSnapshot(model) {
	return {
		version: VERSION,
		lastOpenedDate: model.lastOpenedDate,
		themeMode: model.themeMode,
		templates: model.templates.map(template => ({
			...template,
			recurrence: template.recurrence.map(rule => ({ ...rule })),
			items: template.items.map(item => ({ ...item })),
		})),
		instances: model.instances.map(instance => ({
			...instance,
			items: instance.items.map(item => ({ ...item })),
		})),
	};
}

/**
 * @param {unknown} saved
 * @returns {AppState}
 */
export function migrateAppState(saved) {
	return normalizeAppState(saved || {});
}

/**
 * @param {unknown} value
 * @returns {Template}
 */
function normalizeEditableTemplateInput(value) {
	if (!isPlainObject(value)) {
		throw new Error('Template data is invalid.');
	}

	let title = String(value.title || '').trim();
	let recurrence = /** @type {RecurrenceRule[]} */ (Array.isArray(value.recurrence) ? value.recurrence.map(normalizeRule).filter(isPresent) : []);
	let items = /** @type {TemplateItem[]} */ (Array.isArray(value.items) ? value.items.map(normalizeTemplateItem).filter(isPresent) : []);
	if (!title) {
		throw new Error('Template title is required.');
	}
	if (recurrence.length === 0) {
		throw new Error('Add at least one recurrence rule.');
	}

	let createdAt = isIsoDate(value.createdAt) ? value.createdAt : todayIsoDate();
	return {
		id: String(value.id || createId('tpl')),
		title,
		recurrence,
		items,
		generationWindowDays: clampNumber(value.generationWindowDays, 0, 365, suggestGenerationWindowDays(recurrence)),
		createdAt,
		updatedAt: isIsoDate(value.updatedAt) ? value.updatedAt : createdAt,
	};
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepCopy(value) {
	return JSON.parse(JSON.stringify(value));
}

/**
 * @param {RecurrenceRule | null} [previousRule]
 * @returns {RecurrenceRule}
 */
export function createDefaultRule(previousRule = null) {
	if (previousRule) {
		let nextRule = normalizeRule(deepCopy(previousRule));
		if (nextRule) {
			nextRule.id = createId('rule');
			if (nextRule.interval > 1 && !isIsoDate(nextRule.startsOn)) {
				nextRule.startsOn = suggestRuleStartDate(nextRule);
			}
			if (nextRule.interval <= 1 && nextRule.startsOn) {
				delete nextRule.startsOn;
			}
			return nextRule;
		}
	}

	let rule = /** @type {RecurrenceRule} */ (normalizeRule({
		type: 'weekly',
		interval: 1,
		day: 'Monday',
	}));
	return rule;
}

/**
 * @returns {{ id: string, title: string, recurrence: RecurrenceRule[], items: TemplateItem[], generationWindowDays: number }}
 */
export function createDefaultTemplateDraft() {
	return {
		id: createId('tpl'),
		title: '',
		recurrence: [createDefaultRule()],
		items: [],
		generationWindowDays: DEFAULT_GENERATION_WINDOWS.weekly,
	};
}

/**
 * @param {RecurrenceRule['type']} type
 * @returns {number}
 */
function defaultGenerationWindowForType(type) {
	return DEFAULT_GENERATION_WINDOWS[type] || DEFAULT_GENERATION_WINDOWS.weekly;
}

/**
 * @param {RecurrenceRule[]} recurrence
 * @returns {number}
 */
export function suggestGenerationWindowDays(recurrence) {
	if (!Array.isArray(recurrence) || recurrence.length === 0) {
		return DEFAULT_GENERATION_WINDOWS.weekly;
	}

	return recurrence.reduce((largest, rule) => {
		return Math.max(largest, defaultGenerationWindowForType(rule.type));
	}, 0);
}

/**
 * @param {number | string | undefined} value
 * @returns {string}
 */
function formatOrdinalDay(value) {
	let day = Number(value);
	let absoluteDay = Math.abs(day);
	let lastTwoDigits = absoluteDay % 100;
	if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
		return `${day}th`;
	}

	let suffix = 'th';
	if (absoluteDay % 10 === 1) {
		suffix = 'st';
	}
	else if (absoluteDay % 10 === 2) {
		suffix = 'nd';
	}
	else if (absoluteDay % 10 === 3) {
		suffix = 'rd';
	}

	return `${day}${suffix}`;
}

/**
 * @param {RecurrenceRule} rule
 * @returns {string}
 */
export function createRecurrenceDescription(rule) {
	let everyLabel = rule.interval === 1 ? 'Every' : `Every ${rule.interval}`;
	if (rule.type === 'daily') {
		return `${everyLabel} ${rule.interval === 1 ? 'day' : 'days'}`;
	}

	if (rule.type === 'weekly') {
		return `${everyLabel} ${rule.interval === 1 ? 'week' : 'weeks'} on ${rule.day}`;
	}

	if (rule.type === 'monthly') {
		if (rule.mode === 'weekday_position') {
			return `${everyLabel} ${rule.interval === 1 ? 'month' : 'months'} on the ${ORDINAL_LABELS[String(rule.ordinal)]} ${rule.weekday}`;
		}
		return `${everyLabel} ${rule.interval === 1 ? 'month' : 'months'} on the ${formatOrdinalDay(rule.day)}`;
	}

	return `${everyLabel} ${rule.interval === 1 ? 'year' : 'years'} on ${MONTH_LABELS[(rule.month || 1) - 1]} ${rule.day}`;
}

/**
 * @param {RecurrenceRule} rule
 * @param {string} [referenceDate]
 * @returns {string}
 */
export function suggestRuleStartDate(rule, referenceDate = todayIsoDate()) {
	let safeReferenceDate = isIsoDate(referenceDate) ? referenceDate : todayIsoDate();
	let referenceDayNumber = isoDateToDayNumber(safeReferenceDate);

	if (rule.type === 'daily') {
		return safeReferenceDate;
	}

	if (rule.type === 'weekly') {
		let weekdayName = WEEKDAY_NAMES.includes(String(rule.day)) ? String(rule.day) : 'Monday';
		for (let dayNumber = referenceDayNumber; dayNumber < referenceDayNumber + 7; dayNumber += 1) {
			let candidate = dayNumberToIsoDate(dayNumber);
			if (weekdayNameFromIsoDate(candidate) === weekdayName) {
				return candidate;
			}
		}
		return safeReferenceDate;
	}

	if (rule.type === 'monthly') {
		let start = isoDateToDate(safeReferenceDate);
		for (let monthOffset = 0; monthOffset < 240; monthOffset += 1) {
			let year = start.getFullYear() + Math.floor((start.getMonth() + monthOffset) / 12);
			let monthIndex = (start.getMonth() + monthOffset) % 12;
			let day = null;

			if (rule.mode === 'weekday_position') {
				day = nthWeekdayOfMonth(year, monthIndex, rule.weekday || 'Monday', rule.ordinal || 1);
			}
			else {
				day = Math.min(typeof rule.day === 'number' ? rule.day : 1, daysInMonth(year, monthIndex));
			}

			if (day === null) {
				continue;
			}

			let candidate = dayNumberToIsoDate(Math.floor(Date.UTC(year, monthIndex, day) / 86400000));
			if (isoDateToDayNumber(candidate) >= referenceDayNumber) {
				return candidate;
			}
		}
		return safeReferenceDate;
	}

	let start = isoDateToDate(safeReferenceDate);
	for (let yearOffset = 0; yearOffset < 400; yearOffset += 1) {
		let year = start.getFullYear() + yearOffset;
		let month = clampNumber(rule.month, 1, 12, 1) - 1;
		let day = Math.min(typeof rule.day === 'number' ? rule.day : 1, daysInMonth(year, month));
		let candidate = dayNumberToIsoDate(Math.floor(Date.UTC(year, month, day) / 86400000));
		if (isoDateToDayNumber(candidate) >= referenceDayNumber) {
			return candidate;
		}
	}

	return safeReferenceDate;
}

/**
 * @param {RecurrenceRule} rule
 * @param {string} fallbackDate
 * @returns {string}
 */
function ruleStartsOn(rule, fallbackDate) {
	return isIsoDate(rule.startsOn) ? rule.startsOn : fallbackDate;
}

/**
 * @param {number} dayIndex
 * @returns {string}
 */
function weekdayNameFromDayIndex(dayIndex) {
	return WEEKDAY_NAMES[(dayIndex + 6) % 7];
}

/**
 * @param {string} value
 * @returns {string}
 */
function weekdayNameFromIsoDate(value) {
	return weekdayNameFromDayIndex(isoDateToDate(value).getDay());
}

/**
 * @param {number} dayNumber
 * @returns {number}
 */
function startOfWeek(dayNumber) {
	let weekday = new Date(dayNumber * 86400000).getUTCDay();
	let mondayOffset = (weekday + 6) % 7;
	return dayNumber - mondayOffset;
}

/**
 * @param {string} anchorDate
 * @param {string} candidateDate
 * @returns {number}
 */
function monthDifference(anchorDate, candidateDate) {
	let anchor = isoDateToDate(anchorDate);
	let candidate = isoDateToDate(candidateDate);
	return (candidate.getFullYear() - anchor.getFullYear()) * 12 + (candidate.getMonth() - anchor.getMonth());
}

/**
 * @param {string} anchorDate
 * @param {string} candidateDate
 * @returns {number}
 */
function yearDifference(anchorDate, candidateDate) {
	return isoDateToDate(candidateDate).getFullYear() - isoDateToDate(anchorDate).getFullYear();
}

/**
 * @param {number} year
 * @param {number} monthIndex
 * @returns {number}
 */
function daysInMonth(year, monthIndex) {
	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * @param {number} year
 * @param {number} monthIndex
 * @param {string} weekdayName
 * @param {number} ordinal
 * @returns {number | null}
 */
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

/**
 * @param {Template} template
 * @param {RecurrenceRule} rule
 * @param {string} dueDate
 * @returns {boolean}
 */
function matchesRule(template, rule, dueDate) {
	let dueDayNumber = isoDateToDayNumber(dueDate);
	let anchorDate = ruleStartsOn(rule, template.createdAt);
	let anchorDayNumber = isoDateToDayNumber(anchorDate);
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
		let diff = monthDifference(anchorDate, dueDate);
		if (diff < 0 || diff % rule.interval !== 0) {
			return false;
		}

		let date = isoDateToDate(dueDate);
		let year = date.getFullYear();
		let monthIndex = date.getMonth();
		let day = date.getDate();

		if (rule.mode === 'weekday_position') {
			return day === nthWeekdayOfMonth(year, monthIndex, rule.weekday || 'Monday', rule.ordinal || 1);
		}

		let dayOfMonth = typeof rule.day === 'number' ? rule.day : 1;
		return day === Math.min(dayOfMonth, daysInMonth(year, monthIndex));
	}

	let yearDiff = yearDifference(anchorDate, dueDate);
	if (yearDiff < 0 || yearDiff % rule.interval !== 0) {
		return false;
	}

	let candidate = isoDateToDate(dueDate);
	let month = candidate.getMonth() + 1;
	let day = candidate.getDate();
	let maxDay = daysInMonth(candidate.getFullYear(), candidate.getMonth());
	let dayOfMonth = typeof rule.day === 'number' ? rule.day : 1;
	return month === rule.month && day === Math.min(dayOfMonth, maxDay);
}

/**
 * @param {Template} template
 * @param {string} dueDate
 * @returns {boolean}
 */
export function templateMatchesDate(template, dueDate) {
	return template.recurrence.some(rule => matchesRule(template, rule, dueDate));
}

/**
 * @param {Template} template
 * @param {string} dueDate
 * @returns {Instance}
 */
function buildInstance(template, dueDate) {
	return {
		id: createId('inst'),
		templateId: template.id,
		dueDate,
		items: template.items.map(item => ({
			id: item.id,
			label: item.label,
			state: 0,
		})),
		completedAt: null,
		completedOn: null,
	};
}

/**
 * @param {Instance} instance
 * @returns {boolean}
 */
export function isInstanceResolved(instance) {
	return isIsoDateTime(instance.completedAt);
}

/**
 * @param {Instance} instance
 * @returns {boolean}
 */
export function hasChecklist(instance) {
	return Array.isArray(instance.items) && instance.items.length > 0;
}

/**
 * @param {Instance} instance
 * @param {number} todayNumber
 * @returns {boolean}
 */
export function isExpiredResolvedInstance(instance, todayNumber) {
	if (!isInstanceResolved(instance) || !instance.completedAt) {
		return false;
	}

	let completedOn = normalizeCompletedOn(instance.completedOn) || deriveCompletedOn(instance.completedAt);
	if (!completedOn) {
		return false;
	}

	let resolvedDayNumber = isoDateToDayNumber(completedOn);
	return todayNumber - resolvedDayNumber >= RESOLVED_RETENTION_DAYS;
}

/**
 * @param {Instance[]} instances
 * @returns {Instance[]}
 */
export function sortInstances(instances) {
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

/**
 * @param {Instance[]} instances
 * @param {Template} template
 * @param {number} dayNumber
 * @returns {Instance | null}
 */
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

/**
 * @param {Template} template
 * @param {number} startDayNumber
 * @param {number} endDayNumber
 * @returns {string | null}
 */
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

/**
 * @param {string | null} leftDueDate
 * @param {string | null} rightDueDate
 * @returns {string | null}
 */
function laterDueDate(leftDueDate, rightDueDate) {
	if (!leftDueDate) {
		return rightDueDate;
	}
	if (!rightDueDate) {
		return leftDueDate;
	}

	return isoDateToDayNumber(leftDueDate) >= isoDateToDayNumber(rightDueDate) ? leftDueDate : rightDueDate;
}

/**
 * @param {Template} template
 * @param {Instance[]} instances
 * @param {number | null} backfillStartDayNumber
 * @param {number} todayNumber
 * @returns {string | null}
 */
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

/**
 * @param {Instance[]} instances
 * @param {Set<string>} existingKeys
 * @param {Instance} instance
 * @returns {void}
 */
function retainInstance(instances, existingKeys, instance) {
	let key = `${instance.templateId}::${instance.dueDate}`;
	if (existingKeys.has(key)) {
		return;
	}

	instances.push(instance);
	existingKeys.add(key);
}

/**
 * @param {Template} template
 * @param {number} count
 * @param {number} startDayNumber
 * @param {number} maxLookbackDays
 * @returns {string[]}
 */
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

/**
 * @param {Template[]} templates
 * @param {Record<string, { count: number, completedItems: number }>} seedConfig
 * @param {number} todayNumber
 * @returns {Instance[]}
 */
function createDemoOverdueInstances(templates, seedConfig, todayNumber) {
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
					state: index < config.completedItems ? 1 : 0,
				}));
			}
			return instance;
		});
	});
}

/**
 * @returns {AppState}
 */
export function createDemoAppState() {
	/** @type {Template[]} */
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
			updatedAt: '2026-03-02',
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
			updatedAt: '2026-03-05',
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
			updatedAt: '2026-04-06',
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
			updatedAt: '2026-04-01',
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
			updatedAt: '2026-01-10',
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
			updatedAt: '2026-01-14',
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
			updatedAt: '2025-05-02',
		}
	];

	let instances = createDemoOverdueInstances(templates, {
		tpl_kitchen_reset: { count: 1, completedItems: 1 },
		tpl_balcony_plants: { count: 1, completedItems: 2 },
		tpl_smoke_alarms: { count: 1, completedItems: 0 }
	}, todayDayNumber());

	return normalizeAppState({
		version: VERSION,
		themeMode: 'auto',
		templates,
		instances,
	});
}

/**
 * @param {AppState} data
 * @param {{ todayNumber?: number }} [options]
 * @returns {AppState}
 */
export function syncGeneratedInstances(data, options = {}) {
	let todayNumber = options.todayNumber ?? todayDayNumber();
	let backfillStartDayNumber = isIsoDate(data.lastOpenedDate)
		? Math.min(isoDateToDayNumber(data.lastOpenedDate), todayNumber)
		: null;
	let activeTemplateIds = new Set(data.templates.map(template => template.id));
	let sourceInstances = data.instances.filter(instance => {
		return activeTemplateIds.has(instance.templateId) && !isExpiredResolvedInstance(instance, todayNumber);
	});
	/** @type {Instance[]} */
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

/**
 * @param {AppState} data
 * @param {string} templateId
 * @param {number} todayNumber
 * @returns {void}
 */
function clearFutureInstancesForTemplate(data, templateId, todayNumber) {
	data.instances = data.instances.filter(instance => {
		if (instance.templateId !== templateId) {
			return true;
		}

		if (isInstanceResolved(instance)) {
			return true;
		}

		return isoDateToDayNumber(instance.dueDate) < todayNumber;
	});
}

/**
 * @param {Instance} instance
 * @returns {Instance}
 */
function resolveInstance(instance) {
	let now = new Date();
	let timestamp = now.toISOString();
	instance.completedAt = timestamp;
	instance.completedOn = todayIsoDate(now);
	instance.items = instance.items.map(item => ({
		...item,
		state: item.state === 0 ? 1 : item.state,
	}));
	return instance;
}

/**
 * @param {Instance} instance
 * @returns {Instance}
 */
function reopenInstance(instance) {
	instance.completedAt = null;
	instance.completedOn = null;
	return instance;
}

/**
 * @param {unknown} [savedState]
 */
export function createApp(savedState = null) {
	let state = normalizeAppState(savedState);

	return {
		...state,

		/** @param {unknown} [nextState] */
		reset(nextState = undefined) {
			Object.assign(this, normalizeAppState(nextState));
			return this;
		},

		/** @returns {AppState} */
		toJSON() {
			return buildModelSnapshot(this);
		},

		/** @param {ThemeMode | string} theme */
		setTheme(theme) {
			this.themeMode = isThemeMode(theme) ? theme : 'auto';
			return this.themeMode;
		},

		/** @param {string} [dateValue] */
		setLastOpenedDate(dateValue = todayIsoDate()) {
			this.lastOpenedDate = isIsoDate(dateValue) ? dateValue : todayIsoDate();
			return this.lastOpenedDate;
		},

		/** @param {{ todayNumber?: number }} [options] */
		syncGeneratedInstances(options = {}) {
			syncGeneratedInstances(this, options);
			return this;
		},

		/** @returns {Template[]} */
		sortedTemplates() {
			return [...this.templates].sort((left, right) => left.title.localeCompare(right.title));
		},

		/** @param {string} templateId */
		templateById(templateId) {
			return this.templates.find(template => template.id === templateId) || null;
		},

		/** @param {{ todayNumber?: number }} [options] */
		visibleInstances(options = {}) {
			let activeTodayNumber = options.todayNumber ?? todayDayNumber();
			return this.instances.filter(instance => {
				let template = this.templateById(instance.templateId);
				return Boolean(template) && !isExpiredResolvedInstance(instance, activeTodayNumber);
			});
		},

		/** @param {string} templateId */
		countTemplateInstances(templateId) {
			return this.visibleInstances().filter(instance => instance.templateId === templateId).length;
		},

		/** @param {unknown} templateInput */
		createTemplate(templateInput) {
			let today = todayIsoDate();
			let normalized = normalizeEditableTemplateInput(templateInput);
			let template = {
				...normalized,
				createdAt: today,
				updatedAt: today,
			};
			this.templates = [...this.templates, template];
			return template;
		},

		/**
		 * @param {string} templateId
		 * @param {unknown} templateInput
		 */
		updateTemplate(templateId, templateInput) {
			let templateIndex = this.templates.findIndex(template => template.id === templateId);
			if (templateIndex === -1) {
				throw new Error('Template not found.');
			}
			if (!isPlainObject(templateInput)) {
				throw new Error('Template data is invalid.');
			}

			let existing = this.templates[templateIndex];
			let today = todayIsoDate();
			let normalized = normalizeEditableTemplateInput({ ...templateInput, id: templateId });
			let updated = {
				...existing,
				...normalized,
				id: templateId,
				createdAt: existing.createdAt,
				updatedAt: today,
			};

			this.templates.splice(templateIndex, 1, updated);
			clearFutureInstancesForTemplate(this, templateId, todayDayNumber());
			return updated;
		},

		/** @param {string} templateId */
		deleteTemplate(templateId) {
			let beforeLength = this.templates.length;
			this.templates = this.templates.filter(template => template.id !== templateId);
			this.instances = this.instances.filter(instance => instance.templateId !== templateId);
			return this.templates.length !== beforeLength;
		},

		/**
		 * @param {string} instanceId
		 * @param {string} itemId
		 */
		toggleInstanceItem(instanceId, itemId) {
			let instance = this.instances.find(entry => entry.id === instanceId);
			if (!instance || !hasChecklist(instance)) {
				return false;
			}

			let item = instance.items.find(entry => entry.id === itemId);
			if (!item) {
				return false;
			}

			let wasCompleted = Boolean(instance.completedAt);
			item.state = item.state === 1 ? 0 : 1;
			if (wasCompleted && item.state === 0) {
				reopenInstance(instance);
			}
			if (instance.items.every(entry => entry.state === 1)) {
				resolveInstance(instance);
			}
			return true;
		},

		/** @param {string} instanceId */
		completeInstance(instanceId) {
			let instance = this.instances.find(entry => entry.id === instanceId);
			if (!instance || isInstanceResolved(instance)) {
				return false;
			}

			resolveInstance(instance);
			return true;
		},

		/** @param {string} instanceId */
		toggleSingleActionInstance(instanceId) {
			let instance = this.instances.find(entry => entry.id === instanceId);
			if (!instance || hasChecklist(instance)) {
				return false;
			}

			if (isInstanceResolved(instance)) {
				reopenInstance(instance);
			}
			else {
				resolveInstance(instance);
			}

			return true;
		},
	};
}
