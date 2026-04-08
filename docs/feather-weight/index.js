const VERSION = '1.0';
const STORAGE_KEY = 'feather-weight-data' + window.location.hash;

function defaultAppState() {
	return {
		version: VERSION,
		themeMode: 'auto',
		unit: 'KG',
		zoom: 'Month',
		goal: null,
		entries: {}
	};
}

function featherWeightApp() {
	return {
		appState: defaultAppState(),
		storageLocked: false,
		viewportWidth: window.innerWidth,
		unitOptions: ['KG', 'LBS'],
		zoomOptions: ['Week', 'Month', 'Year'],
		themeOptions: ['auto', 'light', 'dark'],
		mainScrollY: 0,
		overlayOpen: false,
		overlayMode: 'entry',
		editingDate: null,
		entryDate: '',
		pickerWhole: 70,
		pickerDecimal: 0,
		goalRateDraftKg: 0.5,
		removingIds: {},
		expandedWeeks: {},
		showAllHistory: false,
		valuePulse: false,
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
				path: '',
				points: []
			},
			yAxisMarkup: '',
			horizontalMinorGridMarkup: '',
			horizontalMajorGridMarkup: '',
			verticalMinorGridMarkup: '',
			verticalMajorGridMarkup: '',
			pointsMarkup: '',
			xLabelsMarkup: ''
		},
		settingsOpen: false,
		wholeKg: Array.from({ length: 101 }, (_, index) => index + 20),
		wholeLbs: Array.from({ length: 223 }, (_, index) => index + 44),
		decimals: Array.from({ length: 10 }, (_, index) => index),

		init() {
			if (window.location.hash === '#demo') {
				let appState = defaultAppState();
				appState.entries = this.generateDemoEntries();
				this.appState = appState;
				this.storageLocked = true;
				this.resetHistoryView();
			}
			else if (window.location.hash === '#empty') {
				this.storageLocked = true;
			}
			else {
				this.restore();
			}
			this.applyTheme();
			this.$watch('appState.themeMode', () => {
				this.applyTheme();
				this.persist();
			});
			this.$watch('appState.unit', () => {
				this.refreshChartRender();
				this.persist();
				this.bumpValuePulse();
			});
			this.$watch('appState.zoom', () => {
				this.refreshChartRender();
				this.persist();
				this.$nextTick(() => {
					this.scrollChartToEnd();
					this.updateChartFade();
				});
			});
			window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
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
				this.appState = saved;
			}
			catch (error) {
				this.storageLocked = true;
				alert('Stored app data is invalid. Reset the app state or import valid data. Changes will not be saved until you manually reset or import data. You can export first if needed.');
			}
		},

		persist() {
			if (this.storageLocked) {
				return;
			}
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.appState));
		},

		applyTheme() {
			let resolved;
			if (this.appState.themeMode === 'light' || this.appState.themeMode === 'dark') {
				resolved = this.appState.themeMode;
			}
			else {
				resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
			}
			document.documentElement.setAttribute('data-theme', resolved);
		},

		resolvedTheme() {
			if (this.appState.themeMode === 'light' || this.appState.themeMode === 'dark') {
				return this.appState.themeMode;
			}
			return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		},

		switchUnit(nextUnit) {
			if (nextUnit === this.appState.unit) {
				return;
			}
			if (this.overlayOpen) {
				let currentKg = this.selectedPickerKg();
				this.appState.unit = nextUnit;
				this.$nextTick(() => {
					this.setPickerFromKg(currentKg);
					this.syncPickerScroll();
				});
				return;
			}
			this.appState.unit = nextUnit;
		},

		setZoom(level) {
			this.appState.zoom = level;
		},

		entryWeight(entry) {
			return this.appState.unit === 'KG' ? entry.weightKg : entry.weightKg * 2.2046226218;
		},

		isoDateFromDate(date) {
			let year = date.getFullYear();
			let month = String(date.getMonth() + 1).padStart(2, '0');
			let day = String(date.getDate()).padStart(2, '0');
			return `${year}-${month}-${day}`;
		},

		isoDateToDate(dateValue) {
			let [year, month, day] = String(dateValue).split('-').map(Number);
			return new Date(year, month - 1, day);
		},

		todayIsoDate() {
			return this.isoDateFromDate(new Date());
		},

		dateToDayNumber(dateValue) {
			let [year, month, day] = String(dateValue).split('-').map(Number);
			return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
		},

		dayNumberToDate(dayNumber) {
			let utcDate = new Date(dayNumber * 86400000);
			return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
		},

		dayNumberToIsoDate(dayNumber) {
			return this.isoDateFromDate(this.dayNumberToDate(dayNumber));
		},

		selectedPickerKg() {
			let selected = this.pickerWhole + this.pickerDecimal / 10;
			return this.appState.unit === 'KG' ? selected : selected / 2.2046226218;
		},

		formatWeight(weightKg, digits = 1) {
			let converted = this.appState.unit === 'KG' ? weightKg : weightKg * 2.2046226218;
			return converted.toFixed(digits);
		},

		formatAxisValue(value) {
			return value.toFixed(1).replace(/\.0$/, '');
		},

		formatDate(dateValue) {
			return this.isoDateToDate(dateValue).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		},

		formatHeaderDate() {
			return new Date().toLocaleDateString(undefined, {
				weekday: 'long',
				month: 'long',
				day: 'numeric'
			});
		},

		formatWeekLabel(dateValue) {
			return this.isoDateToDate(dateValue).toLocaleDateString(undefined, {
				month: 'long',
				day: 'numeric'
			});
		},

		formatWeekday(dateValue) {
			return this.isoDateToDate(dateValue).toLocaleDateString(undefined, {
				weekday: 'long'
			});
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
			let dayDiff = this.dateToDayNumber(this.todayIsoDate()) - this.dateToDayNumber(dateValue);
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
			let converted = this.appState.unit === 'KG' ? deltaKg : deltaKg * 2.2046226218;
			let rounded = Math.abs(converted) < 0.05 ? 0 : Number(converted.toFixed(1));
			let number = `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
			return {
				number,
				unit: this.appState.unit,
				tone: rounded > 0 ? 'negative' : rounded < 0 ? 'positive' : 'neutral'
			};
		},

		emptyDeltaSummary(label) {
			return {
				label,
				valueNumber: '--',
				valueUnit: '',
				tone: 'neutral'
			};
		},

		setEntryDate(dateValue) {
			this.entryDate = dateValue;
		},

		formatRateLabel(rateKgPerWeek) {
			return `${this.formatWeight(rateKgPerWeek)} ${this.appState.unit} / week`;
		},

		formatWeeksLabel(weeks) {
			return `${weeks} wk${weeks === 1 ? '' : 's'}`;
		},

		rateStepKg() {
			return this.appState.unit === 'KG' ? 0.1 : 0.1 / 2.2046226218;
		},

		changeGoalRate(direction) {
			let nextRate = this.goalRateDraftKg + direction * this.rateStepKg();
			let boundedRate = Math.max(this.rateStepKg(), Math.min(nextRate, 4));
			this.goalRateDraftKg = Number(boundedRate.toFixed(3));
		},

		generateDemoEntries() {
			let generated = {};
			let totalDays = 365 * 4;
			let start = new Date();
			start.setHours(0, 0, 0, 0);
			start.setDate(start.getDate() - totalDays);
			let weight = 72 + (Math.random() - 0.5) * 8;
			for (let dayIndex = 0; dayIndex <= totalDays; dayIndex += 1) {
				if (Math.random() > 0.5) {
					continue;
				}
				weight += (Math.random() - 0.5) * 0.42;
				weight += (72 - weight) * 0.015;
				weight = Math.max(54, Math.min(108, weight));
				let entryDate = new Date(start);
				entryDate.setDate(start.getDate() + dayIndex);
				generated[this.isoDateFromDate(entryDate)] = Number(weight.toFixed(1));
			}
			if (!generated[this.todayIsoDate()]) {
				generated[this.todayIsoDate()] = Number(weight.toFixed(1));
			}
			return generated;
		},

		startOfWeek(dateValue) {
			let date = this.isoDateToDate(dateValue);
			let offset = (date.getDay() + 6) % 7;
			date.setDate(date.getDate() - offset);
			return this.isoDateFromDate(date);
		},

		startOfMonth(dateValue) {
			let date = this.isoDateToDate(dateValue);
			date.setDate(1);
			return this.isoDateFromDate(date);
		},

		shiftDate(dateValue, unit, amount) {
			let next = this.isoDateToDate(dateValue);
			if (unit === 'day') {
				next.setDate(next.getDate() + amount);
			}
			else if (unit === 'week') {
				next.setDate(next.getDate() + amount * 7);
			}
			else if (unit === 'month') {
				next.setMonth(next.getMonth() + amount);
			}
			return this.isoDateFromDate(next);
		},

		weightKgAtDate(dateValue) {
			let entries = this.sortedEntries;
			if (!entries.length) {
				return null;
			}

			let exactWeight = this.appState.entries[dateValue];
			if (typeof exactWeight === 'number') {
				return exactWeight;
			}

			let targetDayNumber = this.dateToDayNumber(dateValue);
			let firstDayNumber = this.dateToDayNumber(entries[0].date);
			let lastDayNumber = this.dateToDayNumber(entries[entries.length - 1].date);
			if (targetDayNumber < firstDayNumber || targetDayNumber > lastDayNumber) {
				return null;
			}

			for (let index = 1; index < entries.length; index += 1) {
				let previousEntry = entries[index - 1];
				let nextEntry = entries[index];
				let previousDayNumber = this.dateToDayNumber(previousEntry.date);
				let nextDayNumber = this.dateToDayNumber(nextEntry.date);

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

		previousWeekAnchor(dateValue) {
			return this.shiftDate(dateValue, 'week', -1);
		},

		previousMonthAnchor(dateValue) {
			let source = this.isoDateToDate(dateValue);
			let previousMonthDate = new Date(source.getFullYear(), source.getMonth(), 0);
			let clampedDay = Math.min(source.getDate(), previousMonthDate.getDate());
			let target = new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth(), clampedDay);
			return this.isoDateFromDate(target);
		},

		buildDeltaSummary(primaryLabel, baselineDate) {
			let latest = this.lastEntry;
			if (!latest) {
				return this.emptyDeltaSummary(primaryLabel);
			}

			let baselineWeightKg = this.weightKgAtDate(baselineDate);
			if (baselineWeightKg === null) {
				return this.emptyDeltaSummary(primaryLabel);
			}

			let delta = this.formatDeltaParts(latest.weightKg - baselineWeightKg);

			return {
				label: primaryLabel,
				valueNumber: delta.number,
				valueUnit: delta.unit,
				tone: delta.tone,
			};
		},

		medianEntryForWeek(entries) {
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

		toggleWeekExpansion(weekStart) {
			this.expandedWeeks = {
				...this.expandedWeeks,
				[weekStart]: !this.expandedWeeks[weekStart]
			};
		},

		loadFullHistory() {
			this.showAllHistory = true;
		},

		resetHistoryView() {
			this.expandedWeeks = {};
			this.showAllHistory = false;
		},

		formatTimeTickLabel(date) {
			if (this.appState.zoom === 'Week') {
				return date.toLocaleDateString(undefined, { weekday: 'short' });
			}
			if (this.appState.zoom === 'Month') {
				return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
			}
			let month = date.toLocaleDateString(undefined, { month: 'short' });
			return date.getMonth() === 0 ? `${month} '${String(date.getFullYear()).slice(-2)}` : month;
		},

		buildYearTicks(minDayNumber, maxDayNumber, xForDayNumber) {
			let major = [];
			let minor = [];
			let monthStart = this.startOfMonth(this.dayNumberToIsoDate(minDayNumber));
			let lastBoundary = this.shiftDate(this.startOfMonth(this.dayNumberToIsoDate(maxDayNumber)), 'month', 1);

			while (monthStart <= lastBoundary) {
				let currentDayNumber = this.dateToDayNumber(monthStart);
				let nextMonth = this.shiftDate(monthStart, 'month', 1);
				let nextDayNumber = this.dateToDayNumber(nextMonth);

				if (currentDayNumber >= minDayNumber && currentDayNumber <= maxDayNumber) {
					major.push({
						dayNumber: currentDayNumber,
						x: xForDayNumber(currentDayNumber),
						label: this.formatTimeTickLabel(this.isoDateToDate(monthStart))
					});
				}

				for (let division = 1; division < 4; division += 1) {
					let dayNumber = currentDayNumber + ((nextDayNumber - currentDayNumber) * division) / 4;
					if (dayNumber >= minDayNumber && dayNumber <= maxDayNumber) {
						minor.push({
							dayNumber,
							x: xForDayNumber(dayNumber)
						});
					}
				}

				monthStart = nextMonth;
			}

			return { major, minor };
		},

		buildTimeTicks(minDayNumber, maxDayNumber, xForDayNumber) {
			if (this.appState.zoom === 'Year') {
				return this.buildYearTicks(minDayNumber, maxDayNumber, xForDayNumber);
			}

			let major = [];
			let minor = [];

			if (this.appState.zoom === 'Week') {
				for (let dayNumber = minDayNumber; dayNumber <= maxDayNumber; dayNumber += 1) {
					major.push({
						dayNumber,
						x: xForDayNumber(dayNumber),
						label: this.formatTimeTickLabel(this.dayNumberToDate(dayNumber))
					});
				}
				return { major, minor };
			}

			let majorCursor = this.startOfWeek(this.dayNumberToIsoDate(minDayNumber));
			while (this.dateToDayNumber(majorCursor) <= maxDayNumber) {
				let dayNumber = this.dateToDayNumber(majorCursor);
				if (dayNumber >= minDayNumber && dayNumber <= maxDayNumber) {
					major.push({
						dayNumber,
						x: xForDayNumber(dayNumber),
						label: this.formatTimeTickLabel(this.isoDateToDate(majorCursor))
					});
				}
				majorCursor = this.shiftDate(majorCursor, 'week', 1);
			}

			let majorDayNumbers = new Set(major.map((tick) => tick.dayNumber));
			for (let dayNumber = minDayNumber; dayNumber <= maxDayNumber; dayNumber += 1) {
				if (!majorDayNumbers.has(dayNumber)) {
					minor.push({
						dayNumber,
						x: xForDayNumber(dayNumber)
					});
				}
			}

			return { major, minor };
		},

		get sortedEntries() {
			return Object.keys(this.appState.entries)
				.sort((left, right) => left.localeCompare(right))
				.map((date) => ({
					date,
					weightKg: this.appState.entries[date]
				}));
		},

		get weeklyHistory() {
			let weeksByStart = new Map();
			for (let entry of this.sortedEntries) {
				let weekStart = this.startOfWeek(entry.date);
				let bucket = weeksByStart.get(weekStart) || [];
				bucket.push(entry);
				weeksByStart.set(weekStart, bucket);
			}

			let weeks = Array.from(weeksByStart.entries())
				.sort((left, right) => right[0].localeCompare(left[0]))
				.map(([weekStart, entries]) => {
					let sortedWeekEntries = [...entries].sort((left, right) => left.date.localeCompare(right.date));
					let medianEntry = this.medianEntryForWeek(sortedWeekEntries);
					return {
						weekStart,
						entries: sortedWeekEntries,
						medianEntry,
						entryCount: sortedWeekEntries.length
					};
				});

			let weekLookup = new Map(weeks.map((week) => [week.weekStart, week]));
			return weeks.map((week) => {
				let previousWeek = weekLookup.get(this.shiftDate(week.weekStart, 'week', -1));
				return {
					...week,
					weekLabel: this.formatWeekLabel(week.weekStart),
					medianValue: week.medianEntry ? this.formatWeight(week.medianEntry.weightKg) : '--.-',
					delta: previousWeek && previousWeek.medianEntry
						? this.formatDeltaParts(week.medianEntry.weightKg - previousWeek.medianEntry.weightKg)
						: null
				};
			});
		},

		get visibleWeeklyHistory() {
			return this.showAllHistory ? this.weeklyHistory : this.weeklyHistory.slice(0, 16);
		},

		get hasMoreWeeklyHistory() {
			return this.weeklyHistory.length > 16 && !this.showAllHistory;
		},

		get lastEntry() {
			return this.sortedEntries[this.sortedEntries.length - 1] || null;
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
			return this.appState.goal ? this.formatWeight(this.appState.goal.weightKg) : '--.-';
		},

		get goalRateDraftLabel() {
			return this.formatWeight(this.goalRateDraftKg);
		},

		get goalWeeksRemaining() {
			if (!this.appState.goal || !this.lastEntry) {
				return null;
			}

			let remainingKg = this.lastEntry.weightKg - this.appState.goal.weightKg;
			if (remainingKg <= 0) {
				return 0;
			}

			return Math.ceil(remainingKg / this.appState.goal.rateKgPerWeek);
		},

		get goalPanelMeta() {
			if (!this.appState.goal) {
				return '';
			}

			let rateLabel = this.formatRateLabel(this.appState.goal.rateKgPerWeek);
			if (!this.lastEntry) {
				return rateLabel;
			}

			if (this.goalWeeksRemaining === 0) {
				return `${rateLabel} · reached`;
			}

			return `${rateLabel} · ${this.formatWeeksLabel(this.goalWeeksRemaining)}`;
		},

		get goalPreview() {
			if (!this.lastEntry) {
				return {
					title: 'Add a weight first',
					detail: 'The forecast starts once you have a current measurement.'
				};
			}

			let targetWeightKg = this.selectedPickerKg();
			let remainingKg = this.lastEntry.weightKg - targetWeightKg;
			if (remainingKg <= 0) {
				return {
					title: 'Goal already reached',
					detail: `Current weight is already at or below ${this.formatWeight(targetWeightKg)} ${this.appState.unit}.`
				};
			}

			let weeks = Math.ceil(remainingKg / this.goalRateDraftKg);
			return {
				title: `About ${weeks} week${weeks === 1 ? '' : 's'} left`,
				detail: `${this.formatWeight(remainingKg)} ${this.appState.unit} to lose at ${this.formatRateLabel(this.goalRateDraftKg)}.`
			};
		},

		get lastWeekDeltaCard() {
			if (!this.lastEntry) {
				let baselineDate = this.todayIsoDate();
				return this.buildDeltaSummary('Since last week', baselineDate);
			}

			let currentWeek = this.weeklyHistory[0];
			if (!currentWeek || !currentWeek.delta) {
				return {
					label: 'Since last week',
					valueNumber: '--',
					valueUnit: '',
					tone: 'neutral',
				};
			}

			return {
				label: 'Since last week',
				valueNumber: currentWeek.delta.number,
				valueUnit: currentWeek.delta.unit,
				tone: currentWeek.delta.tone,
			};
		},

		get lastMonthDeltaCard() {
			let baselineDate = this.lastEntry ? this.previousMonthAnchor(this.lastEntry.date) : this.todayIsoDate();
			return this.buildDeltaSummary('Since last month', baselineDate);
		},

		get chartEntries() {
			let entries = this.sortedEntries;
			if (!entries.length || this.appState.zoom === 'Year') {
				return entries;
			}

			let latestDate = entries[entries.length - 1].date;
			let cutoff = this.appState.zoom === 'Week'
				? this.shiftDate(this.startOfWeek(latestDate), 'week', -15)
				: this.shiftDate(this.startOfMonth(latestDate), 'month', -11);

			return entries.filter((entry) => entry.date >= cutoff);
		},

		get activeWholeList() {
			return this.appState.unit === 'KG' ? this.wholeKg : this.wholeLbs;
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
				path: '',
				points: []
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
			let entries = this.chartEntries;
			if (!entries.length) {
				return this.emptyChartModel();
			}

			let minDayNumber = this.dateToDayNumber(entries[0].date);
			let maxDayNumber = this.dateToDayNumber(entries[entries.length - 1].date);
			let spanDays = Math.max(maxDayNumber - minDayNumber, 1);
			let pixelsPerDay = this.appState.zoom === 'Week' ? 56 : this.appState.zoom === 'Month' ? 16 : 4.6;
			let width = Math.max(fallbackWidth, Math.round(spanDays * pixelsPerDay) + PAD_LEFT + PAD_RIGHT + 20);
			let rawWeights = entries.map((entry) => this.entryWeight(entry));
			let minimum = Math.min(...rawWeights);
			let maximum = Math.max(...rawWeights);
			let majorYStep = 1;
			let valuePadding = Math.max((maximum - minimum) * 0.18, this.appState.unit === 'KG' ? 0.6 : 1.2);
			let lowerBound = Math.floor(minimum - valuePadding);
			let upperBound = Math.ceil(maximum + valuePadding);
			let minimumVisibleSpan = this.appState.unit === 'KG' ? 3 : 4;
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
				let dayNumber = this.dateToDayNumber(entry.date);
				let x = xForDayNumber(dayNumber);
				let y = PAD_TOP + (1 - ((this.entryWeight(entry) - lowerBound) / valueSpan)) * plotHeight;
				return {
					date: entry.date,
					dayNumber,
					value: this.entryWeight(entry),
					x,
					y
				};
			});

			let path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
			let yTicksMajor = [];
			for (let value = lowerBound; value <= upperBound + 0.001; value += majorYStep) {
				yTicksMajor.push({
					value: this.formatAxisValue(value),
					y: PAD_TOP + (1 - ((value - lowerBound) / valueSpan)) * plotHeight
				});
			}
			let yTicksMinor = [];
			if (minorDivisions > 0) {
				let minorYStep = majorYStep / minorDivisions;
				for (let majorValue = lowerBound; majorValue < upperBound; majorValue += majorYStep) {
					for (let division = 1; division < minorDivisions; division += 1) {
						let value = majorValue + division * minorYStep;
						yTicksMinor.push({
							y: PAD_TOP + (1 - ((value - lowerBound) / valueSpan)) * plotHeight
						});
					}
				}
			}
			let timeTicks = this.buildTimeTicks(minDayNumber, maxDayNumber, xForDayNumber);

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
				path,
				points
			};
		},

		buildChartRender() {
			let model = this.buildChartModel();
			return {
				model,
				yAxisMarkup: model.yTicksMajor.map((tick) => `<g><line x1="${model.axisWidth - 8}" y1="${tick.y}" x2="${model.axisWidth}" y2="${tick.y}" stroke="var(--grid)" stroke-width="1"></line><text x="${model.axisWidth - 10}" y="${tick.y + 4}" text-anchor="end" fill="var(--text-faint)" font-size="11" letter-spacing="0.04em">${this.escapeSvgText(tick.value + ' ' + this.appState.unit)}</text></g>`).join(''),
				horizontalMinorGridMarkup: model.yTicksMinor.map((tick) => `<line x1="0" y1="${tick.y}" x2="${model.width}" y2="${tick.y}" stroke="var(--grid-soft)" stroke-width="1"></line>`).join(''),
				horizontalMajorGridMarkup: model.yTicksMajor.map((tick) => `<line x1="0" y1="${tick.y}" x2="${model.width}" y2="${tick.y}" stroke="var(--grid)" stroke-width="1"></line>`).join(''),
				verticalMinorGridMarkup: model.xTicksMinor.map((tick) => `<line x1="${tick.x}" y1="${model.plotTop}" x2="${tick.x}" y2="${model.plotBottom}" stroke="var(--grid-soft)" stroke-width="1"></line>`).join(''),
				verticalMajorGridMarkup: model.xTicksMajor.map((tick) => `<line x1="${tick.x}" y1="${model.plotTop}" x2="${tick.x}" y2="${model.plotBottom}" stroke="var(--grid)" stroke-width="1"></line>`).join(''),
				pointsMarkup: model.points.length > 14 ? '' : model.points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="2.8" fill="var(--bg)" stroke="var(--line)" stroke-width="1.8"></circle>`).join(''),
				xLabelsMarkup: model.xLabels.map((label) => `<text x="${label.x}" y="${model.labelY}" text-anchor="middle" fill="var(--text-faint)" font-size="11" letter-spacing="0.04em">${this.escapeSvgText(label.label)}</text>`).join('')
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
			this.setEntryDate(this.todayIsoDate());
			this.overlayOpen = true;
			this.$nextTick(() => this.syncPickerScroll());
		},

		openEdit(entry) {
			this.overlayMode = 'entry';
			this.editingDate = entry.date;
			this.setPickerFromKg(entry.weightKg);
			this.setEntryDate(entry.date);
			this.overlayOpen = true;
			this.$nextTick(() => this.syncPickerScroll());
		},

		openGoalSetup() {
			this.overlayMode = 'goal';
			this.editingDate = null;
			let baseWeight = this.appState.goal?.weightKg ?? this.lastEntry?.weightKg ?? 70;
			this.goalRateDraftKg = this.appState.goal?.rateKgPerWeek ?? 0.5;
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
			this.appState = imported;
			this.storageLocked = false;
			this.resetHistoryView();
			this.applyTheme();
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
			let payload = JSON.stringify(this.appState, null, 2);
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
			this.appState = defaultAppState();
			this.storageLocked = false;
			this.editingDate = null;
			this.overlayOpen = false;
			this.removingIds = {};
			this.resetHistoryView();
			this.applyTheme();
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
			let visibleValue = this.appState.unit === 'KG' ? weightKg : weightKg * 2.2046226218;
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
			let nextEntries = { ...this.appState.entries };
			if (this.editingDate && this.editingDate !== this.entryDate) {
				delete nextEntries[this.editingDate];
			}
			nextEntries[this.entryDate] = Number(nextWeightKg.toFixed(3));
			this.appState.entries = nextEntries;
			this.refreshChartRender();
			this.persist();
			this.bumpValuePulse();
			this.closeOverlay();
			this.$nextTick(() => {
				this.scrollChartToEnd();
				this.updateChartFade();
			});
		},

		saveGoal() {
			this.appState.goal = {
				weightKg: Number(this.selectedPickerKg().toFixed(3)),
				rateKgPerWeek: Number(this.goalRateDraftKg.toFixed(3))
			};
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
			this.appState.goal = null;
			this.persist();
			this.closeOverlay();
		},

		deleteEntry(date) {
			if (this.removingIds[date]) {
				return;
			}
			this.removingIds = { ...this.removingIds, [date]: true };
			window.setTimeout(() => {
				let nextEntries = { ...this.appState.entries };
				delete nextEntries[date];
				this.appState.entries = nextEntries;
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
		},

		bumpValuePulse() {
			this.valuePulse = true;
			window.clearTimeout(this.valuePulseTimer);
			this.valuePulseTimer = window.setTimeout(() => {
				this.valuePulse = false;
			}, 170);
		}
	};
}
