// @ts-check
// node --experimental-default-type=module docs/upkeep/app.test.js

import {
	VERSION,
	createApp,
	createRecurrenceDescription,
	isoDateToDayNumber,
	normalizeAppState,
	suggestGenerationWindowDays,
	suggestRuleStartDate,
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

/**
 * @param {string} value
 * @returns {number}
 */
function day(value) {
	return isoDateToDayNumber(value);
}

/**
 * @param {ReturnType<typeof createApp>} model
 * @returns {string}
 */
function describeInstances(model) {
	return JSON.stringify(model.instances.map(instance => ({
		templateId: instance.templateId,
		dueDate: instance.dueDate,
		completedAt: instance.completedAt,
		states: instance.items.map(item => item.state),
	})), null, 2);
}

function testNormalizeAppStateFiltersInvalidValuesButKeepsCompatibleData() {
	let normalized = normalizeAppState({
		version: 'old',
		lastOpenedDate: 'not-a-date',
		themeMode: 'sepia',
		templates: [
			{
				id: 'tpl_valid',
				title: 'Kitchen reset',
				recurrence: [{ id: 'rule_valid', type: 'weekly', interval: 1, day: 'Monday' }],
				items: [{ id: 'item_valid', label: 'Clear counters' }, { id: 'item_blank', label: '   ' }],
				generationWindowDays: 500,
				createdAt: '2026-04-01',
			},
			{
				id: 'tpl_invalid',
				title: ' ',
				recurrence: [],
				items: [],
			},
		],
		instances: [
			{
				id: 'inst_valid',
				templateId: 'tpl_valid',
				dueDate: '2026-04-07',
				items: [{ id: 'item_valid', label: 'Clear counters', state: 1 }],
				completedAt: null,
			},
			{
				id: 'inst_orphan',
				templateId: 'missing',
				dueDate: '2026-04-07',
				items: [],
				completedAt: null,
			},
		],
	});

	assertEqual(normalized.version, VERSION, 'normalization should pin the current version');
	assertEqual(normalized.themeMode, 'auto', 'invalid theme modes should fall back');
	assertEqual(normalized.lastOpenedDate, undefined, 'invalid last opened dates should be dropped');
	assertEqual(normalized.templates.length, 1, 'invalid templates should be removed');
	assertEqual(normalized.templates[0].items.length, 1, 'blank template items should be filtered');
	assertEqual(normalized.templates[0].generationWindowDays, 365, 'generation window should clamp into range');
	assertEqual(normalized.instances.length, 1, 'orphaned instances should be removed');
}

function testDailyRolloverKeepsOnlyTodayAndResetsChecklistProgress() {
	let model = createApp({
		lastOpenedDate: '2026-04-08',
		templates: [
			{
				id: 'tpl_daily',
				title: 'Daily',
				createdAt: '2026-04-07',
				updatedAt: '2026-04-07',
				recurrence: [{ id: 'rule_daily', type: 'daily', interval: 1 }],
				items: [{ id: 'item_a', label: 'A' }, { id: 'item_b', label: 'B' }],
				generationWindowDays: 7,
			}
		],
		instances: [
			{
				id: 'inst_yesterday',
				templateId: 'tpl_daily',
				dueDate: '2026-04-08',
				items: [
					{ id: 'item_a', label: 'A', state: 1 },
					{ id: 'item_b', label: 'B', state: 0 }
				],
				completedAt: null,
			},
		],
	});

	model.syncGeneratedInstances({ todayNumber: day('2026-04-09') });

	let active = model.instances.filter(instance => !instance.completedAt && instance.dueDate <= '2026-04-09');
	assertEqual(active.length, 1, `daily rollover should keep one active instance\n${describeInstances(model)}`);
	assertEqual(active[0].dueDate, '2026-04-09', `daily rollover should move the active instance to today\n${describeInstances(model)}`);
	assert(active[0].items.every(item => item.state === 0), `daily rollover should reset checklist progress\n${describeInstances(model)}`);
}

function testWeeklyCatchUpCreatesOnlyTheLatestMissedOverdueInstance() {
	let model = createApp({
		lastOpenedDate: '2026-03-09',
		templates: [
			{
				id: 'tpl_weekly',
				title: 'Weekly Monday',
				createdAt: '2026-03-02',
				updatedAt: '2026-03-02',
				recurrence: [{ id: 'rule_weekly', type: 'weekly', interval: 1, day: 'Monday' }],
				items: [],
				generationWindowDays: 7,
			},
		],
		instances: [],
	});

	model.syncGeneratedInstances({ todayNumber: day('2026-04-09') });

	let active = model.instances.filter(instance => !instance.completedAt && instance.dueDate <= '2026-04-09');
	assertEqual(active.length, 1, `weekly catch-up should keep one overdue instance\n${describeInstances(model)}`);
	assertEqual(active[0].dueDate, '2026-04-06', `weekly catch-up should use the latest missed Monday\n${describeInstances(model)}`);
}

function testSameDayCompletedInstanceStaysButExpiresTheNextDay() {
	let model = createApp({
		lastOpenedDate: '2026-04-09',
		templates: [
			{
				id: 'tpl_done',
				title: 'Done',
				createdAt: '2026-04-01',
				updatedAt: '2026-04-01',
				recurrence: [{ id: 'rule_daily', type: 'daily', interval: 1 }],
				items: [],
				generationWindowDays: 7,
			},
		],
		instances: [
			{
				id: 'inst_done',
				templateId: 'tpl_done',
				dueDate: '2026-04-09',
				items: [],
				completedAt: '2026-04-09T20:15:00.000Z',
			},
		],
	});

	model.syncGeneratedInstances({ todayNumber: day('2026-04-09') });
	let sameDayEntries = model.instances.filter(instance => instance.dueDate === '2026-04-09');
	assertEqual(sameDayEntries.length, 1, `same-day completion should not respawn a duplicate\n${describeInstances(model)}`);
	assert(Boolean(sameDayEntries[0].completedAt), `same-day completion should preserve the resolved copy\n${describeInstances(model)}`);

	model.syncGeneratedInstances({ todayNumber: day('2026-04-10') });
	let completed = model.instances.filter(instance => Boolean(instance.completedAt));
	let active = model.instances.filter(instance => !instance.completedAt && instance.dueDate <= '2026-04-10');
	assertEqual(completed.length, 0, `resolved copies should expire the next day\n${describeInstances(model)}`);
	assertEqual(active.length, 1, `a fresh due instance should be generated for the next day\n${describeInstances(model)}`);
	assertEqual(active[0].dueDate, '2026-04-10', `the new active instance should use the current due date\n${describeInstances(model)}`);
}

function testTemplateCrudUsesModelMethodsAndClearsFutureGeneratedCopiesOnEdit() {
	let model = createApp();
	let created = model.createTemplate({
		title: 'Swap HVAC filter',
		recurrence: [{ type: 'monthly', interval: 1, mode: 'day_of_month', day: 14 }],
		items: [{ label: 'Shut off the unit' }, { label: 'Replace the filter' }],
		generationWindowDays: 20,
	});

	assertEqual(model.templates.length, 1, 'createTemplate should append a normalized template');
	assertEqual(created.items.length, 2, 'createTemplate should keep valid checklist items');

	model.syncGeneratedInstances({ todayNumber: day('2026-04-10') });
	assert(model.instances.some(instance => instance.dueDate === '2026-04-14'), `initial generation should include the monthly due date\n${describeInstances(model)}`);

	model.updateTemplate(created.id, {
		id: created.id,
		title: 'Swap HVAC filter',
		recurrence: [{ type: 'monthly', interval: 1, mode: 'day_of_month', day: 18 }],
		items: [{ label: 'Replace the filter' }],
		generationWindowDays: 20,
	});

	assert(!model.instances.some(instance => !instance.completedAt && instance.dueDate === '2026-04-14'), `editing a template should clear stale future instances\n${describeInstances(model)}`);

	model.syncGeneratedInstances({ todayNumber: day('2026-04-10') });
	assert(model.instances.some(instance => instance.dueDate === '2026-04-18'), `regeneration should honor the edited recurrence\n${describeInstances(model)}`);
	assertEqual(model.deleteTemplate(created.id), true, 'deleteTemplate should report success for an existing template');
	assertEqual(model.templates.length, 0, 'deleteTemplate should remove the template');
	assertEqual(model.instances.length, 0, 'deleteTemplate should remove generated instances');
}

function testMonthlyDayOfMonthDescriptionsUseOrdinalDayLabels() {
	assertEqual(
		createRecurrenceDescription({ id: 'rule_monthly_7', type: 'monthly', interval: 1, mode: 'day_of_month', day: 7 }),
		'Every month on the 7th',
		'monthly day-of-month descriptions should use ordinal day labels'
	);
	assertEqual(
		createRecurrenceDescription({ id: 'rule_monthly_21', type: 'monthly', interval: 2, mode: 'day_of_month', day: 21 }),
		'Every 2 months on the 21st',
		'ordinal suffixes should stay correct for other day values'
	);
}

function testSuggestedRuleStartDateAlignsTheFirstDueDateForLongerCadences() {
	assertEqual(
		suggestRuleStartDate({ id: 'rule_weekly', type: 'weekly', interval: 2, day: 'Monday' }, '2026-04-10'),
		'2026-04-13',
		'biweekly weekly rules should align to the next matching weekday'
	);

	assertEqual(
		suggestRuleStartDate({ id: 'rule_monthly', type: 'monthly', interval: 5, mode: 'day_of_month', day: 22 }, '2026-04-25'),
		'2026-05-22',
		'monthly rules should align to the next matching calendar day'
	);
}

function testSuggestedGenerationWindowMatchesTheLongestRuleCadence() {
	assertEqual(
		suggestGenerationWindowDays([{ id: 'rule_daily', type: 'daily', interval: 1 }]),
		1,
		'daily rules should surface shortly before they are due'
	);

	assertEqual(
		suggestGenerationWindowDays([
			{ id: 'rule_daily', type: 'daily', interval: 1 },
			{ id: 'rule_yearly', type: 'yearly', interval: 1, month: 5, day: 2 }
		]),
		14,
		'mixed cadence templates should use the widest suggested look-ahead'
	);
}

function testChecklistAndSingleActionResolutionStayInsideTheModel() {
	let model = createApp({
		templates: [
			{
				id: 'tpl_checklist',
				title: 'Kitchen reset',
				createdAt: '2026-04-01',
				updatedAt: '2026-04-01',
				recurrence: [{ id: 'rule_daily', type: 'daily', interval: 1 }],
				items: [{ id: 'item_a', label: 'Clear counters' }, { id: 'item_b', label: 'Sweep floor' }],
				generationWindowDays: 7,
			},
			{
				id: 'tpl_single',
				title: 'Air out closet',
				createdAt: '2026-04-01',
				updatedAt: '2026-04-01',
				recurrence: [{ id: 'rule_single', type: 'daily', interval: 1 }],
				items: [],
				generationWindowDays: 7,
			}
		],
		instances: [
			{
				id: 'inst_checklist',
				templateId: 'tpl_checklist',
				dueDate: '2026-04-10',
				items: [
					{ id: 'item_a', label: 'Clear counters', state: 0 },
					{ id: 'item_b', label: 'Sweep floor', state: 0 }
				],
				completedAt: null,
			},
			{
				id: 'inst_single',
				templateId: 'tpl_single',
				dueDate: '2026-04-10',
				items: [],
				completedAt: null,
			},
		],
	});

	assertEqual(model.toggleInstanceItem('inst_checklist', 'item_a'), true, 'toggling a checklist item should succeed');
	assertEqual(model.instances[0].completedAt, null, 'partial completion should not resolve the instance');
	assertEqual(model.toggleInstanceItem('inst_checklist', 'item_b'), true, 'toggling the final item should succeed');
	assert(Boolean(model.instances[0].completedAt), 'completing every checklist item should resolve the instance');
	assertEqual(typeof model.instances[0].completedOn, 'string', 'resolving a checklist instance should stamp the local completion date');
	assert(model.instances[0].items.every(item => item.state === 1), 'resolving a checklist instance should mark every item complete');

	model.syncGeneratedInstances({ todayNumber: day('2026-04-10') });
	assert(Boolean(model.instances[0].completedAt), 'resolved checklist instances should stay resolved after sync');
	assert(model.instances[0].items.every(item => item.state === 1), 'sync should preserve completed checklist item state');

	assertEqual(model.toggleInstanceItem('inst_checklist', 'item_a'), true, 'resolved checklist items should still be toggleable');
	assertEqual(model.instances[0].completedAt, null, 'unchecking a completed item should reopen the instance');
	assertEqual(model.instances[0].completedOn, null, 'reopening a checklist instance should clear the local completion date');

	assertEqual(model.toggleSingleActionInstance('inst_single'), true, 'single action tasks should resolve through the model');
	assert(Boolean(model.instances[1].completedAt), 'single action resolution should stamp completion');
	assertEqual(typeof model.instances[1].completedOn, 'string', 'single action resolution should stamp the local completion date');
	assertEqual(model.toggleSingleActionInstance('inst_single'), true, 'single action tasks should reopen through the same model method');
	assertEqual(model.instances[1].completedAt, null, 'reopening a single action task should clear completion');
	assertEqual(model.instances[1].completedOn, null, 'reopening a single action task should clear the local completion date');
}

function testResolvedInstancesUseLocalCompletionDateForRetention() {
	let model = createApp({
		templates: [
			{
				id: 'tpl_daily',
				title: 'Daily',
				createdAt: '2026-04-01',
				updatedAt: '2026-04-01',
				recurrence: [{ id: 'rule_daily', type: 'daily', interval: 1 }],
				items: [{ id: 'item_a', label: 'A' }],
				generationWindowDays: 7,
			},
		],
		instances: [
			{
				id: 'inst_done',
				templateId: 'tpl_daily',
				dueDate: '2026-04-11',
				items: [{ id: 'item_a', label: 'A', state: 1 }],
				completedAt: '2026-04-10T15:30:00.000Z',
				completedOn: '2026-04-11',
			},
		],
	});

	model.syncGeneratedInstances({ todayNumber: day('2026-04-11') });
	let completed = model.instances.filter(instance => Boolean(instance.completedAt));
	let active = model.instances.filter(instance => !instance.completedAt && instance.dueDate <= '2026-04-11');
	assertEqual(completed.length, 1, `resolved tasks should remain visible through the local completion day\n${describeInstances(model)}`);
	assertEqual(active.length, 0, `sync should not regenerate a fresh unresolved copy on the same local completion day\n${describeInstances(model)}`);

	model.syncGeneratedInstances({ todayNumber: day('2026-04-12') });
	completed = model.instances.filter(instance => Boolean(instance.completedAt));
	active = model.instances.filter(instance => !instance.completedAt && instance.dueDate <= '2026-04-12');
	assertEqual(completed.length, 0, `resolved tasks should expire the day after their local completion day\n${describeInstances(model)}`);
	assertEqual(active.length, 1, `a new daily instance should appear the next day after the resolved copy expires\n${describeInstances(model)}`);
	assertEqual(active[0].dueDate, '2026-04-12', `the regenerated daily instance should use the next due date\n${describeInstances(model)}`);
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
	testDailyRolloverKeepsOnlyTodayAndResetsChecklistProgress,
	testWeeklyCatchUpCreatesOnlyTheLatestMissedOverdueInstance,
	testSameDayCompletedInstanceStaysButExpiresTheNextDay,
	testTemplateCrudUsesModelMethodsAndClearsFutureGeneratedCopiesOnEdit,
	testMonthlyDayOfMonthDescriptionsUseOrdinalDayLabels,
	testSuggestedRuleStartDateAlignsTheFirstDueDateForLongerCadences,
	testSuggestedGenerationWindowMatchesTheLongestRuleCadence,
	testChecklistAndSingleActionResolutionStayInsideTheModel,
	testResolvedInstancesUseLocalCompletionDateForRetention,
]);
