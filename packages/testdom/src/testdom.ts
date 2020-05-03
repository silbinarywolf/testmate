import { testing } from '@testmate/testing';

// TODO(jae): 2020-05-03
// Use of the "<K extends keyof HTMLElementTagNameMap>" logic below isn't quite correct.
// What we want is TypeScript to try and match a key first, than fallback to just returning an "Element" type
// if it can't find a type for simple selectors like "input"
export namespace testdom {

function doneUnexpectedError() {
	throw new Error("Unexpected error. \"done\" used before assignment error. This should not happen.");
}

type TypeableElement = Element & {
	value?: string;
	focus?: () => void;
};

// TODO(Jae): 2020-05-02
// Make the timeout for this function configurable?
// Possibly make the second parameter allow you to set a wait time.
const queryElementTimeout = 5000;

// TODO(Jae): 2020-05-02
// Make this configurable. The default is to await this amount of milliseconds
// between each keypress.
const typeSpeed = 5;

export async function type(el: TypeableElement, text: string): Promise<void> {
	if (!el) {
		throw new Error("Cannot pass in empty value.");
	}
	if (!(el instanceof Element)) {
		throw new Error("Cannot pass in value that isn't an Element.");
	}
	if (document.activeElement !== el &&
		el.focus) {
		// NOTE(Jae): 2020-05-03
		// We use dispatchEvent() so that any event handlers on focus are triggered.
		// This is important so user-code executes somewhat correctly.
		//
		// TODO(Jae): 2020-05-03
		// This probably needs more work so we provide the same values in the event as an actual focus event.
		el.dispatchEvent(new Event('focus'));
	}
	let done: () => void = doneUnexpectedError;
	const donePromise = new Promise<Element[]>((resolve, reject) => {
		done = (): void => {
			resolve();
		};
	});
	// NOTE(Jae): 2020-05-03
	// We must wait 1 frame for the "focus" events to occur. 
	// Otherwise the typing logic here misses typing the first character.
	window.requestAnimationFrame(() => {
		type_internal(done, el, text, 0);
	})
	await donePromise;
}

export function click(el: Element | null | undefined): void {
	if (el === null ||
		el === undefined) {
		throw new Error("Cannot call \"click\" on a null or undefined value.");
	}
	// NOTE(Jae): 2020-05-03
	// We use dispatchEvent() so that any event handlers on focus are triggered.
	// This is important so user-code executes somewhat correctly.
	//
	// TODO(Jae): 2020-05-03
	// This probably needs more work so we provide the same values in the event as an actual focus event.
	/*let callback;
	let clickHandler: ((e: Event) => void) | undefined;
	const defer = new Promise((resolve, reject) => {
		clickHandler = (e: Event) => {
			window.requestAnimationFrame(() => {
				resolve();
			});
		};
	});
	if (!clickHandler) {
		throw new Error("Unexpected error. clickHandler is not set.");
	}
	el.addEventListener('click', clickHandler);*/

	// NOTE(Jae): 2020-05-03
	// Not sure how reliable this approach will be. Lifted from here and it *seems* to work.
	// https://stackoverflow.com/questions/5352709/is-it-possible-to-dispatchevent-a-mouse-click-to-a-input-type-text-element
	const clickEvent = document.createEvent("MouseEvents");
    clickEvent.initMouseEvent("click", true, true, window, 1, 0, 0, 0, 0,
        false, false, false, false, 0, null);
	el.dispatchEvent(clickEvent);
}

async function type_internal(done: () => void, el: TypeableElement, text: string, i: number): Promise<void> {
	if (i >= text.length) {
		// NOTE(Jae): 2020-05-03
		// We use dispatchEvent() so that any event handlers on blur are triggered.
		// This is important so user-code executes somewhat correctly.
		//
		// TODO(Jae): 2020-05-03
		// This probably needs more work so we provide the same values in the event as an actual blur event.
		el.dispatchEvent(new Event('blur'));
		done();
		return;
	}
	// TODO(Jae): 2020-05-03
	// Put more work into this. Make type have a configurable millisecond delay like Cypress
	// and make sure it fires the events we want as a normal user would.
	// (Make code execute as close to reality as possible)
	//
	// Cypress has them documented here:
	// - https://docs.cypress.io/api/commands/type.html#Events
	// 	- keydown
	// 	- keypress
	// 	- textInput
	// 	- input
	// 	- keyup
	//
	// This script should also have work put into it to ensure typing of UTF-8 characters works
	// as expected.
	//
	let char = text.charAt(i);
	el.dispatchEvent(new KeyboardEvent('keydown',{'key':char}));
	el.dispatchEvent(new KeyboardEvent('keypress',{'key':char}));
	if (el.value !== undefined) {
		el.value += char;
	}
	el.dispatchEvent(new KeyboardEvent('input'));
	el.dispatchEvent(new KeyboardEvent('keyup',{'key':char}));
	setTimeout(() => {
		type_internal(done, el, text, i+1);
	}, typeSpeed);
}

// expectHidden will wait the configured timeout time for an element to either become "display: none" or stop existing.
export async function expectHidden<K extends keyof HTMLElementTagNameMap>(selector: K | string): Promise<void> {
	let done: () => void = doneUnexpectedError;
	const donePromise = new Promise<HTMLElementTagNameMap[K][]>((resolve, reject) => {
		let handle: number | undefined;
		handle = window.setTimeout(() => {
			reject(new Error("Exceeded "+queryElementTimeout+" millisecond timeout waiting for element to disappear: " + selector));
			handle = undefined;
		}, queryElementTimeout);
		done = (): void => {
			if (handle !== undefined) {
				clearTimeout(handle);
				handle = undefined;
			}
			resolve();
		};
	});
	querySelectorAllHidden_internal(done, selector);
	// Wait for "done()" to be called
	const elements = await donePromise;
}

function querySelectorAllHidden_internal<K extends (keyof HTMLElementTagNameMap) | string>(done: () => void, selector: K): void {
	const elements: NodeListOf<HTMLElement> = document.querySelectorAll(selector);
	if (elements.length === 0) {
		done();
		return;
	}
	let hasVisibleElements = false;
	elements.forEach((el: HTMLElement) => {
		// NOTE(Jae): 2020-05-03
		// Checking "offsetParent" is a quick way to check if an element
		// is hidden with "display: none;" or similar.
		if ((el as HTMLElement).offsetParent !== undefined &&
			(el as HTMLElement).offsetParent !== null) {
			hasVisibleElements = true;
		}
	});
	if (hasVisibleElements) {
		window.requestAnimationFrame(() => {
			querySelectorAllHidden_internal(done, selector);
		});
		return;
	}
	done();
}

// querySelectorAllVisible will query for elements asynchronous until they're found.
export async function querySelectorAllVisible<K extends keyof HTMLElementTagNameMap>(selector: K | string): Promise<HTMLElementTagNameMap[K][] | Element[]> {
	let done: (elements: HTMLElementTagNameMap[K][] | Element[]) => void = doneUnexpectedError;
	const donePromise = new Promise<HTMLElementTagNameMap[K][] | Element[]>((resolve, reject) => {
		let handle: number | undefined;
		handle = window.setTimeout(() => {
			reject(new Error("Exceeded "+queryElementTimeout+" millisecond timeout waiting for element to be visible: " + selector));
			handle = undefined;
		}, queryElementTimeout);
		done = (elements: Element[]): void => {
			if (handle !== undefined) {
				clearTimeout(handle);
				handle = undefined;
			}
			resolve(elements);
		};
	});
	querySelectorAllVisible_internal(done, selector);
	// Wait for "done()" to be called
	const r = await donePromise;
	return r;
}

function querySelectorAllVisible_internal<K extends keyof HTMLElementTagNameMap>(done: (elements: HTMLElementTagNameMap[K][] | Element[]) => void, selector: K | string): void {
	const elements = document.querySelectorAll(selector);
	if (elements.length === 0) {
		window.requestAnimationFrame(() => {
			querySelectorAllVisible_internal(done, selector);
		});
		return;
	}
	let elementList: Element[] = [];
	elements.forEach((el: Element) => {
		// NOTE(Jae): 2020-05-03
		// Checking "offsetParent" is a quick way to check if an element
		// is hidden with "display: none;" or similar.
		if ((el as HTMLElement).offsetParent !== undefined &&
			(el as HTMLElement).offsetParent !== null) {
			elementList.push(el);
		}
	});
	if (elementList.length === 0) {
		window.requestAnimationFrame(() => {
			querySelectorAllVisible_internal(done, selector);
		});
		return;
	}
	done(elementList);
}

}
