// @ts-check
// node --experimental-default-type=module docs/todo-buy/app.test.js

import {
	VERSION,
	normalizeAppState,
	createApp,
	entryKey,
	isSupportedImportVersion,
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

function testNormalizeAppStateKeepsOnlyCompatibleDataAndBackfillsHistories() {
	let normalized = normalizeAppState({
		version: '0.8',
		themeMode: 'sepia',
		storeHistory: [' Grocery ', '', 'Grocery', 4],
		itemHistory: {
			' Grocery ': [' Milk ', '', 'Milk'],
			' ': ['Ignored'],
		},
		entries: [
			{ store: ' Grocery ', itemName: ' Eggs ', quantity: '2', notes: ' Large ', marked: true },
			{ store: 'Grocery', itemName: 'Eggs', quantity: 1, notes: '', marked: false },
			{ store: '', itemName: 'Bad' },
		],
	});

	assertDeepEqual(normalized, {
		version: VERSION,
		themeMode: 'auto',
		storeHistory: ['Grocery'],
		itemHistory: {
			Grocery: ['Milk', 'Eggs'],
		},
		entries: [
			{ store: 'Grocery', itemName: 'Eggs', quantity: 2, notes: 'Large', marked: true },
		],
	}, 'normalization should sanitize data, dedupe entries, and add missing history records');
}

function testAddOrUpdateEntryMaintainsHistoryAndReplacesExistingEntry() {
	let model = createApp({ storeHistory: [], itemHistory: {}, entries: [] });

	assertEqual(model.addOrUpdateEntry('Grocery', 'Milk', '3', ' Whole '), 'added', 'new entries should be added');
	assertEqual(model.addOrUpdateEntry('Grocery', 'Milk', 1, 'Skim'), 'updated', 'existing entries should be updated in place');

	assertDeepEqual(model.storeHistory, ['Grocery'], 'adding an entry should add the store to history');
	assertDeepEqual(model.itemHistory, { Grocery: ['Milk'] }, 'adding an entry should add the item to history');
	assertDeepEqual(model.entries, [
		{ store: 'Grocery', itemName: 'Milk', quantity: 1, notes: 'Skim', marked: false },
	], 'updating an entry should replace the existing row');
	assertEqual(model.entryExistsExact('Grocery', 'Milk'), true, 'exact entry lookup should work');
	assertEqual(model.entryExistsIgnoreCase('grocery', 'milk'), true, 'case-insensitive entry lookup should work');
}

function testRenameStoreMergesEntriesAndItemHistory() {
	let model = createApp({
		storeHistory: ['Grocery', 'Market'],
		itemHistory: {
			Grocery: ['Milk', 'Eggs'],
			Market: ['Eggs', 'Bread'],
		},
		entries: [
			{ store: 'Grocery', itemName: 'Eggs', quantity: 2, notes: 'Brown', marked: false },
			{ store: 'Market', itemName: 'Eggs', quantity: null, notes: '', marked: true },
			{ store: 'Grocery', itemName: 'Milk', quantity: 1, notes: '', marked: false },
		],
	});

	assertEqual(model.renameStore('Grocery', 'Market'), true, 'renaming a store should report success');
	assertDeepEqual(model.storeHistory, ['Market'], 'store history should collapse into the new store');
	assertDeepEqual(model.itemHistory, { Market: ['Eggs', 'Bread', 'Milk'] }, 'item history should merge and dedupe');
	assertDeepEqual(model.entries, [
		{ store: 'Market', itemName: 'Eggs', quantity: 2, notes: 'Brown', marked: true },
		{ store: 'Market', itemName: 'Milk', quantity: 1, notes: '', marked: false },
	], 'renaming a store should merge duplicate entries by item');
}

function testRenameItemMergesDuplicateItemsWithinAStore() {
	let model = createApp({
		storeHistory: ['Grocery'],
		itemHistory: {
			Grocery: ['Milk', 'Oat Milk', 'Bread'],
		},
		entries: [
			{ store: 'Grocery', itemName: 'Milk', quantity: 1, notes: '', marked: false },
			{ store: 'Grocery', itemName: 'Oat Milk', quantity: null, notes: 'Unsweetened', marked: true },
		],
	});

	assertEqual(model.renameItem('Grocery', 'Oat Milk', 'Milk'), true, 'renaming an item should report success');
	assertDeepEqual(model.itemHistory.Grocery, ['Milk', 'Bread'], 'item history should collapse into the renamed item');
	assertDeepEqual(model.entries, [
		{ store: 'Grocery', itemName: 'Milk', quantity: 1, notes: 'Unsweetened', marked: true },
	], 'renaming an item should merge duplicate entries');
}

function testCompletionAndMarkedCountsWorkPerStoreOrGlobally() {
	let model = createApp({
		storeHistory: ['Grocery', 'Market'],
		itemHistory: { Grocery: ['Milk'], Market: ['Bread', 'Soap'] },
		entries: [
			{ store: 'Grocery', itemName: 'Milk', quantity: 1, notes: '', marked: true },
			{ store: 'Market', itemName: 'Bread', quantity: null, notes: '', marked: true },
			{ store: 'Market', itemName: 'Soap', quantity: null, notes: '', marked: false },
		],
	});

	assertEqual(model.markedItemCount(), 2, 'global marked count should include all stores');
	assertEqual(model.markedItemCount('Market'), 1, 'store marked count should scope by store');
	assertEqual(model.completeMarkedEntries('Market'), 1, 'store completion should remove only matching marked items');
	assertDeepEqual(model.entries, [
		{ store: 'Grocery', itemName: 'Milk', quantity: 1, notes: '', marked: true },
		{ store: 'Market', itemName: 'Soap', quantity: null, notes: '', marked: false },
	], 'store completion should leave unrelated stores untouched');
	assertEqual(model.completeMarkedEntries(), 1, 'global completion should remove remaining marked items');
	assertDeepEqual(model.entries, [
		{ store: 'Market', itemName: 'Soap', quantity: null, notes: '', marked: false },
	], 'global completion should remove all marked items');
}

function testReorderStoreEntryMovesOnlyEntriesWithinThatStore() {
	let model = createApp({
		storeHistory: ['Grocery', 'Market'],
		itemHistory: { Grocery: ['Milk', 'Eggs', 'Bread'], Market: ['Soap'] },
		entries: [
			{ store: 'Grocery', itemName: 'Milk', quantity: null, notes: '', marked: false },
			{ store: 'Market', itemName: 'Soap', quantity: null, notes: '', marked: false },
			{ store: 'Grocery', itemName: 'Eggs', quantity: null, notes: '', marked: false },
			{ store: 'Grocery', itemName: 'Bread', quantity: null, notes: '', marked: false },
		],
	});

	let moved = model.reorderStoreEntry('Grocery', entryKey(model.entries[0]), 3);
	assertEqual(moved, true, 'reordering should succeed when the target index changes');
	assertDeepEqual(model.entries.map((entry) => `${entry.store}:${entry.itemName}`), [
		'Grocery:Eggs',
		'Market:Soap',
		'Grocery:Bread',
		'Grocery:Milk',
	], 'reordering should affect only the entries within the target store');
}

function testDeleteHistoryAndImportVersionValidationStayConsistent() {
	let model = createApp({
		storeHistory: ['Grocery'],
		itemHistory: { Grocery: ['Milk', 'Bread'] },
		entries: [{ store: 'Grocery', itemName: 'Milk', quantity: null, notes: '', marked: false }],
	});

	assertEqual(model.deleteItemHistory('Grocery', 'Milk'), false, 'items still present in entries cannot be removed from history');
	assertEqual(model.deleteItemHistory('Grocery', 'Bread'), true, 'unused items can be removed from history');
	assertEqual(model.deleteStoreHistory('Grocery'), false, 'stores with active entries cannot be removed from history');
	assertEqual(isSupportedImportVersion(VERSION), true, 'current app version should be import-compatible');
	assertEqual(isSupportedImportVersion('0.9'), false, 'older versions should be rejected');
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

	console.log(`\n${testFunctions.length} tests passed.`);
}

runTests([
	testNormalizeAppStateKeepsOnlyCompatibleDataAndBackfillsHistories,
	testAddOrUpdateEntryMaintainsHistoryAndReplacesExistingEntry,
	testRenameStoreMergesEntriesAndItemHistory,
	testRenameItemMergesDuplicateItemsWithinAStore,
	testCompletionAndMarkedCountsWorkPerStoreOrGlobally,
	testReorderStoreEntryMovesOnlyEntriesWithinThatStore,
	testDeleteHistoryAndImportVersionValidationStayConsistent,
]);
