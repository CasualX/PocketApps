const fs = require('fs');
const vm = require('vm');

const APP_PATH = `${__dirname}/index.js`;
const APP_CODE = fs.readFileSync(APP_PATH, 'utf8');

function loadContext(todayIsoDate) {
	let context = {
		console,
		window: {
			location: { hash: '' },
			crypto: { randomUUID: () => 'test-uuid' },
			matchMedia() {
				return {
					matches: false,
					addEventListener() {},
					addListener() {}
				};
			}
		},
		document: {
			head: { appendChild() {} },
			querySelector() { return null; },
			createElement() {
				return {
					setAttribute() {},
					remove() {},
					click() {}
				};
			},
			body: { appendChild() {} },
			documentElement: { setAttribute() {} }
		},
		localStorage: {
			getItem() { return null; },
			setItem() {},
			removeItem() {}
		},
		alert() {},
		confirm() { return true; },
		Blob: function Blob() {},
		URL: {
			createObjectURL() { return 'blob:test'; },
			revokeObjectURL() {}
		},
		setTimeout,
		clearTimeout,
		Date,
		Math,
		JSON,
		Object,
		Array,
		String,
		Number,
		RegExp,
		parseInt,
		parseFloat,
		Boolean,
		Map,
		Set
	};

	vm.createContext(context);
	vm.runInContext(APP_CODE, context);

	let fixedDayNumber = context.isoDateToDayNumber(todayIsoDate);
	context.todayDayNumber = () => fixedDayNumber;
	context.todayIsoDate = () => todayIsoDate;

	return context;
}

function createTemplate(base) {
	return {
		generationWindowDays: 7,
		updatedAt: base.createdAt,
		items: [],
		recurrence: [],
		...base
	};
}

function createData(templates, instances, lastOpenedDate) {
	return {
		version: '1.0',
		lastOpenedDate,
		themeMode: 'auto',
		templates,
		instances
	};
}

function describeInstances(instances) {
	return JSON.stringify(instances.map(instance => ({
		templateId: instance.templateId,
		dueDate: instance.dueDate,
		completedAt: instance.completedAt,
		states: instance.items.map(item => item.state)
	})), null, 2);
}

let failures = 0;

function assert(name, condition, details) {
	if (condition) {
		console.log(`PASS ${name}`);
		return;
	}

	failures += 1;
	console.error(`FAIL ${name}`);
	if (details) {
		console.error(details);
	}
}

function runTest(name, callback) {
	try {
		callback();
	}
	catch (error) {
		failures += 1;
		console.error(`FAIL ${name}`);
		console.error(error && error.stack ? error.stack : error);
	}
}

runTest('daily rollover keeps only today and resets checklist progress', () => {
	let context = loadContext('2026-04-09');
	let data = createData([
		createTemplate({
			id: 'tpl_daily',
			title: 'Daily',
			createdAt: '2026-04-07',
			recurrence: [{ id: 'rule_daily', type: 'daily', interval: 1 }],
			items: [{ id: 'item_a', label: 'A' }, { id: 'item_b', label: 'B' }]
		})
	], [
		{
			id: 'inst_yesterday',
			templateId: 'tpl_daily',
			dueDate: '2026-04-08',
			items: [
				{ id: 'item_a', label: 'A', state: 1 },
				{ id: 'item_b', label: 'B', state: 0 }
			],
			completedAt: null
		}
	], '2026-04-08');

	context.syncGeneratedInstances(data);

	let active = data.instances.filter(instance => !instance.completedAt && instance.dueDate <= '2026-04-09');
	assert('daily rollover keeps exactly one active item', active.length === 1, describeInstances(data.instances));
	assert('daily rollover active due date is today', active[0] && active[0].dueDate === '2026-04-09', describeInstances(data.instances));
	assert('daily rollover checklist is reset', active[0] && active[0].items.every(item => item.state === 0), describeInstances(data.instances));
});

runTest('weekly catch-up creates only the latest missed overdue instance', () => {
	let context = loadContext('2026-04-09');
	let data = createData([
		createTemplate({
			id: 'tpl_weekly',
			title: 'Weekly Monday',
			createdAt: '2026-03-02',
			recurrence: [{ id: 'rule_weekly', type: 'weekly', interval: 1, day: 'Monday' }]
		})
	], [], '2026-03-09');

	context.syncGeneratedInstances(data);

	let active = data.instances.filter(instance => !instance.completedAt && instance.dueDate <= '2026-04-09');
	assert('weekly catch-up keeps one overdue active instance', active.length === 1, describeInstances(data.instances));
	assert('weekly catch-up uses the latest missed Monday', active[0] && active[0].dueDate === '2026-04-06', describeInstances(data.instances));
});

runTest('today match replaces older unresolved overdue copy', () => {
	let context = loadContext('2026-04-06');
	let data = createData([
		createTemplate({
			id: 'tpl_weekly',
			title: 'Weekly Monday',
			createdAt: '2026-03-02',
			recurrence: [{ id: 'rule_weekly', type: 'weekly', interval: 1, day: 'Monday' }]
		})
	], [
		{
			id: 'inst_old',
			templateId: 'tpl_weekly',
			dueDate: '2026-03-30',
			items: [],
			completedAt: null
		}
	], '2026-04-06');

	context.syncGeneratedInstances(data);

	let active = data.instances.filter(instance => !instance.completedAt && instance.dueDate <= '2026-04-06');
	assert('today match leaves only one active instance', active.length === 1, describeInstances(data.instances));
	assert('today match uses today due date', active[0] && active[0].dueDate === '2026-04-06', describeInstances(data.instances));
});

runTest('same-day completed instance remains and does not respawn for the same due date', () => {
	let context = loadContext('2026-04-09');
	let data = createData([
		createTemplate({
			id: 'tpl_done',
			title: 'Done',
			createdAt: '2026-04-01',
			recurrence: [{ id: 'rule_daily', type: 'daily', interval: 1 }]
		})
	], [
		{
			id: 'inst_done',
			templateId: 'tpl_done',
			dueDate: '2026-04-09',
			items: [],
			completedAt: '2026-04-09T20:15:00.000Z'
		}
	], '2026-04-09');

	context.syncGeneratedInstances(data);

	let todayEntries = data.instances.filter(instance => instance.dueDate === '2026-04-09');
	assert('same-day completion keeps only the completed instance for today', todayEntries.length === 1 && Boolean(todayEntries[0].completedAt), describeInstances(data.instances));
});

runTest('completed instances are removed the next day', () => {
	let context = loadContext('2026-04-10');
	let data = createData([
		createTemplate({
			id: 'tpl_done',
			title: 'Done',
			createdAt: '2026-04-01',
			recurrence: [{ id: 'rule_daily', type: 'daily', interval: 1 }]
		})
	], [
		{
			id: 'inst_done',
			templateId: 'tpl_done',
			dueDate: '2026-04-09',
			items: [],
			completedAt: '2026-04-09T20:15:00.000Z'
		}
	], '2026-04-09');

	context.syncGeneratedInstances(data);

	let completed = data.instances.filter(instance => Boolean(instance.completedAt));
	let active = data.instances.filter(instance => !instance.completedAt && instance.dueDate <= '2026-04-10');
	assert('next-day cleanup removes completed copy', completed.length === 0, describeInstances(data.instances));
	assert('next-day cleanup generates current due instance', active.length === 1 && active[0].dueDate === '2026-04-10', describeInstances(data.instances));
});

runTest('future generation still respects the forward window', () => {
	let context = loadContext('2026-04-09');
	let data = createData([
		createTemplate({
			id: 'tpl_future',
			title: 'Every other day',
			createdAt: '2026-04-07',
			generationWindowDays: 3,
			recurrence: [{ id: 'rule_future', type: 'daily', interval: 2 }]
		})
	], [], '2026-04-09');

	context.syncGeneratedInstances(data);

	let dueDates = data.instances.filter(instance => !instance.completedAt).map(instance => instance.dueDate);
	assert('forward generation includes today when due', dueDates.includes('2026-04-09'), describeInstances(data.instances));
	assert('forward generation includes matching due date inside window', dueDates.includes('2026-04-11'), describeInstances(data.instances));
	assert('forward generation excludes matching due date outside window', !dueDates.includes('2026-04-13'), describeInstances(data.instances));
});

if (failures > 0) {
	console.error(`\n${failures} test${failures === 1 ? '' : 's'} failed`);
	process.exit(1);
}

console.log('\nAll tests passed');
