// @ts-check

export const VERSION = '2026.04.12';
export const THEME_OPTIONS = Object.freeze(['auto', 'light', 'dark']);

const DEFAULT_INTERVAL_COLORS = Object.freeze([
	'#4c7a67',
	'#d77447',
	'#5b7fd6',
	'#b85f6c',
	'#9e7a33',
	'#5f9a9a',
]);

/** @typedef {'auto' | 'light' | 'dark'} Theme */

/**
 * @typedef Interval
 * @property {string} name
 * @property {number} time
 * @property {string} color
 */

/**
 * @typedef Training
 * @property {string} name
 * @property {Interval[]} intervals
 */

/**
 * @typedef Preset
 * @property {string} title
 * @property {boolean} isEditable
 * @property {Training[]} trainings
 */

/**
 * @typedef AppState
 * @property {string} version
 * @property {Theme} themeMode
 * @property {Training[]} trainings
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
 * @param {unknown} value
 * @returns {value is Theme}
 */
function isTheme(value) {
	return typeof value === 'string' && THEME_OPTIONS.includes(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeText(value) {
	return String(value || '').trim();
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeSeconds(value, fallback) {
	let seconds = Number(value);
	if (!Number.isFinite(seconds)) {
		return fallback;
	}

	return Math.max(5, Math.min(3600, Math.round(seconds)));
}

/**
 * @param {unknown} value
 * @param {number} index
 * @returns {string}
 */
function normalizeColor(value, index) {
	let color = normalizeText(value);
	if (/^#[0-9a-f]{6}$/i.test(color)) {
		return color;
	}

	return DEFAULT_INTERVAL_COLORS[index % DEFAULT_INTERVAL_COLORS.length];
}

/**
 * @param {number} index
 * @returns {Interval}
 */
export function createEmptyInterval(index = 0) {
	return {
		name: `Interval ${index + 1}`,
		time: 60,
		color: DEFAULT_INTERVAL_COLORS[index % DEFAULT_INTERVAL_COLORS.length],
	};
}

/**
 * @param {number} index
 * @returns {Training}
 */
export function createEmptyTraining(index = 0) {
	return {
		name: '',
		intervals: [],
	};
}

/**
 * @param {unknown} saved
 * @param {number} index
 * @returns {Interval | null}
 */
export function normalizeInterval(saved, index = 0) {
	if (!isPlainObject(saved)) {
		return null;
	}

	let fallback = createEmptyInterval(index);
	let name = normalizeText(saved.name) || fallback.name;

	return {
		name,
		time: normalizeSeconds(saved.time, fallback.time),
		color: normalizeColor(saved.color, index),
	};
}

/**
 * @param {unknown} saved
 * @param {number} index
 * @returns {Training | null}
 */
export function normalizeTraining(saved, index = 0) {
	if (!isPlainObject(saved)) {
		return null;
	}

	let fallback = createEmptyTraining(index);
	let intervals = Array.isArray(saved.intervals)
		? saved.intervals
			.map((interval, intervalIndex) => normalizeInterval(interval, intervalIndex))
			.filter(isPresent)
		: [];

	return {
		name: normalizeText(saved.name) || fallback.name,
		intervals: intervals.length > 0 ? intervals : fallback.intervals,
	};
}

/**
 * @param {Partial<Training> | null | undefined} training
 * @returns {string | null}
 */
export function validateTrainingDraft(training) {
	let name = normalizeText(training?.name);
	let hasIntervals = Array.isArray(training?.intervals) && training.intervals.length > 0;

	if (!name && !hasIntervals) {
		return 'Add a training name and at least one interval before saving.';
	}

	if (!name) {
		return 'Add a training name before saving.';
	}

	if (!hasIntervals) {
		return 'Add at least one interval before saving.';
	}

	return null;
}

/**
 * @param {unknown} saved
 * @returns {Training[]}
 */
export function normalizePresetTrainings(saved) {
	if (!Array.isArray(saved)) {
		return [];
	}

	return saved
		.map((training, index) => normalizeTraining(training, index))
		.filter(isPresent);
}

/**
 * @param {string} title
 * @param {unknown} trainings
 * @param {boolean} [isEditable]
 * @returns {Preset}
 */
export function createPreset(title, trainings, isEditable = false) {
	return {
		title: normalizeText(title) || 'Preset',
		isEditable,
		trainings: normalizePresetTrainings(trainings),
	};
}

/**
 * @param {Training[]} trainings
 * @returns {Preset}
 */
export function createEditablePreset(trainings) {
	return createPreset('My Trainings', trainings, true);
}

/**
 * @param {unknown} saved
 * @returns {Training[]}
 */
export function normalizeTrainings(saved) {
	return normalizePresetTrainings(saved);
}

/**
 * @param {string} name
 * @param {number[]} intervals
 * @returns {Training}
 */
function createSportivaTraining(name, intervals) {
	/** @type {Interval[]} */
	let normalizedIntervals = [];

	for (let index = 0; index < intervals.length - 1; index += 2) {
		let runMins = intervals[index];
		let walkMins = intervals[index + 1];

		normalizedIntervals.push(
			{ name: 'Run', time: runMins * 60, color: DEFAULT_INTERVAL_COLORS[0] },
			{ name: 'Walk', time: walkMins * 60, color: DEFAULT_INTERVAL_COLORS[1] },
		);
	}

	return {
		name,
		intervals: normalizedIntervals,
	};
}

export const SPORTIVA_0_TO_5K_PRESET = {
	title: 'Sportiva 0 to 5K',
	isEditable: false,
	trainings: [
		createSportivaTraining('Week 1 - Monday', [1, 1, 1, 1, 2, 2, 2, 2, 3, 3]),
		createSportivaTraining('Week 1 - Wednesday', [1, 1, 1, 1, 2, 2, 3, 3, 3, 3]),
		createSportivaTraining('Week 1 - Friday', [1, 1, 2, 2, 2, 2, 3, 3, 3, 3]),
		createSportivaTraining('Week 2 - Monday', [1, 1, 2, 2, 2, 2, 3, 3, 3, 3]),
		createSportivaTraining('Week 2 - Wednesday', [2, 2, 3, 3, 3, 3, 3, 3]),
		createSportivaTraining('Week 2 - Friday', [1, 1, 2, 2, 3, 3, 3, 3, 3, 3]),
		createSportivaTraining('Week 3 - Monday', [1, 1, 2, 2, 3, 3, 3, 3, 3, 3]),
		createSportivaTraining('Week 3 - Wednesday', [2, 2, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]),
		createSportivaTraining('Week 3 - Friday', [1, 1, 2, 2, 4, 3, 4, 3, 5, 1]),
		createSportivaTraining('Week 4 - Monday', [1, 1, 2, 2, 3, 3, 3, 3, 3, 2]),
		createSportivaTraining('Week 4 - Wednesday', [2, 2, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]),
		createSportivaTraining('Week 4 - Friday', [1, 1, 2, 2, 4, 3, 4, 3, 5, 1]),
		createSportivaTraining('Week 5 - Monday', [2, 2, 3, 2, 5, 3, 5, 3, 5, 2]),
		createSportivaTraining('Week 5 - Wednesday', [2, 1, 3, 2, 6, 2, 6, 2, 7, 2]),
		createSportivaTraining('Week 5 - Friday', [2, 1, 4, 2, 5, 2, 6, 2, 7, 2]),
		createSportivaTraining('Week 6 - Monday', [2, 2, 3, 2, 5, 3, 5, 3, 5, 2]),
		createSportivaTraining('Week 6 - Wednesday', [2, 1, 3, 2, 6, 2, 6, 2, 7, 2]),
		createSportivaTraining('Week 6 - Friday', [2, 1, 4, 2, 5, 2, 6, 2, 7, 2]),
		createSportivaTraining('Week 7 - Monday', [5, 1, 6, 2, 7, 2, 8, 1]),
		createSportivaTraining('Week 7 - Wednesday', [8, 1, 8, 2, 8, 1, 8, 1]),
		createSportivaTraining('Week 7 - Friday', [10, 2, 10, 2, 12, 1]),
		createSportivaTraining('Week 8 - Monday', [15, 2, 15, 2]),
		createSportivaTraining('Week 8 - Wednesday', [10, 1, 12, 1, 12, 1]),
		createSportivaTraining('Week 8 - Friday', [10, 1, 20, 1]),
		createSportivaTraining('Week 9 - Monday', [15, 2, 15, 2]),
		createSportivaTraining('Week 9 - Wednesday', [10, 1, 12, 1, 12, 1]),
		createSportivaTraining('Week 9 - Friday', [10, 1, 20, 1]),
	],
};

/**
 * @returns {AppState}
 */
export function defaultAppState() {
	return {
		version: VERSION,
		themeMode: 'auto',
		trainings: [],
	};
}

/**
 * @returns {AppState}
 */
export function createDemoAppState() {
	return defaultAppState();
}

/**
 * @param {unknown} saved
 * @returns {AppState}
 */
export function normalizeAppState(saved) {
	if (!isPlainObject(saved)) {
		return defaultAppState();
	}

	return {
		version: VERSION,
		themeMode: isTheme(saved.themeMode) ? saved.themeMode : 'auto',
		trainings: normalizeTrainings(saved.trainings),
	};
}

/**
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
	let wholeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
	let minutes = Math.floor(wholeSeconds / 60);
	let remainder = wholeSeconds % 60;

	if (minutes === 0) {
		return `${remainder} sec`;
	}

	if (remainder === 0) {
		return `${minutes} min`;
	}

	return `${minutes}m ${remainder}s`;
}

/**
 * @param {number} seconds
 * @returns {string}
 */
export function formatClock(seconds) {
	let wholeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
	let minutes = Math.floor(wholeSeconds / 60);
	let remainder = wholeSeconds % 60;

	return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/**
 * @param {Training} training
 * @returns {number}
 */
export function totalTrainingSeconds(training) {
	return training.intervals.reduce((total, interval) => total + interval.time, 0);
}

/**
 * @param {Training | null | undefined} training
 * @param {number} [elapsedMs]
 */
export function getTrainingTimelineFrame(training, elapsedMs = 0) {
	let intervals = Array.isArray(training?.intervals) ? training.intervals : [];
	if (intervals.length === 0) {
		return null;
	}

	let normalizedElapsedMs = Math.max(0, Math.floor(Number(elapsedMs) || 0));
	let totalDurationMs = intervals.reduce((total, interval) => total + (Math.max(1, Number(interval.time) || 0) * 1000), 0);
	let clampedElapsedMs = Math.min(normalizedElapsedMs, totalDurationMs);
	let traversedMs = 0;

	for (let intervalIndex = 0; intervalIndex < intervals.length; intervalIndex += 1) {
		let interval = intervals[intervalIndex];
		let intervalDurationMs = Math.max(1, Number(interval.time) || 0) * 1000;
		let intervalEndMs = traversedMs + intervalDurationMs;

		if (clampedElapsedMs < intervalEndMs) {
			let intervalElapsedMs = Math.max(0, clampedElapsedMs - traversedMs);

			return {
				interval,
				intervalIndex,
				intervalCount: intervals.length,
				elapsedMs: clampedElapsedMs,
				intervalElapsedMs,
				intervalDurationMs,
				remainingSeconds: Math.ceil((intervalEndMs - clampedElapsedMs) / 1000),
				totalRemainingSeconds: Math.ceil((totalDurationMs - clampedElapsedMs) / 1000),
				completed: false,
			};
		}

		traversedMs = intervalEndMs;
	}

	let finalInterval = intervals[intervals.length - 1];
	let finalIntervalDurationMs = Math.max(1, Number(finalInterval.time) || 0) * 1000;

	return {
		interval: finalInterval,
		intervalIndex: intervals.length - 1,
		intervalCount: intervals.length,
		elapsedMs: totalDurationMs,
		intervalElapsedMs: finalIntervalDurationMs,
		intervalDurationMs: finalIntervalDurationMs,
		remainingSeconds: 0,
		totalRemainingSeconds: 0,
		completed: true,
	};
}

/**
 * @param {unknown} [savedState]
 */
export function createApp(savedState = null) {
	let state = normalizeAppState(savedState);

	return {
		...state,

		/**
		 * @returns {AppState}
		 */
		toJSON() {
			return normalizeAppState({
				version: this.version,
				themeMode: this.themeMode,
				trainings: this.trainings,
			});
		},

		/**
		 * @param {unknown} nextState
		 * @returns {void}
		 */
		replaceState(nextState) {
			Object.assign(this, normalizeAppState(nextState));
		},

		/**
		 * @param {Theme} theme
		 * @returns {void}
		 */
		setTheme(theme) {
			if (!isTheme(theme)) {
				return;
			}

			this.themeMode = theme;
		},

		/**
		 * @param {Partial<Training>} [draft]
		 * @returns {Training | null}
		 */
		addTraining(draft = {}) {
			let nextTraining = normalizeTraining(draft, this.trainings.length) || createEmptyTraining(this.trainings.length);
			this.trainings = this.trainings.concat([nextTraining]);
			return nextTraining;
		},

		/**
		 * @param {number} trainingIndex
		 * @param {Partial<Training>} patch
		 * @returns {Training | null}
		 */
		updateTraining(trainingIndex, patch) {
			let training = this.trainings[trainingIndex];
			if (!training) {
				return null;
			}

			let nextTraining = normalizeTraining({ ...training, ...patch }, trainingIndex);
			if (!nextTraining) {
				return null;
			}

			let nextTrainings = this.trainings.slice();
			nextTrainings[trainingIndex] = nextTraining;
			this.trainings = nextTrainings;
			return nextTraining;
		},

		/**
		 * @param {number} trainingIndex
		 * @returns {boolean}
		 */
		removeTraining(trainingIndex) {
			if (!this.trainings[trainingIndex]) {
				return false;
			}

			this.trainings = this.trainings.filter((_, index) => index !== trainingIndex);
			return true;
		},

		/**
		 * @param {number} trainingIndex
		 * @param {Partial<Interval>} [draft]
		 * @returns {Interval | null}
		 */
		addInterval(trainingIndex, draft = {}) {
			let training = this.trainings[trainingIndex];
			if (!training) {
				return null;
			}

			let nextInterval = normalizeInterval(draft, training.intervals.length) || createEmptyInterval(training.intervals.length);
			let nextIntervals = training.intervals.concat([nextInterval]);
			this.updateTraining(trainingIndex, { intervals: nextIntervals });
			return nextInterval;
		},

		/**
		 * @param {number} trainingIndex
		 * @param {number} intervalIndex
		 * @returns {Interval | null}
		 */
		duplicateInterval(trainingIndex, intervalIndex) {
			let training = this.trainings[trainingIndex];
			let interval = training?.intervals?.[intervalIndex];
			if (!training || !interval) {
				return null;
			}

			return this.addInterval(trainingIndex, { ...interval });
		},

		/**
		 * @param {number} trainingIndex
		 * @param {number} intervalIndex
		 * @param {Partial<Interval>} patch
		 * @returns {Interval | null}
		 */
		updateInterval(trainingIndex, intervalIndex, patch) {
			let training = this.trainings[trainingIndex];
			let interval = training?.intervals?.[intervalIndex];
			if (!training || !interval) {
				return null;
			}

			let nextIntervals = training.intervals.slice();
			let nextInterval = normalizeInterval({ ...interval, ...patch }, intervalIndex);
			if (!nextInterval) {
				return null;
			}

			nextIntervals[intervalIndex] = nextInterval;
			this.updateTraining(trainingIndex, { intervals: nextIntervals });
			return nextInterval;
		},

		/**
		 * @param {number} trainingIndex
		 * @param {number} intervalIndex
		 * @returns {boolean}
		 */
		removeInterval(trainingIndex, intervalIndex) {
			let training = this.trainings[trainingIndex];
			if (!training || !training.intervals[intervalIndex]) {
				return false;
			}

			let nextIntervals = training.intervals.filter((_, index) => index !== intervalIndex);
			this.updateTraining(trainingIndex, { intervals: nextIntervals });
			return true;
		},
	};
}
