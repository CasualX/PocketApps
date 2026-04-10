// @ts-check
// node --experimental-default-type=module docs/feather-weight/app.test.js

import {
	VERSION,
	normalizeAppState,
	createApp,
	dateToDayNumber,
	generateDemoEntries,
	isoDateFromDate,
	shiftDate,
	startOfMonth,
	startOfWeek,
} from './app.js';

/**
 * @param {unknown} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
	if (condition) {
		return;
	}

	throw new Error(message);
}

/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} message
 */
function assertEqual(actual, expected, message) {
	if (Object.is(actual, expected)) {
		return;
	}

	throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
}

/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} message
 */
function assertDeepEqual(actual, expected, message) {
	let actualJson = JSON.stringify(actual);
	let expectedJson = JSON.stringify(expected);
	if (actualJson === expectedJson) {
		return;
	}

	throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
}

function testNormalizeAppStateFiltersInvalidValuesButKeepsCompatibleData() {
	let normalized = normalizeAppState({
		version: 'old',
		themeMode: 'sepia',
		unit: 'STONE',
		historyView: 'Year',
		zoom: 'Decade',
		goal: {
			weightKg: 68,
			rateKg: Number.NaN,
			rateUnit: 'Quarter',
		},
		entries: {
			'2026-04-01': 72.4,
			'bad-date': 10,
			'2026-04-02': Number.POSITIVE_INFINITY,
		},
	});

	assertDeepEqual(normalized, {
		version: VERSION,
		themeMode: 'auto',
		unit: 'KG',
		historyView: 'Week',
		zoom: 'Month',
		goal: {
			weightKg: 68,
			rateKg: 0.5,
			rateUnit: 'Week',
		},
		entries: {
			'2026-04-01': 72.4,
		},
	}, 'normalization should preserve only valid persisted fields');
}

function testModelEntryCrudKeepsDatesSortedAndRoundsWeights() {
	let model = createApp();
	model.upsertEntry('2026-04-03', 73.4567);
	model.upsertEntry('2026-04-01', 74.001);
	model.upsertEntry('2026-04-02', 73.8);

	assertDeepEqual(model.sortedEntries, [
		{ date: '2026-04-01', weightKg: 74.001 },
		{ date: '2026-04-02', weightKg: 73.8 },
		{ date: '2026-04-03', weightKg: 73.457 },
	], 'entries should be sorted by ISO date and rounded to 3 decimals');

	model.upsertEntry('2026-04-04', 73.2, '2026-04-02');
	assertEqual(model.entries['2026-04-02'], undefined, 'editing an entry date should remove the old key');
	assertEqual(model.entries['2026-04-04'], 73.2, 'editing an entry date should insert the new key');

	assertEqual(model.removeEntry('2026-04-99'), false, 'removing a missing entry should return false');
	assertEqual(model.removeEntry('2026-04-01'), true, 'removing an existing entry should return true');
}

function testWeightInterpolationReturnsExactInterpolatedAndOutOfRangeValuesCorrectly() {
	let model = createApp({
		entries: {
			'2026-04-01': 80,
			'2026-04-05': 76,
		},
	});

	assertEqual(model.weightKgAtDate('2026-04-01'), 80, 'exact date should return the exact weight');
	assertEqual(model.weightKgAtDate('2026-04-03'), 78, 'midpoint interpolation should be linear');
	assertEqual(model.weightKgAtDate('2026-03-31'), null, 'dates before the first entry should return null');
	assertEqual(model.weightKgAtDate('2026-04-06'), null, 'dates after the last entry should return null');
}

function testWeeklyAndMonthlyHistoryComputeMedianEntriesAndDeltas() {
	let model = createApp({
		entries: {
			'2026-03-30': 80,
			'2026-04-01': 79,
			'2026-04-02': 78,
			'2026-04-07': 77,
			'2026-04-08': 76,
			'2026-04-09': 75,
		},
	});

	let weekly = model.weeklyHistory;
	assertEqual(weekly.length, 2, 'two weeks of entries should produce two weekly periods');
	assertEqual(weekly[0].periodStart, '2026-04-06', 'latest weekly period should be first');
	assertEqual(weekly[0].medianWeightKg, 76, 'latest weekly period median should be correct');
	assertEqual(weekly[0].deltaKg, -3, 'weekly delta should compare medians against the previous week');

	let monthly = model.monthlyHistory;
	assertEqual(monthly.length, 2, 'entries spanning month boundaries should produce monthly periods');
	assertEqual(monthly[0].periodStart, '2026-04-01', 'latest monthly period should be first');
	assertEqual(monthly[0].medianWeightKg, 77, 'monthly median should be correct');
	assertEqual(monthly[0].deltaKg, -3, 'monthly delta should compare month medians');
}

function testSinceLastWeekChangeAndThirtyDayTrendExposeDerivedTrendValues() {
	/** @type {Record<string, number>} */
	let entries = {};
	let startDate = new Date(2026, 1, 1);
	for (let index = 0; index < 60; index += 1) {
		let date = new Date(startDate);
		date.setDate(startDate.getDate() + index);
		entries[isoDateFromDate(date)] = 90 - index * 0.2;
	}

	let model = createApp({ entries });
	let weeklyChange = model.sinceLastWeekChange();
	assert(weeklyChange !== null, 'sinceLastWeekChange should exist with enough weekly history');
	assertEqual(weeklyChange.deltaKg, -1, 'weekly change should reflect the median delta between the latest two weeks');

	let trend = model.thirtyDayTrend();
	assert(trend !== null, 'thirtyDayTrend should exist with enough samples');
	assertEqual(Number(trend.deltaKg.toFixed(3)), -6, '30 day trend should compare rolling 30 day averages');
}

function testGoalStatusAndGoalProgressUseTheLatestEntryAndTarget() {
	let model = createApp({
		goal: { weightKg: 75, rateKg: 0.5, rateUnit: 'Week' },
		entries: {
			'2026-04-01': 82,
			'2026-04-10': 79,
		},
	});

	let status = model.goalStatus();
	assertDeepEqual(status, {
		targetWeightKg: 75,
		currentWeightKg: 79,
		remainingKg: 4,
		rateKg: 0.5,
		rateUnit: 'Week',
		periodsRemaining: 8,
		reached: false,
	}, 'goal status should use the latest entry and goal rate');

	let progress = model.goalProgress();
	assert(progress !== null, 'goalProgress should exist when a goal and entries are present');
	assertEqual(Number(progress.fraction.toFixed(3)), Number((3 / 7).toFixed(3)), 'goal progress fraction should track completed change');
}

function testChartEntriesForZoomAndBuildChartSeriesExposeChartDomainDataOnly() {
	/** @type {Record<string, number>} */
	let entries = {};
	let startDate = new Date(2025, 0, 1);
	for (let index = 0; index < 500; index += 1) {
		let date = new Date(startDate);
		date.setDate(startDate.getDate() + index);
		entries[isoDateFromDate(date)] = 80 - index * 0.01;
	}

	let model = createApp({ zoom: 'Month', entries });
	let monthEntries = model.chartEntriesForZoom('Month');
	let yearEntries = model.chartEntriesForZoom('Year');
	assert(monthEntries.length < yearEntries.length, 'month zoom should window the series while year zoom should keep all entries');

	let series = model.buildChartSeries('Week');
	assertEqual(series.zoom, 'Week', 'chart series should keep the requested zoom');
	assertEqual(series.minDayNumber, dateToDayNumber(series.points[0].date), 'chart series should include min day number');
	assertEqual(series.maxDayNumber, dateToDayNumber(series.points[series.points.length - 1].date), 'chart series should include max day number');
	assert('value' in series.points[0] === false, 'chart series should not contain presentation-only fields');
}

function testDateHelpersStayDeterministicAcrossRuntimes() {
	assertEqual(startOfWeek('2026-04-10'), '2026-04-06', 'week starts on Monday');
	assertEqual(startOfMonth('2026-04-10'), '2026-04-01', 'month starts on the first');
	assertEqual(shiftDate('2026-04-10', 'week', -2), '2026-03-27', 'shiftDate should move by whole weeks');
}

function testGenerateDemoEntriesCanUseDeterministicInputs() {
	let values = [0.2, 0.4, 0.1, 0.3, 0.2, 0.9, 0.1, 0.2, 0.3];
	let index = 0;
	let random = () => {
		let value = values[index % values.length];
		index += 1;
		return value;
	};

	let today = new Date(2026, 3, 10);
	let entries = generateDemoEntries({ totalDays: 2, today, random });
	assert(Object.keys(entries).length >= 1, 'demo generator should emit at least one entry');
	assert(entries[isoDateFromDate(today)] !== undefined, 'demo generator should always include today');
}

/**
 * @param {Array<() => void>} testFunctions
 */
function runTests(testFunctions) {
	let failures = 0;

	for (let testFn of testFunctions) {
		try {
			testFn();
			console.log(`PASS ${testFn.name}`);
		}
		catch (error) {
			failures += 1;
			console.error(`FAIL ${testFn.name}`);
			console.error(error instanceof Error ? error.stack ?? error.message : String(error));
		}
	}

	if (failures > 0) {
		console.error(`\n${failures} test${failures === 1 ? '' : 's'} failed.`);
		throw new Error(`Test run failed with ${failures} failing test${failures === 1 ? '' : 's'}.`);
	}

	console.log('\nAll tests passed.');
}

runTests([
	testNormalizeAppStateFiltersInvalidValuesButKeepsCompatibleData,
	testModelEntryCrudKeepsDatesSortedAndRoundsWeights,
	testWeightInterpolationReturnsExactInterpolatedAndOutOfRangeValuesCorrectly,
	testWeeklyAndMonthlyHistoryComputeMedianEntriesAndDeltas,
	testSinceLastWeekChangeAndThirtyDayTrendExposeDerivedTrendValues,
	testGoalStatusAndGoalProgressUseTheLatestEntryAndTarget,
	testChartEntriesForZoomAndBuildChartSeriesExposeChartDomainDataOnly,
	testDateHelpersStayDeterministicAcrossRuntimes,
	testGenerateDemoEntriesCanUseDeterministicInputs,
]);
