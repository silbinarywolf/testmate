import React from "react"
import ReactDOM from "react-dom"

import type { preprocessor } from '@testmate/preprocessor';
import type { theme } from "@testmate/theme";
import styles from "~/pages/TestPage/TestPage.css";

interface Props extends theme.TestSettings {
}

interface State {

}

export class TestPage extends React.Component<Props, State> {
	private readonly refIFrame = React.createRef<HTMLDivElement>();

	constructor(props: Props) {
		super(props);
	}


	static getTagName(state: theme.TestState): string {
		switch (state) {
		case 'waiting':
			return 'Waiting';
		case 'pass':
			return 'Pass';
		case 'fail':
			return 'Fail';
		case 'error':
			return 'Error';
		case 'skip':
			return 'skip';
		}
		return 'Unknown State';
	}

	static getTagClass(state: theme.TestState): string {
		let classes = styles.tag + ' ';
		switch (state) {
		case 'waiting':
			classes += styles.tagWaiting;
			break;
		case 'pass':
			classes += styles.tagPass;
			break;
		case 'fail':
			classes += styles.tagFail;
			break;
		case 'error':
			classes += styles.tagError;
			break;
		case 'skip':
			classes += styles.tagSkip;
			break;
		}
		return classes;
	}

	render() {
		const {
			tests,
		} = this.props;
		return (
			<div className={styles.root}>
				<aside className={styles.sidebar}>
					<h2>Test Cases</h2>
					{(!tests || tests.length === 0) && (
						<div>
							No test cases found.
						</div>
					)}
					{(tests && tests.length > 0) && (
						<ul className={styles.testList}>
							{tests.map((test) => {
								return (
									<li 
										key={test.name}
										className={styles.testListItem}
									>
										<span className={TestPage.getTagClass(test.state)}>
											{TestPage.getTagName(test.state)}
										</span>
										<span className={styles.testTitle}>
											{test.name}
										</span>
									</li>
								)
							})}
						</ul>
					)}
				</aside>
				<div className={styles.content}>
					<iframe 
						className="testmate-iframe"
						sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts"
					/>
				</div>
			</div>
		);
	}
}
