import React from "react"
import ReactDOM from "react-dom"

import type { preprocessor } from '@testmate/preprocessor';
import styles from "~/pages/HomePage/HomePage.css";

interface Props {
	tests: preprocessor.TestOutput[];
}

interface State {

}

export class HomePage extends React.Component<Props, State> {
	render() {
		const {
			tests 
		} = this.props;
		return (
			<React.Fragment>
				<h2>All tests</h2>
				{(!tests || tests.length === 0) &&
					<div>No tests found.</div>
				}
				{(tests && tests.length > 0) &&
					<ul>
						{tests.map((test) => {
							const url = "/#/test/"+test.inFile;
							return (
								<li>
									<a 
										href={url}
										className={styles.link}
									>
										{test.inFile}
									</a>
								</li>
							)
						})};
					</ul>
				}
			</React.Fragment>
		);
	}
}
