import path from 'path';

import type { preprocessor } from '@testmate/preprocessor';

declare global {
    interface Window { 
    	testMateCurrentTheme: theme.Options | undefined; 
    }
}

export namespace theme {
	export interface Options {
		onHomePage(route: RouteSettings): void;
		onTest(route: TestSettings): void;
	}

	export interface RouteSettings {
		testCases: preprocessor.TestOutput[];
	}

	export interface TestSettings {
		inFile: string;
		tests: Test[];
	}

	export type TestState = 'waiting' | 'pass' | 'fail' | 'error' | 'skip';

	export interface Test {
		name: string;
		state: TestState;
	}

	export function register(theme: Options) {
		if (window.testMateCurrentTheme !== undefined) {
			throw new Error("Cannot call register() more than once. You can only have one theme active at a time.");
		}
		window.testMateCurrentTheme = theme;
	}
}
