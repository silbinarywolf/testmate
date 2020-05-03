export namespace preprocessor {
	export type PreprocessorCallback = (options: Options) => void;

	export type OnCompileCallback = (result: CompileOutput | Error) => void;

	export interface Options {
		testFiles: string[]
		onCompile: OnCompileCallback;
		isWatchMode: boolean
	}

	export interface TestOutput {
		// inFile is the filepath of the uncompiled/preprocessed test file
		inFile: string;
		// outFile is the filepath of compiled test file
		// outFile: string;
		// assets are the JS/CSS/etc files that got compiled for the test.
		// These should be ordered in a way so the files are loaded correctly.
		assets: string[];
	}

	export interface CompileOutput {
		testFileOutput: TestOutput[];
	}
}
