import * as ChromeLauncher from 'chrome-launcher';
import http from 'http';
import fs from 'fs';
import url from 'url';
import path from 'path';
import WebSocket from 'ws';
import { preprocessor } from '@testmate/preprocessor';
import type { testing } from '@testmate/testing';

import { DefaultTemplateHTML } from './template';
import { getSession } from './session';
import { CommandFlags, getArguments } from './command-arguments';

const runtimePath = require.resolve('@testmate/runtime');

const globalState: GlobalState = {
	runtimeJS: '',
	isWatchMode: false,
	hasCompiledOnce: false,
	lastCompileError: undefined,
	currentTheme: undefined,
	testFileOutput: [],

	server: undefined,
	websocketServer: undefined,
	browser: undefined,
}

interface GlobalState {
	runtimeJS: string;
	isWatchMode: boolean;
	hasCompiledOnce: boolean;
	lastCompileError: Error | undefined;
	currentTheme: ThemeConfig | undefined;
	testFileOutput: preprocessor.TestOutput[];

	server: http.Server | undefined;
	websocketServer: WebSocket.Server | undefined;
	browser: {kill:() => void} | undefined;
}

export class ConfigNotFoundError extends Error {
}

const enum ExitCode {
	Success = 0,
	FailedTest = 1,
	SignalTerminated = 2,
}

// Config is the normalized configuration based on default values and user configuration.
interface Config {
	version: string;
	testRegex: RegExp;
	// theme is a reference to a module provided by "require.resolve"
	theme: ThemeConfig;
	// fileExtensions expects an array of strings, such as "js", "ts", etc.
	// If not set, this will default to ["js", "jsx", "ts", "tsx"]
	fileExtensions: string[];
	preprocessor: preprocessor.PreprocessorCallback | undefined;
}

interface ThemeConfig {
	// script is the pathname of the script to load
	script: string;
	// style is the pathname of the style to load
	style: string
}

interface FileWalkerOptions {
	testRegex: RegExp;
	ignoreDirectories: string[];
}

type RequestFn = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/**
 * @throws ConfigNotFoundError | Error
 */
async function loadAndValidateConfig(): Promise<Config> {
	let pathname = path.resolve(cwd(), 'testmate.config.js');
	let rawConfig: {[key: string]: any} | undefined = undefined;
	try {
		rawConfig = await require(pathname);
	} catch (e) {
		if (String(e).indexOf('Cannot find module') !== -1) {
			throw new ConfigNotFoundError('Unable to open file: ' + pathname);
		}
		throw e;
	}
	if (typeof rawConfig !== 'object') {
		throw new Error("Invalid configuration file. Not an object.")
	}
	// Validate test match
	{
		if (rawConfig.testRegex !== undefined &&
			!(rawConfig.testRegex instanceof RegExp)) {
			throw new Error("\"testRegex\" must be a RegExp.");
		}
	}
	// Validate file extensions
	{
		if (typeof rawConfig.fileExtensions !== 'undefined' &&
			!Array.isArray(rawConfig.fileExtensions)) {
			throw new Error("\"fileExtensions\" must be an array. (or undefined to use defaults)");
		}
		if (rawConfig.fileExtensions &&
			rawConfig.fileExtensions.length === 0) {
			throw new Error("\"fileExtensions\" cannot be an empty array.");
		}
		if (rawConfig.fileExtensions &&
			rawConfig.fileExtensions.length > 0) {
			for (let fileExtension of rawConfig.fileExtensions) {
				if (fileExtension && fileExtension[0] === ".") {
					throw new Error("\"fileExtensions\" must be an array of file extensions without the . preceding. ie. ['js', 'jsx']");
				}
				if (fileExtension && fileExtension[0] === "*") {
					throw new Error("\"fileExtensions\" must be an array of file extensions without the * preceding. ie. ['js', 'jsx']");
				}
			}
		}
	}
	let preprocessor;
	if (rawConfig.preprocessor !== undefined) {
		preprocessor = rawConfig.preprocessor;
	} else {
		// TODO(Jae): 2020-04-30
		// Make super simple default preprocessor for handling just regular
		// JS files.
		preprocessor = undefined;
	}
	let testRegex = /.test.tsx?/;
	if (rawConfig.testRegex !== undefined) {
		testRegex = rawConfig.testRegex;
	}
	let fileExtensions: string[];
	if (rawConfig.fileExtensions !== undefined) {
		fileExtensions = rawConfig.fileExtensions;
	} else {
		fileExtensions = ['js', 'jsx', 'ts', 'tsx'];
	}
	let theme: ThemeConfig;
	if (rawConfig.theme !== undefined) {
		//theme = rawConfig.theme;
		throw new Error('"theme" property is not supported yet.');
	} else {
		const scriptPathname = require.resolve('@testmate/default-theme');
		theme = {
			script: require.resolve('@testmate/default-theme'),
			// TODO(Jae): 2020-04-30
			// We need to update this logic to read the "style" attribute from
			// the package.json rather than this semi-hardcoded approach.
			// This is technically not standard yet: https://stackoverflow.com/questions/32037150/style-field-in-package-json
			style: path.normalize(path.dirname(scriptPathname)+'/main.css'),
		};
	}
	const config: Config = {
		version: '1.0.0',
		preprocessor: preprocessor,
		testRegex: testRegex,
		theme: theme,
		fileExtensions: fileExtensions,
	};
	return config;
}

/**
 * Explores recursively a directory and returns all the filepaths and folderpaths in the callback.
 * 
 * @see http://stackoverflow.com/a/5827895/4241030
 * @param {String} dir 
 * @param {Function} done 
 */
function filewalker(dir: string, done: (err: Error | undefined, results: string[]) => void, options: FileWalkerOptions): void {
	let results: string[] = [];
	let list: string[];
	try {
		list = fs.readdirSync(dir)
	} catch (err) {
		return done(undefined, results)
	}

	let pending = list.length
	if (!pending) {
		return done(undefined, results)
	}

	for (let baseName of list) {
		const file = path.resolve(dir, baseName)

		let stat;
		try {
			stat = fs.statSync(file)
		} catch (err) {
			return done(undefined, results)
		}

		// If directory, execute a recursive call
		if (stat.isDirectory() === true && options.ignoreDirectories.indexOf(baseName) === -1) {
			// Add directory to array [comment if you need to remove the directories from the array]
			results.push(file)

			filewalker(file, function (err, res) {
				results.push(...res)

				pending--;
				if (!pending) {
					done(undefined, results);
				}
			}, options)
			continue;
		}

		// Handle regular file
		if (options.testRegex && options.testRegex.test(file)) {
			results.push(file);
		}

		pending--;
		if (!pending) {
			done(undefined, results);
		}
	}
}

function cwd(): string {
	return process.cwd();
}

//
// Main and Routes
//

const routesToServe: {[pathname: string]: RequestFn | undefined} = {
	"/": onRequestPage,
	"/api/finishAllTests": onRequestFinishAllTests,
	"/runtime.js": onRequestRuntime,
	"/favicon.ico": undefined,
}

function onRequestRuntime(req: http.IncomingMessage, res: http.ServerResponse) {
	res.writeHead(200, {'Content-Type': 'application/javascript'});
	res.write(globalState.runtimeJS);
	res.end();
}

function onRequestFinishAllTests(req: http.IncomingMessage, res: http.ServerResponse) {
	const session = getSession(req);
	let hasFailed = false;
	let hasAtLeastOneTest = false;
	for (let name in session.testResult) {
		if (!session.testResult.hasOwnProperty(name)) {
			continue;
		}
		hasAtLeastOneTest = true;
		const testResult = session.testResult[name];
		if (testResult.hasFailed) {
			hasFailed = true;
		}
	}
	if (!hasAtLeastOneTest ||
		hasFailed) {
		console.log("Tests failed.")
		res.writeHead(500, {'Content-Type': 'text/plain'});
		res.write('FAIL');
		res.end();

		//
		if (!globalState.isWatchMode) {
			exit(ExitCode.FailedTest);
		}
		return;
	}
	console.log("Tests Passed.")
	res.writeHead(200, {'Content-Type': 'application/javascript'});
	res.write('PASS');
	res.end();

	//
	if (!globalState.isWatchMode) {
		exit(ExitCode.Success);
	}
}

function onRequestThemeAsset(pathname: string, req: http.IncomingMessage, res: http.ServerResponse) {
	if (!globalState.currentTheme) {
		handleError(res, 'No "currentTheme" set.');
		return;
	}
	pathname = path.normalize(pathname);
	if (pathname !== globalState.currentTheme.script &&
		pathname !== globalState.currentTheme.style) {
		handleBadRequest(res, 'Invalid asset requested at: '+pathname+'. Must be:\n'+'-'+globalState.currentTheme.script+'\n'+'-'+globalState.currentTheme.style);
		return;
	}
	let ext = path.extname(pathname).substr(1);
	// TODO(Jae): 2020-04-28
	// Have mapping of extension to mimetype that can be configured / updated.
	// Look into seeing what libs exist that provide this so we have nice defaults too.
	switch (ext) {
	case "js":
		res.writeHead(200, {'Content-Type': 'application/javascript'});
		break;
	case "css":
		res.writeHead(200, {'Content-Type': 'text/css'});
		break;
	default:
		throw new Error("Unhandled file extension requested: " + ext);
	}
	res.write(fs.readFileSync(pathname));
	res.end();
}

function onRequestPage(req: http.IncomingMessage, res: http.ServerResponse) {
	const bodyCloseTag = '</body>';
	if (DefaultTemplateHTML.indexOf(bodyCloseTag) === -1) {
		handleError(res, 'Unable to find </body> tag in HTML template to insert scripts near.');
		return;
	}
	const headCloseTag = '</head>';
	if (DefaultTemplateHTML.indexOf(bodyCloseTag) === -1) {
		handleError(res, 'Unable to find </head> tag in HTML template to insert styles near.');
		return;
	}

	let templateHTML = DefaultTemplateHTML;
	if (globalState.lastCompileError !== undefined) {
		templateHTML.replace(bodyCloseTag, '<script>window.testMateCompileError = '+JSON.stringify(newErrorMessage(globalState.lastCompileError))+'</script>'+bodyCloseTag);
	}
	// Load theme
	if (globalState.currentTheme !== undefined) {
		if (globalState.currentTheme.style) {
			templateHTML = templateHTML.replace(headCloseTag, '<link rel="stylesheet" type="text/css" href="/theme/'+globalState.currentTheme.style+'">'+headCloseTag);
		}
		templateHTML = templateHTML.replace(bodyCloseTag, '<script type="text/javascript" src="/theme/'+globalState.currentTheme.script+'"></script>'+bodyCloseTag);
	}
	// Load runtime
	const runtime = '/runtime.js';
	templateHTML = templateHTML.replace(bodyCloseTag, '<script type="text/javascript" src="'+runtime+'"></script>'+bodyCloseTag);
	// Add test cases and run
	templateHTML = templateHTML.replace(bodyCloseTag, `<script>
      window.testMateRuntime.testCases = `+JSON.stringify(globalState.testFileOutput)+`;
      window.testMateRuntime.start();
    </script>` + bodyCloseTag);

	res.writeHead(200, {'Content-Type': 'text/html'});
	res.write(templateHTML);
	res.end();
}

function onPostTestResultData(pathname: string, req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method !== 'POST') {
		handleBadRequest(res, "Must use POST");
		return;
	}

	console.log('receiving onPostTestResultData...', pathname);
	let body = '';
	req.on('data', chunk => {
		body += chunk.toString(); // convert Buffer to string
	});
	req.on('end', () => {
		let obj: testing.TestResult;
		try {
			obj = JSON.parse(body);
		} catch (e) {
			handleBadRequest(res, 'Unable to parse request. Expected JSON object.');
			return;
		}
		if (!obj.name) {
			handleBadRequest(res, 'Missing "name" on posted test result.');
			return;
		}
		if (obj.hasRun === undefined) {
			handleBadRequest(res, 'Missing "hasRun" on posted test result.');
			return;
		}
		if (obj.hasFailed === undefined) {
			handleBadRequest(res, 'Missing "hasFailed" on posted test result.');
			return;
		}
		const session = getSession(req);
		session.testResult[obj.name] = obj;
		res.writeHead(200, {"Content-Type": "text/plain"});
		res.end('ok');
	});
}

function onRequestCompiledTestData(pathname: string, req: http.IncomingMessage, res: http.ServerResponse) {
	pathname = path.normalize(pathname);
	let isValid: boolean = false;
	for (let testFile of globalState.testFileOutput) {
		for (let asset of testFile.assets) {
			isValid = isValid || pathname === asset;
		}
	}
	if (!isValid) {
		handleBadRequest(res, "Invalid file requested: " + pathname + ". Server will only serve asset files built by preprocessor.");
		return;
	}
	let data = fs.readFileSync(pathname).toString('utf8');
	let ext = path.extname(pathname).substr(1);
	// TODO(Jae): 2020-04-28
	// Have mapping of extension to mimetype that can be configured / updated.
	// Look into seeing what libs exist that provide this so we have nice defaults too.
	switch (ext) {
	case "js":
		res.writeHead(200, {'Content-Type': 'application/javascript'});
		break;
	case "css":
		res.writeHead(200, {'Content-Type': 'text/css'});
		break;
	default:
		throw new Error("Unhandled file extension requested: " + ext);
	}
	res.write(data);
	res.end();
}

function handleError(res: http.ServerResponse, message?: string | Error) {
	if (message instanceof Error) {
		message = String(message);
	}
	if (message === undefined) {
		message = "Internal Server Error";
	}
	res.writeHead(500, {"Content-Type": "text/plain"});
	res.write(message)
	res.end();
}

function handleBadRequest(res: http.ServerResponse, message?: string) {
	if (message === undefined) {
		message = "Bad Request";
	}
	res.writeHead(400, {"Content-Type": "text/plain"});
	res.write(message)
	res.end();
}

function handleNotFound(res: http.ServerResponse, message?: string) {
	if (message === undefined) {
		message = "Not Found";
	}
	res.writeHead(404, {"Content-Type": "text/plain"});
	res.write(message)
	res.end();
}

function onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
	if (!req.url) {
		handleNotFound(res);
		return;
	}
	let pathname = url.parse(req.url).pathname;
	if (!pathname) {
		handleNotFound(res);
		return;
	}
	try {
		const routeFn = routesToServe[pathname];
		if (routeFn === undefined) {
			// Fallback to complex route(s)
			if (pathname.startsWith('/api/')) {
				// API namespace
				const oldPathname = pathname;
				pathname = pathname.replace('/api/', '');
				if (pathname.startsWith('testResult/')) {
					pathname = pathname.replace('testResult/', '');
					console.log('Receiving /testResult/ data:"'+pathname+'"');
					onPostTestResultData(pathname, req, res)
					return;
				}
				if (pathname.startsWith('testResultAll/')) {
					pathname = pathname.replace('testResultAll/', '');
					console.log('[TODO: Handle this] Receiving /api/testResultAll/ data:"'+pathname+'"');
					onPostTestResultData(pathname, req, res)
					//throw new Error("TODO: Handle get all results")
					return;
				}
				// If nothing found, send 404.
				console.log('API Request not found:"'+oldPathname+'"');
				handleNotFound(res);
				return;
			}
			if (pathname.startsWith('/compiledTestData/')) {
				pathname = pathname.replace('/compiledTestData/', '');
				console.log('Serving /compiledTestData/ file:"'+pathname+'"');
				onRequestCompiledTestData(pathname, req, res)
				return;
			}
			if (pathname.startsWith('/theme/')) {
				pathname = pathname.replace('/theme/', '');
				console.log('Serving /theme/ file:"'+pathname+'"');
				onRequestThemeAsset(pathname, req, res)
				return
			}
			
			// If nothing found, send 404.
			console.log('Request not found:"'+pathname+'"');
			handleNotFound(res);
			return;
		}
		console.log('Serving request "'+pathname+'"');
		routeFn(req, res);
	} catch (e) {
		console.log('Error occurred serving:"'+pathname+'"');
		// If error occurs, send 500.
		res.writeHead(500, {"Content-Type": "text/plain"});
		res.end("Error: " + String(e));
		throw e;
	}
}

// newErrorMessage will turn an Error object into a message that can
// be sent to a browser and serialized with JSON.stringify.
// Unfortunately JSON.stringify won't "just work" with a regular Error
// object.
function newErrorMessage(err: Error) {
	const obj: {[key: string]: any} = {};
	Object.getOwnPropertyNames(err).forEach(function (key) {
		obj[key] = (err as any)[key];
	}, err);
	return {
		type: 'error',
		message: obj,
	};
}

async function onCompileHandler(res: preprocessor.CompileOutput | Error) {
	if (!globalState.hasCompiledOnce) {
		globalState.hasCompiledOnce = true;
		start();
	}

	// Reset error state
	globalState.lastCompileError = undefined;
	if (res instanceof Error) {
		console.log("Error compiling: ", res);
		globalState.lastCompileError = res;
		sendToAllClients(newErrorMessage(res));
	} else {
		try {
			onCompile(res);
		} catch (e) {
			globalState.lastCompileError = e;
			sendToAllClients(newErrorMessage(e));
		}
	}
}

/**
 * @throws Error
 */
function onCompile(res: preprocessor.CompileOutput) {
	if (typeof res !== 'object') {
		throw new Error('Expected a preprocessor result object from preprocessor callback instead got: ' + String(res));
	}
	if (!res.testFileOutput) {
		throw new Error('Expected a preprocessor result object from preprocessor callback. But there is no property with "testFileOutput" on the result.');
	}
	if (!Array.isArray(res.testFileOutput)) {
		throw new Error('Expected a preprocessor result to have a "testFileOutput" property that is an array.');
	}
	globalState.testFileOutput = res.testFileOutput;
	sendToAllClients({
		type: 'reload',
	});
}

function sendToAllClients(message: {[prop: string]: any}): void {
	if (globalState.websocketServer === undefined) {
		// Ignore if its not initialized
		return;
	}
	globalState.websocketServer.clients.forEach((client) => {
		client.send(JSON.stringify(message));
	});
}

function onWebsocketMessage(ws: WebSocket, message: WebSocket.Data) {
	// NOTE(Jae): 2020-04-28
	// We currently only using Websockets to send messages from the server to 
	// client, such telling it to refresh when files are changed.
	//
	// We use POST endpoints for other operations as that's more likely to support
	// more browsers.
	// console.log(`Received message => ${message}`)
}


async function exit(code: ExitCode) {
	if (globalState.server) {
		globalState.server.close();
		globalState.server = undefined;
	}
	if (globalState.websocketServer) {
		globalState.websocketServer.close();
		globalState.websocketServer = undefined;
	}
	if (globalState.browser) {
		await ChromeLauncher.killAll();
		globalState.browser = undefined;
	}
	process.exitCode = code;
	process.exit(code);
}

// Gracefully shutdown if terminated.
// This was implemented so that if you cancel the process in a command-line window / etc, it'll shutdown
// everything it booted up, ie. browsers.
//
// https://joseoncode.com/2014/07/21/graceful-shutdown-in-node-dot-js/
process.on('SIGTERM', function () {
	exit(ExitCode.SignalTerminated);
});

// start is called after the first compilation of tests
async function start() {
	// TODO(Jae):
	// Add logic to find a free port. We may also want the user to be able to configure a specific port or port-range
	// to always run on.
	const port = 9615;
	globalState.server = http.createServer(onRequest)
	globalState.server.listen(port);

	if (globalState.isWatchMode) {
		// NOTE(Jae): 2020-05-03
		// Disable Websockets for non-watch modes as we only really want to leverage
		// this for telling the browser to refresh when a recompilation occurs
		globalState.websocketServer = new WebSocket.Server({ port: 9688 })
		globalState.websocketServer.on('connection', (ws) => {
			ws.on('message', (message) => {
				onWebsocketMessage(ws, message);
			})
		});
	}

	let url = 'http://localhost:'+port+'/#/';
	if (!globalState.isWatchMode) {
		url += '?runAllTests';
	}

	const chrome = await ChromeLauncher.launch({
		startingUrl: url,
		chromeFlags: [
			//'--headless', 
			'--disable-gpu'
		],
		//ignoreDefaultFlags: true,
	});
	globalState.browser = chrome;
	// TODO(Jae):
	// More with chrome var?
}

async function main(): Promise<void> {
	// Load testmate.config.js
	let config: Config | undefined;
	try {
		config = await loadAndValidateConfig();
	} catch (e) {
		throw e;
	}

	// Load and parse command arguments
	let args: CommandFlags;
	try {
		args = getArguments();
	} catch (e) {
		throw e;
	}
	if (args.isHelp) {
		console.log(`Usage: testmate [command] [flags]

  Displays help information.

  Options:

	--watch\t\trun in watch mode so you can interactively edit tests

  Run \`testmate help COMMAND\` for more information on specific commands.

)`);
		return;
	}
	globalState.isWatchMode = args.isWatchMode;
	globalState.currentTheme = config.theme

	// loadRuntime
	const runtimeJS = fs.readFileSync(runtimePath).toString('utf8');
	globalState.runtimeJS = runtimeJS;

	// Discover all test files
	let testFiles: string[] = [];
	{
		const fileExtensionMap: {[ext: string]: boolean} = {}
		if (config.fileExtensions !== undefined) {
			for (let fileExtension of config.fileExtensions) {
				fileExtensionMap[fileExtension] = true;
			}
		}
		filewalker(cwd(), function (err, fileList) {
			if (err) {
				throw err;
			}
			for (let filePath of fileList) {
				const ext = path.extname(filePath).substr(1);
				if (fileExtensionMap[ext] !== undefined) {
					testFiles.push(filePath)
				}
			}
		}, {
			testRegex: config.testRegex,
			ignoreDirectories: ['node_modules'],
		})
		if (testFiles.length === 0) {
			throw new Error(`Cannot find any test files in: ${cwd()}\ntestRegex: ` + config.testRegex + "\n")
		}
	}

	// Create options object
	const options: preprocessor.Options = {
		testFiles: testFiles,
		onCompile: onCompileHandler,
		isWatchMode: globalState.isWatchMode,
	}

	// Run preprocessor first
	if (!config.preprocessor) {
		throw new Error("No \"preprocessor\" configured on testmate config file.");
	}
	if (options.isWatchMode) {
		console.log("Starting preprocessor (watch mode)...");
	} else {
		console.log("Starting preprocessor...");
	}
	config.preprocessor(options);
	
	// Waiting for onCompile to succeed at least once, then http server will start
	// See "onCompileHandler" function above.
}
try {
	main();
} catch (e) {
	throw e;
}
