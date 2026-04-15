import {
	VERSION,
	KG_TO_LBS,
	UNIT_OPTIONS,
	ZOOM_OPTIONS,
	VIEW_OPTIONS,
	THEME_OPTIONS,
	createApp,
	generateDemoEntries,
	isoDateToDate,
	todayIsoDate,
	dateToDayNumber,
	dayNumberToDate,
	dayNumberToIsoDate,
	startOfWeek,
	startOfMonth,
	shiftDate,
} from './app.js';

const STORAGE_KEY = 'feather-weight-data';
const THEME_COLORS = Object.freeze({ light: '#f7f4ec', dark: '#131618' });
const WHOLE_KG_VALUES = Object.freeze(Array.from({ length: 101 }, (_, index) => index + 20));
const WHOLE_LBS_VALUES = Object.freeze(Array.from({ length: 223 }, (_, index) => index + 44));
const DECIMALS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

function applyTheme(theme) {
	let resolvedTheme = theme;
	if (resolvedTheme === 'auto' || !THEME_OPTIONS.includes(resolvedTheme)) {
		resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	document.documentElement.dataset.theme = resolvedTheme;

	let metaThemeColorEl = document.head.querySelector('meta[name="theme-color"]');
	if (!metaThemeColorEl) {
		metaThemeColorEl = document.createElement('meta');
		metaThemeColorEl.setAttribute('name', 'theme-color');
		document.head.appendChild(metaThemeColorEl);
	}
	metaThemeColorEl.setAttribute('content', THEME_COLORS[resolvedTheme]);
}

function watchSystemThemeChange(callback) {
	let mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	mediaQuery.addEventListener('change', callback);
	return () => mediaQuery.removeEventListener('change', callback);
}

function featherWeightViewModel() {
	let stopThemeWatcher = null;

	return {
		model: createApp(),
		storageLocked: false,
		viewportWidth: window.innerWidth,
		unitOptions: UNIT_OPTIONS,
		zoomOptions: ZOOM_OPTIONS,
		historyViewOptions: VIEW_OPTIONS,
		goalRateUnitOptions: VIEW_OPTIONS,
		themeOptions: THEME_OPTIONS,
		mainScrollY: 0,
		overlayOpen: false,
		overlayMode: 'entry',
		editingDate: null,
		entryDate: '',
		pickerWhole: 70,
		pickerDecimal: 0,
		goalRateDraftKg: 0.5,
		goalRateDraftUnit: 'Week',
		removingIds: {},
		expandedHistory: {},
		showAllHistory: false,
		chartFadeLeft: false,
		chartFadeRight: false,
		chartTargetHeight: 236,
		chartRender: {
			model: {
				axisWidth: 58,
				width: Math.max(window.innerWidth - 58, 260),
				height: 236,
				plotTop: 12,
				plotBottom: 202,
				labelY: 226,
				yTicksMajor: [],
				yTicksMinor: [],
				xTicksMajor: [],
				xTicksMinor: [],
				xLabels: [],
				valueLabels: [],
				path: '',
				points: [],
			},
			yAxisMarkup: '',
			horizontalMinorGridMarkup: '',
			horizontalMajorGridMarkup: '',
			verticalMinorGridMarkup: '',
			verticalMajorGridMarkup: '',
			valueLabelsMarkup: '',
			pointsMarkup: '',
			xLabelsMarkup: '',
		},
		settingsOpen: false,
		decimals: DECIMALS,

		init() {
			if (window.location.hash === '#demo') {
				this.model = createApp({ entries: generateDemoEntries() });
				this.storageLocked = true;
				this.resetHistoryView();
			}
			else if (window.location.hash === '#empty') {
				this.storageLocked = true;
			}
			else {
				this.restore();
			}
			this.initTheme();
			this.$watch('model.unit', () => {
				this.refreshChartRender();
				this.persist();
			});
			this.$watch('model.zoom', () => {
				this.refreshChartRender();
				this.persist();
				this.$nextTick(() => {
					this.scrollChartToEnd();
					this.updateChartFade();
				});
			});
			window.addEventListener('resize', () => {
				this.viewportWidth = window.innerWidth;
				this.refreshChartRender();
				this.$nextTick(() => {
					this.updateChartFade();
				});
			});
			this.refreshChartRender();
			this.$nextTick(() => {
				this.scrollChartToEnd();
				this.updateChartFade();
			});
		},

		initTheme() {
			if (typeof stopThemeWatcher === 'function') {
				stopThemeWatcher();
			}

			let syncTheme = () => applyTheme(this.model.themeMode);
			syncTheme();

			this.$watch('model.themeMode', () => {
				syncTheme();
				this.persist();
			});

			stopThemeWatcher = watchSystemThemeChange(syncTheme);
		},

		restore() {
			let savedValue = localStorage.getItem(STORAGE_KEY);
			if (!savedValue) {
				return;
			}

			try {
				let saved = JSON.parse(savedValue);
				if (saved.version !== VERSION) {
					throw new Error('Invalid version');
				}
				this.model = createApp(saved);
			}
			catch (error) {
				this.storageLocked = true;
				alert('Stored app data is invalid. Reset the app state or import valid data. Changes will not be saved until you manually reset or import data. You can export first if needed.\n\n' + error);
			}
		},

		persist() {
			if (this.storageLocked) {
				return;
			}
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.model.toJSON()));
		},

		switchUnit(nextUnit) {
			if (nextUnit === this.model.unit) {
				return;
			}
			if (this.overlayOpen) {
				let currentKg = this.selectedPickerKg();
				this.model.setUnit(nextUnit);
				this.$nextTick(() => {
					this.setPickerFromKg(currentKg);
					this.syncPickerScroll();
				});
				return;
			}
			this.model.setUnit(nextUnit);
		},

		setZoom(level) {
			this.model.setZoom(level);
		},

		selectedPickerKg() {
			let selected = this.pickerWhole + this.pickerDecimal / 10;
			return this.model.unit === 'KG' ? selected : selected / KG_TO_LBS;
		},

		formatWeight(weightKg, digits = 1) {
			if (typeof weightKg !== 'number' || !Number.isFinite(weightKg)) {
				return '--.-';
			}
			return this.model.convertWeightKg(weightKg).toFixed(digits);
		},

		formatAxisValue(value) {
			return value.toFixed(1).replace(/\.0$/, '');
		},

		formatDate(dateValue) {
			return isoDateToDate(dateValue).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			});
		},

		formatHeaderDate() {
			return new Date().toLocaleDateString(undefined, {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
			});
		},

		formatWeekLabel(dateValue) {
			return isoDateToDate(dateValue).toLocaleDateString(undefined, {
				month: 'long',
				day: 'numeric',
			});
		},

		formatMonthLabel(dateValue) {
			return isoDateToDate(dateValue).toLocaleDateString(undefined, {
				month: 'long',
				year: 'numeric',
			});
		},

		formatHistoryEntryLabel(dateValue) {
			let date = isoDateToDate(dateValue);
			let weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
			return `${weekday} ${this.ordinalDay(date.getDate())}`;
		},

		formatHistoryItemLabel(entry, period) {
			let label = this.formatHistoryEntryLabel(entry.date);
			return period.medianEntry && entry.date === period.medianEntry.date ? `${label} ◦` : label;
		},

		ordinalDay(day) {
			let remainder = day % 100;
			if (remainder >= 11 && remainder <= 13) {
				return `${day}th`;
			}
			let lastDigit = day % 10;
			if (lastDigit === 1) {
				return `${day}st`;
			}
			if (lastDigit === 2) {
				return `${day}nd`;
			}
			if (lastDigit === 3) {
				return `${day}rd`;
			}
			return `${day}th`;
		},

		lastRecordedDateLabel(dateValue) {
			let dayDiff = dateToDayNumber(todayIsoDate()) - dateToDayNumber(dateValue);
			if (dayDiff <= 0) {
				return 'From today';
			}
			if (dayDiff === 1) {
				return 'From yesterday';
			}
			if (dayDiff < 7) {
				return `From ${dayDiff} days ago`;
			}
			if (dayDiff < 14) {
				return 'From last week';
			}
			return `From ${Math.floor(dayDiff / 7)} weeks ago`;
		},

		formatDeltaParts(deltaKg) {
			let converted = this.model.convertWeightKg(deltaKg);
			let rounded = Math.abs(converted) < 0.05 ? 0 : Number(converted.toFixed(1));
			let number = `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
			return {
				number,
				unit: this.model.unit,
				tone: rounded > 0 ? 'negative' : rounded < 0 ? 'positive' : 'neutral',
			};
		},

		emptyDeltaSummary(label) {
			return {
				label,
				valueNumber: '--',
				valueUnit: '',
				tone: 'neutral',
			};
		},

		setTheme(theme) {
			this.model.setTheme(theme);
		},

		formatRateLabel(rateKg, rateUnit = 'Week') {
			return `${this.formatWeight(rateKg)} / ${rateUnit.toLowerCase()}`;
		},

		formatGoalPeriodsLabel(periods, rateUnit) {
			return rateUnit === 'Month'
				? `${periods} mo${periods === 1 ? '' : 's'}`
				: `${periods} wk${periods === 1 ? '' : 's'}`;
		},

		rateStepKg() {
			return this.model.unit === 'KG' ? 0.1 : 0.1 / KG_TO_LBS;
		},

		changeGoalRate(direction) {
			let nextRate = this.goalRateDraftKg + direction * this.rateStepKg();
			let boundedRate = Math.max(this.rateStepKg(), Math.min(nextRate, 4));
			this.goalRateDraftKg = Number(boundedRate.toFixed(3));
		},

		setGoalRateDraftUnit(rateUnit) {
			this.goalRateDraftUnit = rateUnit === 'Month' ? 'Month' : 'Week';
		},

		buildPeriodHistory(periods, formatLabel) {
			return periods.map((period) => ({
				...period,
				periodLabel: formatLabel(period.periodStart),
				medianValue: period.medianEntry ? this.formatWeight(period.medianEntry.weightKg) : '--.-',
				delta: typeof period.deltaKg === 'number' ? this.formatDeltaParts(period.deltaKg) : null,
			}));
		},

		historyToggleAriaLabel(period) {
			let action = this.expandedHistory[period.periodStart] ? 'Collapse' : 'Expand';
			return `${action} ${this.historyPeriodName} of ${period.periodLabel}`;
		},

		toggleHistoryExpansion(periodStart) {
			this.expandedHistory = {
				...this.expandedHistory,
				[periodStart]: !this.expandedHistory[periodStart],
			};
		},

		loadFullHistory() {
			this.showAllHistory = true;
		},

		setHistoryView(historyView) {
			let nextView = historyView === 'Month' ? 'Month' : 'Week';
			if (this.model.historyView === nextView) {
				return;
			}
			this.model.setHistoryView(nextView);
			this.resetHistoryView();
			this.persist();
		},

		resetHistoryView() {
			this.expandedHistory = {};
			this.showAllHistory = false;
		},

		formatTimeTickLabel(date) {
			if (this.model.zoom === 'Week') {
				return date.toLocaleDateString(undefined, { weekday: 'short' });
			}
			if (this.model.zoom === 'Month') {
				return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
			}
			let month = date.toLocaleDateString(undefined, { month: 'short' });
			return date.getMonth() === 0 ? `${month} '${String(date.getFullYear()).slice(-2)}` : month;
		},

		buildYearTicks(minDayNumber, maxDayNumber, xForDayNumber) {
			let major = [];
			let minor = [];
			let monthStart = startOfMonth(dayNumberToIsoDate(minDayNumber));
			let lastBoundary = shiftDate(startOfMonth(dayNumberToIsoDate(maxDayNumber)), 'month', 1);

			while (monthStart <= lastBoundary) {
				let currentDayNumber = dateToDayNumber(monthStart);
				let nextMonth = shiftDate(monthStart, 'month', 1);
				let nextDayNumber = dateToDayNumber(nextMonth);

				if (currentDayNumber >= minDayNumber && currentDayNumber <= maxDayNumber) {
					major.push({
						dayNumber: currentDayNumber,
						x: xForDayNumber(currentDayNumber),
						label: this.formatTimeTickLabel(isoDateToDate(monthStart)),
					});
				}

				for (let division = 1; division < 4; division += 1) {
					let dayNumber = currentDayNumber + ((nextDayNumber - currentDayNumber) * division) / 4;
					if (dayNumber >= minDayNumber && dayNumber <= maxDayNumber) {
						minor.push({
							dayNumber,
							x: xForDayNumber(dayNumber),
						});
					}
				}

				monthStart = nextMonth;
			}

			return { major, minor };
		},

		buildTimeTicks(minDayNumber, maxDayNumber, xForDayNumber) {
			if (this.model.zoom === 'Year') {
				return this.buildYearTicks(minDayNumber, maxDayNumber, xForDayNumber);
			}

			let major = [];
			let minor = [];

			if (this.model.zoom === 'Week') {
				for (let dayNumber = minDayNumber; dayNumber <= maxDayNumber; dayNumber += 1) {
					major.push({
						dayNumber,
						x: xForDayNumber(dayNumber),
						label: this.formatTimeTickLabel(dayNumberToDate(dayNumber)),
					});
				}
				return { major, minor };
			}

			let majorCursor = startOfWeek(dayNumberToIsoDate(minDayNumber));
			while (dateToDayNumber(majorCursor) <= maxDayNumber) {
				let dayNumber = dateToDayNumber(majorCursor);
				if (dayNumber >= minDayNumber && dayNumber <= maxDayNumber) {
					major.push({
						dayNumber,
						x: xForDayNumber(dayNumber),
						label: this.formatTimeTickLabel(isoDateToDate(majorCursor)),
					});
				}
				majorCursor = shiftDate(majorCursor, 'week', 1);
			}

			let majorDayNumbers = new Set(major.map((tick) => tick.dayNumber));
			for (let dayNumber = minDayNumber; dayNumber <= maxDayNumber; dayNumber += 1) {
				if (!majorDayNumbers.has(dayNumber)) {
					minor.push({
						dayNumber,
						x: xForDayNumber(dayNumber),
					});
				}
			}

			return { major, minor };
		},

		get sortedEntries() {
			return this.model.sortedEntries;
		},

		get weeklySummaryHistory() {
			return this.buildPeriodHistory(
				this.model.weeklyHistory,
				(dateValue) => this.formatWeekLabel(dateValue)
			);
		},

		get monthlyHistory() {
			return this.buildPeriodHistory(
				this.model.monthlyHistory,
				(dateValue) => this.formatMonthLabel(dateValue)
			);
		},

		get activeHistoryView() {
			return this.model.historyView === 'Month' ? 'Month' : 'Week';
		},

		get activeHistory() {
			return this.activeHistoryView === 'Month' ? this.monthlyHistory : this.weeklySummaryHistory;
		},

		get visibleHistory() {
			return this.showAllHistory ? this.activeHistory : this.activeHistory.slice(0, 16);
		},

		get hasMoreHistory() {
			return this.activeHistory.length > 16 && !this.showAllHistory;
		},

		get historyPeriodName() {
			return this.activeHistoryView === 'Month' ? 'month' : 'week';
		},

		get lastEntry() {
			return this.model.lastEntry;
		},

		get currentWeightLabel() {
			return this.lastEntry ? this.formatWeight(this.lastEntry.weightKg) : '--.-';
		},

		get currentPanelDateLabel() {
			return this.lastEntry
				? this.lastRecordedDateLabel(this.lastEntry.date)
				: 'No measurements recorded yet';
		},

		get goalWeightLabel() {
			if (!this.model.goal || typeof this.model.goal.weightKg !== 'number') {
				return '--.-';
			}
			return this.formatWeight(this.model.goal.weightKg);
		},

		get goalRateDraftLabel() {
			return this.formatWeight(this.goalRateDraftKg);
		},

		get goalRateUnitLabel() {
			return `${this.model.unit} / ${this.goalRateDraftUnit}`;
		},

		get goalPeriodsRemaining() {
			return this.model.goalStatus()?.periodsRemaining ?? null;
		},

		get goalPanelMeta() {
			let goalStatus = this.model.goalStatus();
			if (!goalStatus) {
				return '';
			}

			let rateLabel = this.formatRateLabel(goalStatus.rateKg, goalStatus.rateUnit);
			if (goalStatus.currentWeightKg === null) {
				return rateLabel;
			}

			if (goalStatus.reached) {
				return `${rateLabel} · reached`;
			}

			return goalStatus.periodsRemaining === null
				? rateLabel
				: `${rateLabel} · ${this.formatGoalPeriodsLabel(goalStatus.periodsRemaining, goalStatus.rateUnit)}`;
		},

		get goalPreview() {
			if (!this.lastEntry) {
				return {
					title: 'Add a weight first',
					detail: 'The forecast starts once you have a current measurement.',
				};
			}

			let targetWeightKg = this.selectedPickerKg();
			let remainingKg = this.lastEntry.weightKg - targetWeightKg;
			if (remainingKg <= 0) {
				return {
					title: 'Goal already reached',
					detail: `Current weight is already at or below ${this.formatWeight(targetWeightKg)} ${this.model.unit.toLowerCase()}.`,
				};
			}

			let periods = Math.ceil(remainingKg / this.goalRateDraftKg);
			return {
				title: `About ${periods} ${this.goalRateDraftUnit === 'Month' ? `month${periods === 1 ? '' : 's'}` : `week${periods === 1 ? '' : 's'}`} left`,
				detail: `${this.formatWeight(remainingKg)} ${this.model.unit.toLowerCase()} to lose at ${this.formatRateLabel(this.goalRateDraftKg, this.goalRateDraftUnit)}.`,
			};
		},

		goalRateStepAriaLabel(direction) {
			let action = direction < 0 ? 'Lower' : 'Raise';
			return `${action} ${this.goalRateDraftUnit.toLowerCase()} loss rate`;
		},

		get overlayTitle() {
			if (this.overlayMode === 'goal') {
				return this.model.goal ? 'Goal Weight' : 'Set Goal';
			}
			return this.editingDate ? 'Edit Weight' : 'New Weight';
		},

		get overlaySaveButtonLabel() {
			return this.overlayMode === 'goal' && !this.model.goal ? 'Set' : 'Save';
		},

		get lastWeekDeltaCard() {
			let weeklyChange = this.model.sinceLastWeekChange();
			if (!weeklyChange) {
				return {
					label: 'Since last week',
					valueNumber: '--',
					valueUnit: '',
					tone: 'neutral',
				};
			}

			let delta = this.formatDeltaParts(weeklyChange.deltaKg);
			return {
				label: 'Since last week',
				valueNumber: delta.number,
				valueUnit: delta.unit,
				tone: delta.tone,
			};
		},

		get lastMonthDeltaCard() {
			let trend = this.model.thirtyDayTrend();
			if (!trend) {
				return this.emptyDeltaSummary('30-day trend');
			}

			let delta = this.formatDeltaParts(trend.deltaKg);
			return {
				label: '30-day trend',
				valueNumber: delta.number,
				valueUnit: delta.unit,
				tone: delta.tone,
			};
		},

		get activeWholeList() {
			return this.model.unit === 'KG' ? WHOLE_KG_VALUES : WHOLE_LBS_VALUES;
		},

		emptyChartModel() {
			let axisWidth = 58;
			let fallbackWidth = Math.max(this.viewportWidth - axisWidth, 260);
			let height = this.chartTargetHeight;
			return {
				axisWidth,
				width: fallbackWidth,
				height,
				plotTop: 12,
				plotBottom: height - 34,
				labelY: height - 10,
				yTicksMajor: [],
				yTicksMinor: [],
				xTicksMajor: [],
				xTicksMinor: [],
				xLabels: [],
				valueLabels: [],
				path: '',
				points: [],
			};
		},

		buildChartModel() {
			let axisWidth = 58;
			let fallbackWidth = Math.max(this.viewportWidth - axisWidth, 260);
			let height = this.chartTargetHeight;
			const PAD_TOP = 12;
			const PAD_RIGHT = 14;
			const PAD_BOTTOM = 34;
			const PAD_LEFT = 8;
			let entries = this.model.chartEntries;
			if (!entries.length) {
				return this.emptyChartModel();
			}

			let minDayNumber = dateToDayNumber(entries[0].date);
			let maxDayNumber = dateToDayNumber(entries[entries.length - 1].date);
			let spanDays = Math.max(maxDayNumber - minDayNumber, 1);
			let pixelsPerDay = this.model.zoom === 'Week' ? 56 : this.model.zoom === 'Month' ? 16 : 4.6;
			let width = Math.max(fallbackWidth, Math.round(spanDays * pixelsPerDay) + PAD_LEFT + PAD_RIGHT + 20);
			let rawWeights = entries.map((entry) => this.model.convertWeightKg(entry.weightKg));
			let minimum = Math.min(...rawWeights);
			let maximum = Math.max(...rawWeights);
			let majorYStep = 1;
			let valuePadding = Math.max((maximum - minimum) * 0.18, this.model.unit === 'KG' ? 0.6 : 1.2);
			let lowerBound = Math.floor(minimum - valuePadding);
			let upperBound = Math.ceil(maximum + valuePadding);
			let minimumVisibleSpan = this.model.unit === 'KG' ? 3 : 4;
			let boundedSpan = upperBound - lowerBound;
			if (boundedSpan < minimumVisibleSpan) {
				let missingSpan = minimumVisibleSpan - boundedSpan;
				lowerBound -= Math.floor(missingSpan / 2);
				upperBound += Math.ceil(missingSpan / 2);
			}
			let valueSpan = Math.max(upperBound - lowerBound, majorYStep);
			let plotHeight = height - PAD_TOP - PAD_BOTTOM;
			let plotWidth = width - PAD_LEFT - PAD_RIGHT;
			let pixelsPerMajor = plotHeight / valueSpan;
			let minorDivisions = pixelsPerMajor >= 52 ? 5 : pixelsPerMajor >= 30 ? 2 : 0;
			let xForDayNumber = (dayNumber) => entries.length === 1
				? width / 2
				: PAD_LEFT + ((dayNumber - minDayNumber) / Math.max(maxDayNumber - minDayNumber, 1)) * plotWidth;

			let points = entries.map((entry) => {
				let dayNumber = dateToDayNumber(entry.date);
				let value = this.model.convertWeightKg(entry.weightKg);
				let x = xForDayNumber(dayNumber);
				let y = PAD_TOP + (1 - ((value - lowerBound) / valueSpan)) * plotHeight;
				return { date: entry.date, dayNumber, value, x, y };
			});

			let path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
			let yTicksMajor = [];
			for (let value = lowerBound; value <= upperBound + 0.001; value += majorYStep) {
				yTicksMajor.push({
					value: this.formatAxisValue(value),
					y: PAD_TOP + (1 - ((value - lowerBound) / valueSpan)) * plotHeight,
				});
			}
			let yTicksMinor = [];
			if (minorDivisions > 0) {
				let minorYStep = majorYStep / minorDivisions;
				for (let majorValue = lowerBound; majorValue < upperBound; majorValue += majorYStep) {
					for (let division = 1; division < minorDivisions; division += 1) {
						let value = majorValue + division * minorYStep;
						yTicksMinor.push({
							y: PAD_TOP + (1 - ((value - lowerBound) / valueSpan)) * plotHeight,
						});
					}
				}
			}

			let timeTicks = this.buildTimeTicks(minDayNumber, maxDayNumber, xForDayNumber);
			let valueLabels = [];
			let valueLabelOffset = 12;
			let minimumLabelY = PAD_TOP + 11;
			let maximumLabelY = height - PAD_BOTTOM - 11;

			for (let label of timeTicks.major) {
				let weightKg = this.model.weightKgAtDate(dayNumberToIsoDate(label.dayNumber));
				if (weightKg === null) {
					continue;
				}

				let lineY = PAD_TOP + (1 - ((this.model.convertWeightKg(weightKg) - lowerBound) / valueSpan)) * plotHeight;
				let segmentStart = points[0];
				let segmentEnd = points[points.length - 1];

				for (let index = 1; index < points.length; index += 1) {
					if (label.dayNumber <= points[index].dayNumber) {
						segmentStart = points[index - 1];
						segmentEnd = points[index];
						break;
					}
				}

				let slope = segmentEnd.y - segmentStart.y;
				let preferAbove = slope >= 0;
				let labelY = lineY + (preferAbove ? -valueLabelOffset : valueLabelOffset);
				labelY = Math.min(Math.max(labelY, minimumLabelY), maximumLabelY);

				let previousLabel = valueLabels[valueLabels.length - 1] || null;
				if (previousLabel && Math.abs(label.x - previousLabel.x) < 68 && Math.abs(labelY - previousLabel.y) < 16) {
					let alternateY = lineY + (preferAbove ? valueLabelOffset : -valueLabelOffset);
					alternateY = Math.min(Math.max(alternateY, minimumLabelY), maximumLabelY);
					if (Math.abs(alternateY - previousLabel.y) > Math.abs(labelY - previousLabel.y)) {
						labelY = alternateY;
					}
					else {
						let nudge = labelY <= previousLabel.y ? -10 : 10;
						labelY = Math.min(Math.max(labelY + nudge, minimumLabelY), maximumLabelY);
					}
				}

				valueLabels.push({
					x: label.x,
					y: labelY,
					text: this.formatWeight(weightKg),
				});
			}

			return {
				axisWidth,
				width,
				height,
				plotTop: PAD_TOP,
				plotBottom: height - PAD_BOTTOM,
				labelY: height - 10,
				yTicksMajor,
				yTicksMinor,
				xTicksMajor: timeTicks.major,
				xTicksMinor: timeTicks.minor,
				xLabels: timeTicks.major,
				valueLabels,
				path,
				points,
			};
		},

		buildChartRender() {
			let model = this.buildChartModel();
			return {
				model,
				yAxisMarkup: model.yTicksMajor.map((tick) => `<g><line x1="${model.axisWidth - 8}" y1="${tick.y}" x2="${model.axisWidth}" y2="${tick.y}" stroke="var(--grid)" stroke-width="1"></line><text x="${model.axisWidth - 10}" y="${tick.y + 4}" text-anchor="end" fill="var(--text-faint)" font-size="11" letter-spacing="0.04em">${this.escapeSvgText(tick.value + ' ' + this.model.unit.toLowerCase())}</text></g>`).join(''),
				horizontalMinorGridMarkup: model.yTicksMinor.map((tick) => `<line x1="0" y1="${tick.y}" x2="${model.width}" y2="${tick.y}" stroke="var(--grid-soft)" stroke-width="1"></line>`).join(''),
				horizontalMajorGridMarkup: model.yTicksMajor.map((tick) => `<line x1="0" y1="${tick.y}" x2="${model.width}" y2="${tick.y}" stroke="var(--grid)" stroke-width="1"></line>`).join(''),
				verticalMinorGridMarkup: model.xTicksMinor.map((tick) => `<line x1="${tick.x}" y1="${model.plotTop}" x2="${tick.x}" y2="${model.plotBottom}" stroke="var(--grid-soft)" stroke-width="1"></line>`).join(''),
				verticalMajorGridMarkup: model.xTicksMajor.map((tick) => `<line x1="${tick.x}" y1="${model.plotTop}" x2="${tick.x}" y2="${model.plotBottom}" stroke="var(--grid)" stroke-width="1"></line>`).join(''),
				valueLabelsMarkup: model.valueLabels.map((label) => `<text x="${label.x}" y="${label.y}" text-anchor="middle" dominant-baseline="middle" fill="var(--text-faint)" fill-opacity="0.82" font-size="10.5" font-weight="500" letter-spacing="-0.01em">${this.escapeSvgText(label.text)}</text>`).join(''),
				pointsMarkup: model.points.length > 14 ? '' : model.points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="2.8" fill="var(--bg)" stroke="var(--line)" stroke-width="1.8"></circle>`).join(''),
				xLabelsMarkup: model.xLabels.map((label) => `<text x="${label.x}" y="${model.labelY}" text-anchor="middle" fill="var(--text-faint)" font-size="11" letter-spacing="0.04em">${this.escapeSvgText(label.label)}</text>`).join(''),
			};
		},

		refreshChartRender() {
			this.chartRender = this.buildChartRender();
		},

		escapeSvgText(value) {
			return String(value)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		},

		openNewEntry() {
			this.overlayMode = 'entry';
			this.editingDate = null;
			let baseWeight = this.lastEntry?.weightKg ?? 70;
			this.setPickerFromKg(baseWeight);
			this.entryDate = todayIsoDate();
			this.overlayOpen = true;
			this.$nextTick(() => this.syncPickerScroll());
		},

		openEdit(entry) {
			this.overlayMode = 'entry';
			this.editingDate = entry.date;
			this.setPickerFromKg(entry.weightKg);
			this.entryDate = entry.date;
			this.overlayOpen = true;
			this.$nextTick(() => this.syncPickerScroll());
		},

		openGoalSetup() {
			this.overlayMode = 'goal';
			this.editingDate = null;
			let baseWeight = this.model.goal?.weightKg ?? this.lastEntry?.weightKg ?? 70;
			this.goalRateDraftKg = this.model.goalRateValue();
			this.goalRateDraftUnit = this.model.goalRateUnit();
			this.setPickerFromKg(baseWeight);
			this.overlayOpen = true;
			this.$nextTick(() => this.syncPickerScroll());
		},

		handleEscape() {
			if (this.settingsOpen) {
				this.closeSettings();
				return;
			}
			if (this.overlayOpen) {
				this.closeOverlay();
			}
		},

		closeOverlay() {
			this.overlayOpen = false;
			window.setTimeout(() => {
				if (!this.overlayOpen) {
					this.editingDate = null;
					this.overlayMode = 'entry';
				}
			}, 220);
		},

		openSettings() {
			this.mainScrollY = window.scrollY;
			this.settingsOpen = true;
			this.closeOverlay();
			this.$nextTick(() => window.scrollTo({ top: 0, behavior: 'auto' }));
		},

		closeSettings() {
			this.settingsOpen = false;
			this.$nextTick(() => window.scrollTo({ top: this.mainScrollY, behavior: 'auto' }));
		},

		triggerImport() {
			if (this.$refs.importFile) {
				this.$refs.importFile.value = '';
				this.$refs.importFile.click();
			}
		},

		applyImportedData(imported) {
			this.model = createApp(imported);
			this.storageLocked = false;
			this.resetHistoryView();
			applyTheme(this.model.themeMode);
			this.refreshChartRender();
			this.persist();
		},

		async handleImport(event) {
			let file = event?.target?.files?.[0] ?? null;
			if (!file) {
				return;
			}

			try {
				let content = await file.text();
				let imported = JSON.parse(content);
				if (!imported || imported.version !== VERSION) {
					throw new Error('Unsupported version');
				}
				this.applyImportedData(imported);
				this.closeSettings();
				this.$nextTick(() => {
					this.scrollChartToEnd();
					this.updateChartFade();
				});
				alert('App data imported.');
			}
			catch (error) {
				alert(`Import failed. Backup data must have version ${VERSION}.`);
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
			link.download = `feather-weight-data-${stamp}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		},

		resetAppData() {
			this.model = createApp();
			this.storageLocked = false;
			this.editingDate = null;
			this.overlayOpen = false;
			this.removingIds = {};
			this.resetHistoryView();
			applyTheme(this.model.themeMode);
			this.refreshChartRender();
			this.persist();
		},

		confirmWipeData() {
			let ok = confirm('Wipe all saved app data? This will erase your measurements and history on this device. Continue?');
			if (!ok) {
				return;
			}

			this.resetAppData();
			this.closeSettings();
			this.$nextTick(() => {
				this.scrollChartToEnd();
				this.updateChartFade();
			});
			alert('Saved data wiped.');
		},

		setPickerFromKg(weightKg) {
			let visibleValue = this.model.convertWeightKg(weightKg);
			let whole = Math.floor(visibleValue);
			let decimal = Math.round((visibleValue - whole) * 10);
			if (decimal === 10) {
				whole += 1;
				decimal = 0;
			}
			let fallback = this.activeWholeList[0];
			this.pickerWhole = this.activeWholeList.includes(whole) ? whole : fallback;
			this.pickerDecimal = decimal;
		},

		syncPickerScroll() {
			let wholeIndex = this.activeWholeList.indexOf(this.pickerWhole);
			if (this.$refs.wholeWheel && wholeIndex >= 0) {
				this.$refs.wholeWheel.scrollTop = wholeIndex * 42;
			}
			if (this.$refs.decimalWheel) {
				this.$refs.decimalWheel.scrollTop = this.pickerDecimal * 42;
			}
		},

		onWheelScroll(kind, element) {
			let index = Math.round(element.scrollTop / 42);
			if (kind === 'whole') {
				let bounded = Math.max(0, Math.min(index, this.activeWholeList.length - 1));
				this.pickerWhole = this.activeWholeList[bounded];
				return;
			}
			this.pickerDecimal = Math.max(0, Math.min(index, 9));
		},

		onPickerWheel(kind, event, element) {
			if (!event || !element || event.deltaY === 0) {
				return;
			}
			event.preventDefault();
			let direction = event.deltaY > 0 ? 1 : -1;
			if (kind === 'whole') {
				let currentIndex = this.activeWholeList.indexOf(this.pickerWhole);
				let targetIndex = Math.max(0, Math.min(currentIndex + direction, this.activeWholeList.length - 1));
				this.pickerWhole = this.activeWholeList[targetIndex];
				element.scrollTo({ top: targetIndex * 42, behavior: 'smooth' });
				return;
			}
			let targetIndex = Math.max(0, Math.min(this.pickerDecimal + direction, 9));
			this.pickerDecimal = targetIndex;
			element.scrollTo({ top: targetIndex * 42, behavior: 'smooth' });
		},

		saveEntry() {
			let nextWeightKg = this.selectedPickerKg();
			if (!this.entryDate) {
				return;
			}
			this.model.upsertEntry(this.entryDate, nextWeightKg, this.editingDate ?? undefined);
			this.refreshChartRender();
			this.persist();
			this.closeOverlay();
			this.$nextTick(() => {
				this.scrollChartToEnd();
				this.updateChartFade();
			});
		},

		saveGoal() {
			this.model.setGoal({
				weightKg: Number(this.selectedPickerKg().toFixed(3)),
				rateKg: Number(this.goalRateDraftKg.toFixed(3)),
				rateUnit: this.goalRateDraftUnit === 'Month' ? 'Month' : 'Week',
			});
			this.persist();
			this.closeOverlay();
		},

		saveOverlay() {
			if (this.overlayMode === 'goal') {
				this.saveGoal();
				return;
			}

			this.saveEntry();
		},

		clearGoal() {
			this.model.clearGoal();
			this.persist();
			this.closeOverlay();
		},

		deleteEntry(date) {
			if (this.removingIds[date]) {
				return;
			}
			this.removingIds = { ...this.removingIds, [date]: true };
			window.setTimeout(() => {
				this.model.removeEntry(date);
				let nextRemoving = { ...this.removingIds };
				delete nextRemoving[date];
				this.removingIds = nextRemoving;
				this.refreshChartRender();
				this.persist();
				this.$nextTick(() => {
					this.updateChartFade();
				});
			}, 170);
		},

		scrollChartToEnd() {
			if (this.$refs.chartScroll) {
				this.$refs.chartScroll.scrollLeft = this.$refs.chartScroll.scrollWidth;
			}
		},

		onChartScroll() {
			this.updateChartFade();
		},

		updateChartFade() {
			let scroller = this.$refs.chartScroll;
			if (!scroller) {
				this.chartFadeLeft = false;
				this.chartFadeRight = false;
				return;
			}
			let maxScroll = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);
			this.chartFadeLeft = scroller.scrollLeft > 2;
			this.chartFadeRight = scroller.scrollLeft < maxScroll - 2;
		}
	};
}

window.featherWeightViewModel = featherWeightViewModel;
