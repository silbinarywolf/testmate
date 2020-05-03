import webpack from 'webpack';
import path from 'path';

import { preprocessor } from '@testmate/preprocessor';

interface Config {
	webpackOptions: {[key: string]: any}
}

// TODO(Jae): 2020-04-24
// See if I can find a typing for the Webpack config structure from the official package
// rather than using key-value
interface WebpackConfig {
	[key: string]: any
	entry: string | {[entry: string]: string};
}

function cleanseError(err: string): string {
	return err.replace(/\n\s*at.*/g, '').replace(/From previous event:\n?/g, '')
}

export function preprocess(options: preprocessor.Options, webpackConfig: WebpackConfig): void {
	// Validate options
	{
		if (!options.testFiles ||
			options.testFiles.length === 0) {
			throw new Error("options provided is missing \"testFiles\" information. Was this parameter properly passed through in your preprocessor callback?");
		}
	}

	// Validate webpackConfig
	{
		if (webpackConfig === undefined) {
			throw new Error("webpackConfig not provided");
		}
		if (!webpackConfig.entry) {
			throw new Error("Webpack config provided is missing \"entry\" property.");
		}
		if (!webpackConfig.output) {
			throw new Error("Webpack config provided is missing \"output\" property.");
		}
		if (!webpackConfig.output.path) {
			throw new Error("Webpack config provided is missing \"output.path\" property.");
		}
	}

	// Remove test files if they were found in same folder as dist
	{
		const outputPath = webpackConfig.output.path;
		for (let i = 0; i < options.testFiles.length; i++) {
		   	const testFile = options.testFiles[i];
		   	if (testFile.indexOf(outputPath) !== -1) {
		   		options.testFiles.splice(i, 1);
		   		i--;
		   	}
		}
	}

	//console.log("Old Entries: ", webpackConfig.entry);

	// Modify Webpack config to build test files as entry points
	let entry: {[entry: string]: string} = {};
	let testKeyToFilename: {[entry: string]: string} = {};
	// NOTE(Jae): 2020-05-02
	// Keep existing Webpack entries in-tact. We do this so that frameworks that
	// have special plugin functionality, like Aurelia, will just work out of the box.
	/*switch (typeof webpackConfig.entry) {
	case 'object':
		for (let key in webpackConfig.entry) {
			if (!webpackConfig.entry.hasOwnProperty(key)) {
				continue;
			}
			entry[key] = webpackConfig.entry[key];
		}
		break;
	case 'string':
		entry[webpackConfig.entry] = webpackConfig.entry;
		break;
	}*/
	for (let testFile of options.testFiles) {
		// TODO(Jae): 2020-05-02
		// Consider improving testmate API to give you testFiles with a guaranteed
		// unique ID to use for the chunk name. This could be used to avoid clashes with
		// other names.
		const testFileKey = path.basename(testFile);
		if (entry[testFileKey] !== undefined) {
			throw new Error("Unexpected error. Duplicate test key: "+testFileKey+"\n");
		}
		entry[testFileKey] = testFile;
		testKeyToFilename[testFileKey] = testFile;
	}
	webpackConfig.entry = entry;

	//console.log("New Entries: ", webpackConfig.entry);

	// TODO(Jae): 2020-04-25
	// - Maybe make this build to a temp directory?
	//   should come from "preprocessor.Options"
	//webpackConfig.output.path = 'C:/tmp';
	webpackConfig.output.filename = "[name].testmate.js";

	// Create handle for build
	const handle = (err: Error, stats: webpack.Stats) => {
		if (err) {
			return options.onCompile(err);
		}
		const jsonStats = stats.toJson()
		if (stats.hasErrors()) {
			let errorsToAppend = '';
			for (let error of jsonStats.errors) {
				errorsToAppend += error.replace(/\n\s*at.*/g, '').replace(/From previous event:\n?/g, '') + '\n\n';
			}
			options.onCompile(new Error('Webpack Compilation Error\n'+errorsToAppend));
			return;
		}

		// these stats are really only useful for debugging
		if (jsonStats.warnings.length > 0) {
			//console.warn(`warnings for ${outputPath}`)
			console.warn('webpack warnings:', jsonStats.warnings)
		}

		console.log('entry', testKeyToFilename);
		console.log('entrypoints', jsonStats.entrypoints);

		// Determine what files were created as a result of building
		// each test
		let testFileOutput: preprocessor.TestOutput[] = [];
		const entrypoints = typeof jsonStats.entrypoints === 'object' ? jsonStats.entrypoints : {};
		for (const entry in testKeyToFilename) {
			if (!testKeyToFilename.hasOwnProperty(entry)) {
				continue;
			}
			// NOTE(Jae): 2020-05-02
			// We need to use the entry obejct list we built up before to get the full filepath as
			// plugins can modify the jsonStats.entry
			const pathname = testKeyToFilename[entry];
			if (pathname === undefined) {
				options.onCompile(new Error('Unexpected error. Expected webpackConfig to have "entry" for: '+ entry));
				return;
			}
			let assetList: string[] = [];
			const entryPoint = entrypoints[entry];
			if (entryPoint === undefined) {
				options.onCompile(new Error('Unexpected error. Expected webpackConfig to have "entry" for: '+ entry));
				return;
			}
			for (const asset of entryPoint.assets) {
				assetList.push(path.join(webpackConfig.output.path, asset));
			}
			testFileOutput.push({
				inFile: pathname,
				assets: assetList,
			})
		}

		console.log('testFileOutput', testFileOutput);

		// MAYBETODO(Jae):
		// pass in "testFileOutput" incase more / less files
		// are put in, so the test runner can update what files it can serve.
		options.onCompile({
			testFileOutput: testFileOutput
		});
	}

	const compiler = webpack(webpackConfig);
	if (!options.isWatchMode) {
		compiler.run(handle);
	} else {
		compiler.watch({}, handle)
	}
}
