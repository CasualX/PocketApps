// @ts-check
// node --experimental-default-type=module docs/start-to-run-pal/app.test.js

import {
	SPORTIVA_0_TO_5K_PRESET,
	VERSION,
	createApp,
	createEditablePreset,
	formatClock,
	formatDuration,
	getTrainingTimelineFrame,
	normalizeAppState,
	totalTrainingSeconds,
	validateTrainingDraft,
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

function testNormalizeAppStateRestoresUsableTrainingData() {
	let normalized = normalizeAppState({
		version: 'old',
		themeMode: 'sepia',
		trainings: [
			{ name: '  ', intervals: [{ name: '', time: 'bad', color: 'nope' }] },
			{ name: 'Valid day', intervals: [] },
		],
	});

	assertEqual(normalized.version, VERSION, 'normalization should pin the current version');
	assertEqual(normalized.themeMode, 'auto', 'invalid theme modes should fall back to auto');
	assertEqual(normalized.trainings.length, 2, 'valid trainings should be kept');
	assertEqual(normalized.trainings[0].name, '', 'blank training names should be preserved in normalized drafts');
	assertEqual(normalized.trainings[0].intervals[0].time, 60, 'invalid interval times should use the default fallback');
	assert(/^#/.test(normalized.trainings[0].intervals[0].color), 'invalid interval colors should be normalized to a palette value');
	assertEqual(normalized.trainings[1].intervals.length, 0, 'empty interval arrays should remain empty');
}

function testModelCrudUpdatesEditableTrainings() {
	let model = createApp({
		themeMode: 'light',
		trainings: [
			{ name: 'Week 1 - Monday', intervals: [{ name: 'Walk', time: 60, color: '#4c7a67' }] },
		],
	});

	assertEqual(model.addTraining()?.intervals.length, 0, 'addTraining should append an empty training draft');
	assertEqual(model.addInterval(0)?.name, 'Interval 2', 'addInterval should create a sensible fallback interval');
	assertEqual(model.duplicateInterval(0, 0)?.name, 'Walk', 'duplicateInterval should copy the selected interval');

	model.updateTraining(0, { name: 'Week 2 - Tuesday' });
	model.updateInterval(0, 0, { time: 95, name: 'Warm walk' });
	model.removeInterval(0, 1);

	assertEqual(model.trainings[0].name, 'Week 2 - Tuesday', 'updateTraining should replace training fields');
	assertEqual(model.trainings[0].intervals[0].time, 95, 'updateInterval should replace interval fields');
	assertEqual(model.trainings[0].intervals.at(-1)?.name, 'Walk', 'duplicateInterval should append the copy at the end of the training');
	assert(model.trainings[0].intervals.length >= 1, 'removeInterval should keep remaining intervals intact');
	assertEqual(model.removeTraining(1), true, 'removeTraining should remove an existing training');
	assertEqual(model.toJSON().trainings.length, 1, 'toJSON should preserve the direct trainings shape');
}

function testRuntimePresetsStayOutOfPersistedUserData() {
	let model = createApp();
	let editablePreset = createEditablePreset([{ name: 'Tempo', intervals: [{ name: 'Run', time: 300, color: '#d77447' }] }]);

	assertEqual(model.trainings.length, 0, 'default app state should start without embedded library trainings');
	assertEqual(model.toJSON().trainings.length, 0, 'persisted app state should only include editable user trainings');
	assertEqual(editablePreset.title, 'My Trainings', 'editable preset helpers should label the runtime editable bucket consistently');
	assertEqual(editablePreset.isEditable, true, 'editable preset helpers should mark the runtime bucket editable');
	assertEqual(SPORTIVA_0_TO_5K_PRESET.isEditable, false, 'the exported Sportiva runtime preset should stay read-only');
	assert(SPORTIVA_0_TO_5K_PRESET.trainings.length > 0, 'the Sportiva runtime preset should still expose bundled trainings');
}

function testDurationHelpersStayHumanReadable() {
	assertEqual(formatDuration(45), '45 sec', 'sub-minute durations should use the spelled-out second label');
	assertEqual(formatDuration(120), '2 min', 'whole-minute durations should use the short minute label');
	assertEqual(formatDuration(135), '2m 15s', 'mixed durations should include minutes and seconds');
	assertEqual(formatClock(9), '00:09', 'clock formatting should zero-pad short durations');
	assertEqual(formatClock(135), '02:15', 'clock formatting should render minutes and seconds');
	assertEqual(totalTrainingSeconds({ name: 'A', intervals: [{ name: 'Walk', time: 60, color: '#000000' }, { name: 'Run', time: 45, color: '#ffffff' }] }), 105, 'training totals should sum interval seconds');
}

function testTrainingTimelineFramesHandleBoundariesAndCompletion() {
	let training = {
		name: 'Intervals',
		intervals: [
			{ name: 'Warmup', time: 30, color: '#4c7a67' },
			{ name: 'Run', time: 45, color: '#d77447' },
		],
	};

	let openingFrame = getTrainingTimelineFrame(training, 0);
	let boundaryFrame = getTrainingTimelineFrame(training, 30000);
	let lateFrame = getTrainingTimelineFrame(training, 74999);
	let completedFrame = getTrainingTimelineFrame(training, 75000);

	assertEqual(openingFrame?.intervalIndex, 0, 'the timeline should begin on the first interval');
	assertEqual(openingFrame?.remainingSeconds, 30, 'the opening frame should expose the full first interval duration');
	assertEqual(boundaryFrame?.intervalIndex, 1, 'exact interval boundaries should advance to the next interval');
	assertEqual(boundaryFrame?.remainingSeconds, 45, 'the next interval should begin with its full remaining time');
	assertEqual(lateFrame?.remainingSeconds, 1, 'partial elapsed frames should round remaining time up for display');
	assertEqual(completedFrame?.completed, true, 'elapsed time at the total duration should mark the runner complete');
	assertEqual(completedFrame?.totalRemainingSeconds, 0, 'completed frames should report no remaining total time');
	assertEqual(getTrainingTimelineFrame({ name: 'Empty', intervals: [] }, 0), null, 'trainings without intervals should not produce a runner frame');
}

function testTrainingDraftValidationRequiresNameAndIntervals() {
	assertEqual(validateTrainingDraft({ name: '', intervals: [] }), 'Add a training name and at least one interval before saving.', 'blank drafts should require both a name and at least one interval');
	assertEqual(validateTrainingDraft({ name: 'Recovery', intervals: [] }), 'Add at least one interval before saving.', 'drafts without intervals should be rejected');
	assertEqual(validateTrainingDraft({ name: '   ', intervals: [{ name: 'Walk', time: 60, color: '#4c7a67' }] }), 'Add a training name before saving.', 'blank names should be rejected even when intervals exist');
	assertEqual(validateTrainingDraft({ name: 'Recovery', intervals: [{ name: 'Walk', time: 60, color: '#4c7a67' }] }), null, 'complete drafts should pass validation');
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
	testNormalizeAppStateRestoresUsableTrainingData,
	testModelCrudUpdatesEditableTrainings,
	testRuntimePresetsStayOutOfPersistedUserData,
	testDurationHelpersStayHumanReadable,
	testTrainingTimelineFramesHandleBoundariesAndCompletion,
	testTrainingDraftValidationRequiresNameAndIntervals,
]);
