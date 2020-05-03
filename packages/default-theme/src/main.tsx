import React from "react"
import ReactDOM from "react-dom"

import '~/base.css';

import { HomePage } from '~/pages/HomePage/HomePage';
import { TestPage } from '~/pages/TestPage/TestPage';
import { theme } from "@testmate/theme";

function onHomePage(settings: theme.RouteSettings) {
	ReactDOM.render(
		<HomePage tests={settings.testCases} />,
		document.getElementById('app'),
	);
}

function onTest(settings: theme.TestSettings) {
	ReactDOM.render(
		<TestPage {...settings} />,
		document.getElementById('app'),
	);
}

theme.register({
	onHomePage: onHomePage,
	onTest: onTest,
});
