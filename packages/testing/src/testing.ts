import webpack from 'webpack';
import path from 'path';

import type { preprocessor } from '@testmate/preprocessor';

declare global {
    interface Window { 
    	testMateFile: testing.TestFile | undefined; 
    }
}

export namespace testing {

interface Log {
	type: 'log' | 'error';
	args: any[];
}

// TestResult is the object sent to the server once the test finishes executing
export interface TestResult {
	name: string;
	hasRun: boolean;
	hasFailed: boolean;
	hasExceptionalError: boolean;
	isSkipped: boolean;
	logList: Log[];
}

export interface TestFile {
	tests: Test[];
	run: (test: Test) => void;
}

export interface Test {
	name: string;
	func: () => void | Promise<void>;
	isTestOnly: boolean;
	resultData: TestResult;
}

type TestCallback = ((done?: (() => void)) => void | Promise<void>);

// Globals
let currentTest: Test | undefined;
let beforeEachCallback: (() => void | Promise<void>) | undefined;

const testMateFile = (function(): TestFile {
	const self: TestFile = {
		// NOTE(Jae): 2020-04-26
		// "tests" list is build from calls to "testing.test('my test', () => {})".
		tests: [],
		run: run,
	};
	async function beforeEach(test: Test) {
	}
	// run is executed by the @testmate/runtime package by accessing
	// "window.testMateFile.run()" via the iframe this code runs in.
	async function run(test: Test) {
		let hasMatch: boolean = false;
		for (let otherTest of self.tests) {
			hasMatch = hasMatch || (test === otherTest);
		}
		if (hasMatch === false) {
			throw new Error("Unable to find test: " + test.name);
		}
		currentTest = test;

		// Clear DOM
		// NOTE(Jae): 2020-05-03
		// We might want to make this take a snapshot of the document.body
		// before the first test runs. This is so we can reset to a "default template"
		// used across all our tests, which might be useful for monolithic projects still
		// relying on certain DOM elements to be at the top-level.
		while (document.body.lastElementChild) {
			document.body.removeChild(document.body.lastElementChild);
		}

		// Run test function
		let r;
		try {
			if (beforeEachCallback !== undefined) {
				await runMaybeAsync(beforeEachCallback);
			}
			await runMaybeAsync(test.func);
		} catch (e) {
			console.error('error:', e, ' from test:', test.name);

			test.resultData.hasRun = true;
			test.resultData.hasExceptionalError = true;

			// Add error to test logs
			error(e);

			return;
		}

		// Handle results
		test.resultData.hasRun = true;
		if (test.resultData.hasFailed) {
			console.error('Test failed: ' + test.name);
		} else {
			console.log('Finished test: ' + test.name)
		}
	}
	return self;
})();
window.testMateFile = testMateFile;

async function runMaybeAsync(callback: ((done?: (() => void)) => void | Promise<void>)): Promise<void> {
	switch (callback.length) {
		case 0: {
			const p = callback();
			if (p instanceof Promise) {
				await p;
			}
			return;
		}
		case 1: {
			// NOTE(Jae): 2020-05-02
			// Support "done" parameter just like Jest tests.
			let done: () => void = () => {
				throw new Error("Unexpected error. \"done\" used before assignment error. This should not happen.");
			};
			const donePromise = new Promise((resolve, reject) => {
				done = (): void => {
					resolve();
				};
			});
			const p = callback(done);
			if (p instanceof Promise) {
				await p;
			}
			// Wait for "done()" to be called
			await donePromise;
			return;
		}

		default:
			throw new Error("Did not expect testing method to have more than 1 argument. Only a \"done\" function callback is supported");
	}
}

function isFunction(obj: any): boolean {
	return !!(obj && obj.constructor && obj.call && obj.apply);
}

export function beforeEach(func: TestCallback): void {
	if (beforeEachCallback !== undefined) {
		throw new Error("Cannot have multiple beforeEach() calls in a test.");
	}
	if (!isFunction(func)) {
		throw new Error("beforeEach must be given a function callback.");
	}
	// NOTE(Jae): 2020-05-02
	// Might want to support a list of beforeEach callbacks
	beforeEachCallback = func;
}

function test_internal(name: string, func: TestCallback, isTestOnly: boolean): void {
	if (!isFunction(func)) {
		throw new Error("test must be given a function callback.");
	}
	const test: Test = {
		name: name,
		func: func,
		isTestOnly: isTestOnly,
		resultData: {
			name: name,
			hasFailed: false,
			hasRun: false,
			hasExceptionalError: false,
			isSkipped: false,
			logList: [],
		},
	};
	testMateFile.tests.push(test);
}

// test adds a test to the list of functions to execute
export function test(name: string, func: TestCallback): void {
	test_internal(name, func, false);
}

// testOnly adds a test to the list of functions to execute
export function testOnly(name: string, func: TestCallback): void {
	test_internal(name, func, true);
}

// log records text in the error log. For tests, the text will be printed only if the test fails or the -v flag is set
export function log<T>(...args: any[]): void {
	if (currentTest === undefined) {
		throw new Error("Unexpected error. \"log\" called outside of test context");
	}
	let error: Log = {
		type: 'log',
		args: args,
	}
	currentTest.resultData.logList.push(error);
	console.log(...args, 'from test:', currentTest.name);
}

// skip marks the function as being skipped but continues execution.
export function skip(): void {
	if (currentTest === undefined) {
		throw new Error("Unexpected error. \"skip\" called outside of test context");
	}
	currentTest.resultData.isSkipped = true;
}

// fail marks the function as having failed but continues execution.
export function fail(): void {
	if (currentTest === undefined) {
		throw new Error("Unexpected error. \"fail\" called outside of test context");
	}
	currentTest.resultData.hasFailed = true;
}

// error is equivalent to log followed by fail.
export function error<T>(...args: any[]): void {
	if (currentTest === undefined) {
		throw new Error("Unexpected error. \"error\" called outside of test context");
	}
	let error: Log = {
		type: 'error',
		args: args,
	}
	currentTest.resultData.logList.push(error);
	fail();
	console.error(...args, 'from test:', currentTest.name);
}

export function expect<T>(given: T, expected: T): void {
	if (currentTest === undefined) {
		throw new Error("Unexpected error. \"expect\" called outside of test context");
	}
	if (typeof expected !== typeof given) {
		throw new Error("Cannot call expect() and compare two different types.");
	}
	const isEqual = expected === given;
	if (isEqual) {
		// do nothing
		return;
	}
	log("expected", expected, "but given", given);
}

}
