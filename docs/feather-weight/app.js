// @ts-check

export const VERSION = '1.0';
export const KG_TO_LBS = 2.2046226218;

export const UNIT_OPTIONS = Object.freeze(['KG', 'LBS']);
export const ZOOM_OPTIONS = Object.freeze(['Week', 'Month', 'Year']);
export const VIEW_OPTIONS = Object.freeze(['Week', 'Month']);
export const THEME_OPTIONS = Object.freeze(['auto', 'light', 'dark']);

/** @typedef {'KG' | 'LBS'} Unit */
/** @typedef {'Week' | 'Month' | 'Year'} ZoomLevel */
/** @typedef {'Week' | 'Month'} ViewOption */
/** @typedef {'auto' | 'light' | 'dark'} Theme */
/** @typedef {'day' | 'week' | 'month'} ShiftUnit */

/**
 * @typedef Goal
 * @property {number} weightKg
 * @property {number} rateKg
 * @property {ViewOption} rateUnit
 */

/** @typedef {Record<string, number>} EntriesByDate */

/**
 * @typedef AppState
 * @property {string} version
 * @property {Theme} themeMode
 * @property {Unit} unit
 * @property {ViewOption} historyView
 * @property {ZoomLevel} zoom
 * @property {Goal | null} goal
 * @property {EntriesByDate} entries
 */

/**
 * @typedef EntryRecord
 * @property {string} date
 * @property {number} weightKg
 */

/**
 * @typedef PeriodHistory
 * @property {string} periodStart
 * @property {ViewOption} periodKind
 * @property {EntryRecord[]} entries
 * @property {EntryRecord | null} medianEntry
 * @property {number | null} medianWeightKg
 * @property {number} entryCount
 * @property {string | null} previousPeriodStart
 * @property {number | null} deltaKg
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_GOAL_RATE_KG = 0.5;

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
	return typeof value === 'number' && Number.isFinite(value);
}

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
 * @returns {value is Unit}
 */
function isUnit(value) {
	return typeof value === 'string' && UNIT_OPTIONS.includes(value);
}

/**
 * @param {unknown} value
 * @returns {value is ViewOption}
 */
function isViewOption(value) {
	return typeof value === 'string' && VIEW_OPTIONS.includes(value);
}

/**
 * @param {unknown} value
 * @returns {value is ZoomLevel}
 */
function isZoomLevel(value) {
	return typeof value === 'string' && ZOOM_OPTIONS.includes(value);
}

/**
 * @param {unknown} goal
 * @returns {Goal | null}
 */
function normalizeGoal(goal) {
	if (!isPlainObject(goal) || !isFiniteNumber(goal.weightKg)) {
		return null;
	}

	return {
		weightKg: goal.weightKg,
		rateKg: isFiniteNumber(goal.rateKg) ? goal.rateKg : DEFAULT_GOAL_RATE_KG,
		rateUnit: isViewOption(goal.rateUnit) ? goal.rateUnit : 'Week',
	};
}

/**
 * @param {unknown} entries
 * @returns {EntriesByDate}
 */
function normalizeEntries(entries) {
	if (!isPlainObject(entries)) {
		return {};
	}

	/** @type {EntriesByDate} */
	let normalized = {};
	for (let [date, weightKg] of Object.entries(entries)) {
		if (ISO_DATE_RE.test(date) && isFiniteNumber(weightKg)) {
			normalized[date] = weightKg;
		}
	}

	return normalized;
}

/**
 * @param {AppState} model
 * @returns {AppState}
 */
function buildModelSnapshot(model) {
	return {
		version: VERSION,
		themeMode: model.themeMode,
		unit: model.unit,
		historyView: model.historyView,
		zoom: model.zoom,
		goal: model.goal ? { ...model.goal } : null,
		entries: { ...model.entries },
	};
}

/**
 * @returns {AppState}
 */
function defaultAppState() {
	return {
		version: VERSION,
		themeMode: 'auto',
		unit: 'KG',
		historyView: 'Week',
		zoom: 'Month',
		goal: null,
		entries: {},
	};
}

/**
 * @param {unknown} saved
 * @returns {AppState}
 */
export function normalizeAppState(saved) {
	let defaults = defaultAppState();
	/** @type {Record<string, unknown>} */
	let source = isPlainObject(saved) ? saved : {};

	return {
		version: VERSION,
		themeMode: isTheme(source.themeMode) ? source.themeMode : defaults.themeMode,
		unit: isUnit(source.unit) ? source.unit : defaults.unit,
		historyView: isViewOption(source.historyView) ? source.historyView : defaults.historyView,
		zoom: isZoomLevel(source.zoom) ? source.zoom : defaults.zoom,
		goal: normalizeGoal(source.goal),
		entries: normalizeEntries(source.entries),
	};
}

/**
 * @param {{ totalDays?: number, today?: Date, random?: () => number, anchorWeightKg?: number }} [options]
 * @returns {EntriesByDate}
 */
export function generateDemoEntries({
	totalDays = 365 * 4,
	today = new Date(),
	random = Math.random,
	anchorWeightKg = 72,
} = {}) {
	/** @type {EntriesByDate} */
	let generated = {};
	let start = new Date(today);
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - totalDays);

	let weightKg = anchorWeightKg + (random() - 0.5) * 8;
	for (let dayIndex = 0; dayIndex <= totalDays; dayIndex += 1) {
		if (random() > 0.5) {
			continue;
		}

		weightKg += (random() - 0.5) * 0.42;
		weightKg += (anchorWeightKg - weightKg) * 0.015;
		weightKg = Math.max(54, Math.min(108, weightKg));

		let entryDate = new Date(start);
		entryDate.setDate(start.getDate() + dayIndex);
		generated[isoDateFromDate(entryDate)] = Number(weightKg.toFixed(1));
	}

	let todayIso = isoDateFromDate(today);
	if (!generated[todayIso]) {
		generated[todayIso] = Number(weightKg.toFixed(1));
	}

	return generated;
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function isoDateFromDate(date) {
	let year = date.getFullYear();
	let month = String(date.getMonth() + 1).padStart(2, '0');
	let day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * @param {string} dateValue
 * @returns {Date}
 */
export function isoDateToDate(dateValue) {
	let [year, month, day] = String(dateValue).split('-').map(Number);
	return new Date(year, month - 1, day);
}

/**
 * @param {Date} [now]
 * @returns {string}
 */
export function todayIsoDate(now = new Date()) {
	return isoDateFromDate(now);
}

/**
 * @param {string} dateValue
 * @returns {number}
 */
export function dateToDayNumber(dateValue) {
	let [year, month, day] = String(dateValue).split('-').map(Number);
	return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

/**
 * @param {number} dayNumber
 * @returns {Date}
 */
export function dayNumberToDate(dayNumber) {
	let utcDate = new Date(dayNumber * 86400000);
	return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
}

/**
 * @param {number} dayNumber
 * @returns {string}
 */
export function dayNumberToIsoDate(dayNumber) {
	return isoDateFromDate(dayNumberToDate(dayNumber));
}

/**
 * @param {string} dateValue
 * @returns {string}
 */
export function startOfWeek(dateValue) {
	let date = isoDateToDate(dateValue);
	let offset = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - offset);
	return isoDateFromDate(date);
}

/**
 * @param {string} dateValue
 * @returns {string}
 */
export function startOfMonth(dateValue) {
	let date = isoDateToDate(dateValue);
	date.setDate(1);
	return isoDateFromDate(date);
}

/**
 * @param {string} dateValue
 * @param {'day' | 'week' | 'month'} unit
 * @param {number} amount
 * @returns {string}
 */
export function shiftDate(dateValue, unit, amount) {
	let next = isoDateToDate(dateValue);
	if (unit === 'day') {
		next.setDate(next.getDate() + amount);
	}
	else if (unit === 'week') {
		next.setDate(next.getDate() + amount * 7);
	}
	else if (unit === 'month') {
		next.setMonth(next.getMonth() + amount);
	}
	return isoDateFromDate(next);
}

/**
 * @param {unknown} [savedState]
 */
export function createApp(savedState = null) {
	let state = normalizeAppState(savedState);

	return {
		...state,

		/** @param {Partial<AppState>} [nextState] */
		reset(nextState = undefined) {
			Object.assign(this, normalizeAppState(nextState));
			return this;
		},

		/** @returns {AppState} */
		toJSON() {
			return buildModelSnapshot(this);
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
		 * @param {Unit | string} unit
		 * @returns {Unit}
		 */
		setUnit(unit) {
			this.unit = isUnit(unit) ? unit : 'KG';
			return this.unit;
		},

		/**
		 * @param {ViewOption | string} historyView
		 * @returns {ViewOption}
		 */
		setHistoryView(historyView) {
			this.historyView = historyView === 'Month' ? 'Month' : 'Week';
			return this.historyView;
		},

		/**
		 * @param {ZoomLevel | string} zoom
		 * @returns {ZoomLevel}
		 */
		setZoom(zoom) {
			this.zoom = isZoomLevel(zoom) ? zoom : 'Month';
			return this.zoom;
		},

		/**
		 * @param {Goal | null} goal
		 * @returns {Goal | null}
		 */
		setGoal(goal) {
			this.goal = normalizeGoal(goal);
			return this.goal;
		},

		/** @returns {null} */
		clearGoal() {
			this.goal = null;
			return this.goal;
		},

		/**
		 * @param {string} date
		 * @param {number} weightKg
		 * @param {string} [previousDate]
		 * @returns {number}
		 */
		upsertEntry(date, weightKg, previousDate = undefined) {
			if (!ISO_DATE_RE.test(String(date))) {
				throw new Error('Entry date must be an ISO date string.');
			}
			if (!isFiniteNumber(weightKg)) {
				throw new Error('Entry weight must be a finite number.');
			}

			let nextEntries = { ...this.entries };
			if (previousDate && previousDate !== date) {
				delete nextEntries[previousDate];
			}
			nextEntries[date] = Number(weightKg.toFixed(3));
			this.entries = nextEntries;
			return this.entries[date];
		},

		/**
		 * @param {string} date
		 * @returns {boolean}
		 */
		removeEntry(date) {
			if (!Object.prototype.hasOwnProperty.call(this.entries, date)) {
				return false;
			}
			let nextEntries = { ...this.entries };
			delete nextEntries[date];
			this.entries = nextEntries;
			return true;
		},

		/**
		 * @param {EntriesByDate | null | undefined} entries
		 * @returns {EntriesByDate}
		 */
		replaceEntries(entries) {
			this.entries = normalizeEntries(entries);
			return this.entries;
		},

		/**
		 * @param {EntriesByDate | null | undefined} entries
		 * @returns {EntriesByDate}
		 */
		mergeEntries(entries) {
			this.entries = {
				...this.entries,
				...normalizeEntries(entries),
			};
			return this.entries;
		},

		/**
		 * @param {Goal | null} [goal]
		 * @returns {ViewOption}
		 */
		goalRateUnit(goal = null) {
			let activeGoal = goal ?? this.goal;
			return activeGoal?.rateUnit === 'Month' ? 'Month' : 'Week';
		},

		/**
		 * @param {Goal | null} [goal]
		 * @returns {number}
		 */
		goalRateValue(goal = null) {
			let activeGoal = goal ?? this.goal;
			return isFiniteNumber(activeGoal?.rateKg) ? activeGoal.rateKg : DEFAULT_GOAL_RATE_KG;
		},

		/**
		 * @param {number} weightKg
		 * @param {Unit} [unit]
		 * @returns {number}
		 */
		convertWeightKg(weightKg, unit = undefined) {
			let activeUnit = unit ?? this.unit;
			return activeUnit === 'KG' ? weightKg : weightKg * KG_TO_LBS;
		},

		/** @returns {EntryRecord[]} */
		sortedEntriesByDate() {
			return Object.keys(this.entries)
				.sort((left, right) => left.localeCompare(right))
				.map((date) => ({ date, weightKg: this.entries[date] }));
		},

		/**
		 * @param {string} dateValue
		 * @returns {number | null}
		 */
		weightKgAtDate(dateValue) {
			let entries = this.sortedEntries;
			if (!entries.length) {
				return null;
			}

			let exactWeight = this.entries[dateValue];
			if (isFiniteNumber(exactWeight)) {
				return exactWeight;
			}

			let targetDayNumber = dateToDayNumber(dateValue);
			let firstDayNumber = dateToDayNumber(entries[0].date);
			let lastDayNumber = dateToDayNumber(entries[entries.length - 1].date);
			if (targetDayNumber < firstDayNumber || targetDayNumber > lastDayNumber) {
				return null;
			}

			for (let index = 1; index < entries.length; index += 1) {
				let previousEntry = entries[index - 1];
				let nextEntry = entries[index];
				let previousDayNumber = dateToDayNumber(previousEntry.date);
				let nextDayNumber = dateToDayNumber(nextEntry.date);

				if (targetDayNumber < previousDayNumber || targetDayNumber > nextDayNumber) {
					continue;
				}

				let daySpan = nextDayNumber - previousDayNumber;
				if (daySpan === 0) {
					return previousEntry.weightKg;
				}

				let progress = (targetDayNumber - previousDayNumber) / daySpan;
				return previousEntry.weightKg + (nextEntry.weightKg - previousEntry.weightKg) * progress;
			}

			return null;
		},

		/**
		 * @param {number} startDayNumber
		 * @param {number} endDayNumber
		 * @returns {number | null}
		 */
		averageWeightKgForDayRange(startDayNumber, endDayNumber) {
			if (endDayNumber < startDayNumber) {
				return null;
			}

			let totalWeightKg = 0;
			let sampleCount = 0;
			for (let dayNumber = startDayNumber; dayNumber <= endDayNumber; dayNumber += 1) {
				let weightKg = this.weightKgAtDate(dayNumberToIsoDate(dayNumber));
				if (weightKg === null) {
					continue;
				}
				totalWeightKg += weightKg;
				sampleCount += 1;
			}

			if (sampleCount === 0) {
				return null;
			}

			return totalWeightKg / sampleCount;
		},

		/**
		 * @param {EntryRecord[]} entries
		 * @returns {EntryRecord | null}
		 */
		medianEntryForPeriod(entries) {
			if (!entries.length) {
				return null;
			}

			let sortedByWeight = [...entries].sort((left, right) => {
				if (left.weightKg !== right.weightKg) {
					return left.weightKg - right.weightKg;
				}
				return left.date.localeCompare(right.date);
			});

			return sortedByWeight[Math.floor((sortedByWeight.length - 1) / 2)];
		},

		/**
		 * @param {ViewOption} [periodKind]
		 * @returns {PeriodHistory[]}
		 */
		buildPeriodHistory(periodKind = undefined) {
			let activePeriodKind = periodKind ?? this.historyView;
			let getPeriodStart = activePeriodKind === 'Month' ? startOfMonth : startOfWeek;
			/** @type {ShiftUnit} */
			let shiftUnit = activePeriodKind === 'Month' ? 'month' : 'week';
			/** @type {Map<string, EntryRecord[]>} */
			let periodsByStart = new Map();

			for (let entry of this.sortedEntries) {
				let periodStart = getPeriodStart(entry.date);
				let bucket = periodsByStart.get(periodStart) || [];
				bucket.push(entry);
				periodsByStart.set(periodStart, bucket);
			}

			let periods = Array.from(periodsByStart.entries())
				.sort((left, right) => right[0].localeCompare(left[0]))
				.map(([periodStart, entries]) => {
					let periodEntries = [...entries].sort((left, right) => left.date.localeCompare(right.date));
					let medianEntry = this.medianEntryForPeriod(periodEntries);
					return {
						periodStart,
						periodKind: activePeriodKind,
						entries: periodEntries,
						medianEntry,
						medianWeightKg: medianEntry?.weightKg ?? null,
						entryCount: periodEntries.length,
					};
				});

			let periodLookup = new Map(periods.map((period) => [period.periodStart, period]));
			return periods.map((period) => {
				let previousPeriod = periodLookup.get(shiftDate(period.periodStart, shiftUnit, -1));
				let deltaKg = previousPeriod?.medianEntry && period.medianEntry
					? period.medianEntry.weightKg - previousPeriod.medianEntry.weightKg
					: null;

				return {
					...period,
					previousPeriodStart: previousPeriod?.periodStart ?? null,
					deltaKg,
				};
			});
		},

		/** @returns {{ periodStart: string, deltaKg: number } | null} */
		sinceLastWeekChange() {
			let currentWeek = this.weeklyHistory[0];
			if (!currentWeek || !isFiniteNumber(currentWeek.deltaKg)) {
				return null;
			}

			return {
				periodStart: currentWeek.periodStart,
				deltaKg: currentWeek.deltaKg,
			};
		},

		/**
		 * @returns {{
		 *   currentAverageKg: number,
		 *   previousAverageKg: number,
		 *   deltaKg: number,
		 * } | null}
		 */
		thirtyDayTrend() {
			let latest = this.lastEntry;
			if (!latest) {
				return null;
			}

			let latestDayNumber = dateToDayNumber(latest.date);
			let currentAverageKg = this.averageWeightKgForDayRange(latestDayNumber - 29, latestDayNumber);
			let previousAverageKg = this.averageWeightKgForDayRange(latestDayNumber - 59, latestDayNumber - 30);
			if (currentAverageKg === null || previousAverageKg === null) {
				return null;
			}

			return {
				currentAverageKg,
				previousAverageKg,
				deltaKg: currentAverageKg - previousAverageKg,
			};
		},

		/**
		 * @returns {{
		 *   targetWeightKg: number,
		 *   currentWeightKg: number | null,
		 *   remainingKg: number | null,
		 *   rateKg: number,
		 *   rateUnit: ViewOption,
		 *   periodsRemaining: number | null,
		 *   reached: boolean,
		 * } | null}
		 */
		goalStatus() {
			if (!this.goal) {
				return null;
			}

			let currentWeightKg = this.lastEntry?.weightKg ?? null;
			let remainingKg = currentWeightKg === null ? null : currentWeightKg - this.goal.weightKg;
			let rateKg = this.goalRateValue();
			let periodsRemaining = remainingKg === null
				? null
				: remainingKg <= 0
					? 0
					: Math.ceil(remainingKg / rateKg);

			return {
				targetWeightKg: this.goal.weightKg,
				currentWeightKg,
				remainingKg,
				rateKg,
				rateUnit: this.goalRateUnit(),
				periodsRemaining,
				reached: remainingKg !== null && remainingKg <= 0,
			};
		},

		/**
		 * @param {number | null} [anchorWeightKg]
		 * @returns {{
		 *   anchorWeightKg: number,
		 *   completedChangeKg: number,
		 *   totalChangeKg: number,
		 *   fraction: number,
		 * } | null}
		 */
		goalProgress(anchorWeightKg = null) {
			let activeAnchorWeightKg = anchorWeightKg ?? this.sortedEntries[0]?.weightKg ?? null;
			let status = this.goalStatus();
			if (!status || status.currentWeightKg === null || activeAnchorWeightKg === null) {
				return null;
			}

			let totalChangeKg = activeAnchorWeightKg - status.targetWeightKg;
			if (totalChangeKg <= 0) {
				return null;
			}

			let completedChangeKg = activeAnchorWeightKg - status.currentWeightKg;
			let fraction = Math.min(Math.max(completedChangeKg / totalChangeKg, 0), 1);
			return {
				anchorWeightKg: activeAnchorWeightKg,
				completedChangeKg,
				totalChangeKg,
				fraction,
			};
		},

		/**
		 * @param {ZoomLevel} [zoom]
		 * @returns {EntryRecord[]}
		 */
		chartEntriesForZoom(zoom = undefined) {
			let activeZoom = zoom ?? this.zoom;
			let entries = this.sortedEntries;
			if (!entries.length || activeZoom === 'Year') {
				return entries;
			}

			let latestDate = entries[entries.length - 1].date;
			let cutoff = activeZoom === 'Week'
				? shiftDate(startOfWeek(latestDate), 'week', -15)
				: shiftDate(startOfMonth(latestDate), 'month', -11);

			return entries.filter((entry) => entry.date >= cutoff);
		},

		/**
		 * @param {ZoomLevel} [zoom]
		 * @returns {{
		 *   zoom: ZoomLevel,
		 *   minDayNumber: number | null,
		 *   maxDayNumber: number | null,
		 *   points: {
		 *     date: string,
		 *     dayNumber: number,
		 *     weightKg: number,
		 *   }[],
		 * }}
		 */
		buildChartSeries(zoom = undefined) {
			let activeZoom = zoom ?? this.zoom;
			let entries = this.chartEntriesForZoom(activeZoom);
			if (!entries.length) {
				return {
					zoom: activeZoom,
					minDayNumber: null,
					maxDayNumber: null,
					points: [],
				};
			}

			return {
				zoom: activeZoom,
				minDayNumber: dateToDayNumber(entries[0].date),
				maxDayNumber: dateToDayNumber(entries[entries.length - 1].date),
				points: entries.map((entry) => ({
					date: entry.date,
					dayNumber: dateToDayNumber(entry.date),
					weightKg: entry.weightKg,
				})),
			};
		},

		/** @returns {EntryRecord[]} */
		get sortedEntries() {
			return this.sortedEntriesByDate();
		},

		/** @returns {PeriodHistory[]} */
		get weeklyHistory() {
			return this.buildPeriodHistory('Week');
		},

		/** @returns {PeriodHistory[]} */
		get monthlyHistory() {
			return this.buildPeriodHistory('Month');
		},

		/** @returns {PeriodHistory[]} */
		get activeHistory() {
			return this.historyView === 'Month' ? this.monthlyHistory : this.weeklyHistory;
		},

		/** @returns {EntryRecord | null} */
		get lastEntry() {
			return this.sortedEntries[this.sortedEntries.length - 1] || null;
		},

		/** @returns {EntryRecord[]} */
		get chartEntries() {
			return this.chartEntriesForZoom(this.zoom);
		},
	};
}
