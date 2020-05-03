import React from 'react';
import ReactDOM from "react-dom"
import { testing } from "@testmate/testing";

import { ButtonTwo } from './ButtonTwo';

let container: HTMLDivElement;

testing.beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});

testing.test('Link changes the class when hovered', () => {
	ReactDOM.render(
		<ButtonTwo label="Test"/>,
		container
	);
	// DEBUG: Break test on purpose
	// throw new Error("hey");
});
