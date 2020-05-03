import React from 'react';
import ReactDOM from "react-dom"
import { testing } from "@testmate/testing";
import { testdom } from "@testmate/testdom";
import { testeq } from "@testmate/testeq";

import { Button } from './Button';

let container: HTMLDivElement;

testing.beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});

testing.test('Link changes the class when hovered', async () => {
	ReactDOM.render(
		<Button label="Test"/>,
		container,
	);
	const button = document.querySelector('button');
	if (!button) {
		throw new Error("Button element not found");
	}
	testdom.click(button);
	const styles = window.getComputedStyle(button);
	testeq.expect(styles.backgroundColor, 'rgb(255, 0, 0)');
});

testing.test('Render a button', async () => {
	ReactDOM.render(
		<Button label="Test"/>,
		container,
	);
	const button = document.querySelector('button');
	if (!button) {
		throw new Error("Button element not found");
	}
	const styles = window.getComputedStyle(button);
	testeq.expect(styles.backgroundColor, 'rgb(239, 239, 239)');
});


// toSnapshot testing the idea of snapshotting CSS for element
function toSnapshot(el: HTMLElement) {
	let styleMap: {[key: string]: any} = {};
	const styleList = window.getComputedStyle(el);
	for (let i = 0; i < styleList.length; i++) {
		const style = styleList[i];
		const value: string = (styleList as any)[style];
		if (!value) {
			continue;
		}
		styleMap[style] = value;
	}
	const styleText = JSON.stringify(styleMap);
	const debugEl = document.createElement('div');
	debugEl.textContent = styleText;
	document.body.appendChild(debugEl);
}
