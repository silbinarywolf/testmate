// TODO(Jae): 2020-04-26
// Figure out how to import a file into this but make TypeScript
// compile everything into 1 file for this build. 
// (Currently errors trying to import polyfill as I dont expose 
// that file in the web server)
//import './polyfill';
import type { theme } from '@testmate/theme';
import type { preprocessor } from '@testmate/preprocessor';
import type { testing } from '@testmate/testing';

declare global {
    interface Window { 
    	testMateRuntime: runtime.Runtime | undefined; 
    }
}

namespace runtime {
	export interface Runtime {
		// testCases is given built testCase data from the backend.
		testCases: preprocessor.TestOutput[];
		// start() is immediately executed in a <script> tag after loading theme / runtime
		// data.
		start: () => void;
		currentTestCase: preprocessor.TestOutput | undefined;
		currentiFrame: HTMLIFrameElement | undefined;
		host: string;
		websocketPort: number;
	}
}

window.testMateRuntime = (function(): runtime.Runtime {
	let assetCount = 0;

	const self: runtime.Runtime = {
		start: start,
		// NOTE(Jae): 2020-04-25
		// This is references directly and unsafely in a template
		// located here: packages\cmd\src\template.ts
		testCases: [],
		currentTestCase: undefined,
		currentiFrame: undefined,
		host: window.location.host, // ie. "127.0.0.1:9000"
		websocketPort: 9688,
	};

	let socket: WebSocket | undefined;

	// onTestMessage will fire when a message is received from a test to
	// be sent to the server
	function onTestMessage(message: {[key: string]: any}) {
		if (!message ||
			!message.type ||
			typeof message.type !== 'string') {
			throw new Error("onTestMessage expects an object with a \"type\" property that is a string.");
		}
		if (!socket) {
			throw new Error('onTestMessage fired but there was no WebSocket server listening.')
		}
		socket.send(JSON.stringify(message));
	}

	// onWebsocketRecvMessage recieves a websocket message from the server
	function onWebsocketRecvMessage(event: MessageEvent) {
		let data = event.data;
		if (typeof data !== 'string') {
			return;
		}
		onRecvMessage(data);
		return;
	}

	function setCompileError(message: string | {[key: string]: any}) {
		// Normalize error
		let errorMessage = 'Unknown or unhandled error occurred.';
		switch (typeof message) {
		case 'object':
			if (message.stack) {
				errorMessage = message.stack;
			} else {
				errorMessage = 'Unexpected error. Unhandled error shape, JSON of error is: ' + JSON.stringify(message);
			}
			break;
		case 'string':
			errorMessage = message;
			break;
		case 'number':
			errorMessage = 'Err No: ' + errorMessage;
			break;
		}

		// TODO(Jae): 2020-04-30
		// Currently Webpack-preprocessor just returns ugly text because it expects
		// to be processed by a command-line, maybe i can convert that to HTML to make it look
		// good in the browser?
		document.body.innerHTML = '';
		const preEl = document.createElement('pre');
		preEl.classList.add('testError');
		preEl.textContent = errorMessage;
		document.body.appendChild(preEl);
	}

	// onRecvMessage takes a string (most likely an unparsed JSON object)
	// and processes it from the server.
	function onRecvMessage(data: string) {
		interface Message {
			[key: string]: any;
			type: string; // 'refresh'
		}
		let msg: Message;
		try {
			msg = JSON.parse(data);
		} catch (e) {
			console.warn('Error parsing JSON from server: ', data)
			throw e;
		}
		switch (msg.type) {
		case 'reload': {
			window.location.reload(true);
			break;
		}
		case 'error': {
			setCompileError(msg.message);
			break;
		}
		default:
			console.warn('Unknown message type sent: ', msg.type);
		}
	}

	function onAssetLoadHandler(e: Event) {
		try {
			onAssetLoad(e);
		} catch (e) {
			setCompileError(e);
			throw e;
		}
	}

	function onAssetLoad(e: Event) {
		assetCount--;
		if (assetCount !== 0) {
			return;
		}
		// If all assets are loaded, then trigger tests
		const iframeEl = getIFrame();
		const iframeDoc = iframeEl.contentDocument;
		if (!iframeDoc) {
			throw new Error("Cannot find \"contentDocument\" on iframe element.");
		}
		const iframeWindow = iframeEl.contentWindow;
		if (!iframeWindow) {
			throw new Error("Cannot find \"window\" on iframe \"contentWindow\" property.");
		}
		const testMateFile = iframeWindow.testMateFile;
		if (!testMateFile) {
			// NOTE(Jae): 2020-05-02
			// I'd ideally like to add a mechanism to catch / show the actual error that occurs in the <iframe>
			// but I think that would require that adding an "onerror" handler to the iframe.
			// I tried adding "onerror" handlers to the <script> tags, but that didn't catch issues with them.
			throw new Error("Cannot find \"iframeWindow.testMateFile\" property. This indicates that your test code most likely had uncaught errors. Check the console log.");
		}
		// TODO(Jae): 2020-05-03
		// Update this so we can report log messages to
		// the server as they occur.
		//testMateFile.onMessage = onTestMessage;
		runTests(testMateFile);
	}

	function updateTestRender(tests: testing.Test[]): void {
		const currentTheme = window.testMateCurrentTheme;
		if (!currentTheme) {
			throw new Error("No registered theme found. Unable to render anything.");
		}

		// Detect if we have "testOnly" tests
		let hasTestOnlyTest: boolean = false;
		for (let test of tests) {
			if (test.isTestOnly === true) {
				hasTestOnlyTest = true;
			}
		}

		// Convert `testing.Test` to `theme.Test` format
		let themeTests: theme.Test[] = [];
		for (let test of tests) {
			if (hasTestOnlyTest === true &&
				test.isTestOnly === false) {
				// Skip providing test if one has "testOnly" and this test
				// isn't marked as that test.
				continue;
			}
			let state: theme.TestState = 'waiting';
			if (test.resultData.hasExceptionalError) {
				state = 'error';
			} else if (test.resultData.hasFailed) {
				state = 'fail';
			} else {
				state = 'pass';
			}
			themeTests.push({
				name: test.name,
				state: state,
			})
		}
		const settings: theme.TestSettings =  {
			inFile: self.currentTestCase ? self.currentTestCase.inFile : '',
			tests: themeTests,
		};
		currentTheme.onTest(settings);
	}

	// TODO(Jae)
	// Add type def for testMateFile to share betwene testing / runtime
	async function runTests(testMateFile: testing.TestFile): Promise<void> {
		if (!window.testMateRuntime) {
			throw new Error('Unexpected error. Cannot find "window.testMateRuntime" property.');
		}
		if (!self.currentTestCase){
			throw new Error('Unexpected error. Cannot find "window.testMateRuntime.currentTestCase" property.');
		}

		const tests = testMateFile.tests;

		// Detect if we have "testOnly" tests
		let hasTestOnlyTest = false;
		for (let test of tests) {
			if (test.isTestOnly === true) {
				hasTestOnlyTest = true;
			}
		}

		// Run tests
		let testResultList = [];
		for (let test of tests) {
			if (hasTestOnlyTest === true &&
				test.isTestOnly === false) {
				// Skip test if one has "testOnly" and this test
				// isn't marked as that test.
				continue;
			}
			// Update render
			updateTestRender(tests);
		
			// Run test
			await testMateFile.run(test);

			// Push to list of all results
			testResultList.push(test.resultData);

			// Tell server results of this test.
			// We do this so the command-line can print as results happen so that if the browser
			// is running headless or invisible, results can still be seen.
			let response;
			try {
				// NOTE(Jae): 2020-05-02
				// Technically (as of now anyway), we don't need to wait for this response, we could just plow
				// ahead to make this execute faster.
				response = await fetch("/api/testResult/"+self.currentTestCase.inFile, {
					headers: {
						"Accept": "application/json",
						"Content-Type": "application/json"
					},
					method: "POST",
					body: JSON.stringify(test.resultData),
				});
			} catch (e) {
				console.error("Failed to post test result due to error: ", e);
				continue;
			}
		}

		// Update all results
		updateTestRender(tests);

		// Post all test results
		try {
			await fetch("/api/testResultAll/"+self.currentTestCase.inFile, {
				headers: {
					"Accept": "application/json",
					"Content-Type": "application/json"
				},
				method: "POST",
				body: JSON.stringify({
					testResultList: testResultList,
				}),
			});
		} catch (e) {
			console.error("Failed to post all test results due to error: ", e);
			return;
		}

		if (!shouldRunAllTests()) {
			// Stop here
			return;
		}

		// Find next test and visit the page related to rendering that test
		const testCases = window.testMateRuntime.testCases;
		for (let i = 0; i < testCases.length; i++) {
			const testCase = testCases[i]
			if (self.currentTestCase !== testCase) {
				continue;
			}
			if (i + 1 < testCases.length) {
				let nextTestCase = testCases[i+1];
				window.location.href = getTestURL(nextTestCase);
				break;
			}
			// If last test, tell server we're done
			try {
				await fetch("/api/finishAllTests", {
					headers: {
						"Accept": "text/plain",
					},
					method: "POST",
				});
			} catch (e) {
				console.error("Failure with tests: ", e);
				return;
			}
			// NOTE(Jae): 2020-05-03
			// Tried this, but Chrome doesn't have permission to close itself
			// so no point.
			// window.close();
		}
	}

	function shouldRunAllTests(): boolean {
		const urlParams = new URLSearchParams(window.location.search);
		const v = urlParams.get('runAllTests');
		return (v !== null);
	}

	function getIFrame(): HTMLIFrameElement {
		if (!self.currentiFrame) {
			throw new Error('Missing "currentiFrame"');
		}
		return self.currentiFrame;
		/*let iframeElList = document.querySelectorAll<HTMLIFrameElement>('.testmate-iframe');
		if (!iframeElList || iframeElList.length === 0) {
			throw new Error("Cannot find iframe sandbox.");
		}
		if (iframeElList.length > 1) {
			throw new Error("Cannot have more than one iframe with class \"testmate-iframe\".");
		}
		const iframeEl = iframeElList[0];
		return iframeEl;*/
	}

	function onTestPage(testCase: preprocessor.TestOutput) {
		if (!self.testCases) {
			throw new Error("Unexpected error. Expected \"testCases\" to be an array but instead its falsey.");
		}
		if (self.testCases.length === 0) {
			throw new Error("No tests provided.");
		}

		// NOTE(Jae): 2020-04-30
		// We must render the test page first so that we can insert an iframe into it.
		// If you move an existing iframe from one place to another, it refreshes itself, which we do not want.
		updateTestRender([]);

		// Find render container
		const iFrameEl = document.querySelector('.testmate-iframe');
		if (!iFrameEl) {
			throw new Error('Unable to find .testmate-iframe in theme.');
		}
		if (!(iFrameEl instanceof HTMLIFrameElement)) {
			throw new Error('Found .testmate-iframe in theme but it was not an <iframe>');
		}

		const iframeDoc = iFrameEl.contentDocument;
		if (!iframeDoc) {
			throw new Error("Cannot find \"contentDocument\" on iframe element.");
		}
		self.currentiFrame = iFrameEl;
		const iframeHead = iframeDoc.head;
		const iframeBody = iframeDoc.body;
		self.currentTestCase = testCase;
		assetCount = 0;
		for (let asset of testCase.assets) {
			// NOTE(Jae): 2020-04-25
			// compiledTestData is used to detect routes for these
			// files for the server.
			asset = '/compiledTestData/' + asset;
			if (asset.endsWith('.js')) {
				assetCount++;
				const scriptEL = document.createElement('script');
				scriptEL.src = asset;
				scriptEL.onload = onAssetLoadHandler;
				iframeBody.appendChild(scriptEL);
				continue;
			} 
			if (asset.endsWith('.css')) {
				assetCount++;
				const styleEl = document.createElement('link');
				styleEl.rel = "stylesheet";
				styleEl.type = "text/css";
				styleEl.media = "screen";
				styleEl.href = asset;
				styleEl.onload = onAssetLoadHandler;
				iframeHead.appendChild(styleEl);
				continue;
			}
			throw new Error("Unable to handle file type: " + asset);
		}
		
		//(iframeEl as any).addEventListener('load', function(e: Error) {
		//	console.warn("URL changed");
		//});
	}

	function startWebsocket() {
		//socket.onopen = function(event) {
		//socket.send("Here's some text that the server is urgently awaiting!"); 
		//};
		socket = new WebSocket("ws://"+window.location.hostname+":"+String(self.websocketPort));
		socket.onmessage = onWebsocketRecvMessage;
	}

	function getTestURL(testCase: preprocessor.TestOutput) {
		return '#/test/' + testCase.inFile;
	}

	function start() {
		// NOTe(Jae): 2020-04-30
		// This logic handles compilation errors if they occurred before first render. 
		// This is for watch mode.
		if ((window as any).testMateCompileError) {
			setCompileError((window as any).testMateCompileError.message);
			return;
		}
		if (!window.testMateRuntime) {
			throw new Error("Unexpected error. Unable to find \"window.testMateRuntime\" to get testCases from.");
		}
		const currentTheme = window.testMateCurrentTheme;
		if (!currentTheme) {
			throw new Error("No registered theme found. Unable to render anything.");
		}
		const options: theme.RouteSettings = {
			testCases: window.testMateRuntime.testCases,
		};

		// Start websocket server
		startWebsocket();

		window.addEventListener('hashchange', (e) => {
			// Force page refresh when /#/ URL changes
			window.location.reload();
		}, false);

		// Render page
		let route = window.location.hash.split('?')[0];
		if (!route ||
			route === '#' ||
			route === '#/') {
			if (shouldRunAllTests()) {
				for (let testCase of options.testCases) {
					window.location.href = getTestURL(testCase);
					return;
				}
			}
			currentTheme.onHomePage(options);
			return;
		}
		if (route.startsWith('#/test/')) {
			const testFilename = route.replace('#/test/', '');
			let testCase: preprocessor.TestOutput | undefined;
			if (options.testCases) {
				for (let otherTestCase of options.testCases) {
					if (testFilename === otherTestCase.inFile) {
						testCase = otherTestCase;
						break;
					}
				}
			}
			if (!testCase) {
				const errorMessage = "Unable to find test file: " + testFilename;
				setCompileError(errorMessage);
				throw new Error(errorMessage);
			}
			onTestPage(testCase);
			return;
		}
		const errorMessage = "Unhandled route: " + route;
		setCompileError(errorMessage);
		throw new Error(errorMessage);
	}

	return self;
})();
