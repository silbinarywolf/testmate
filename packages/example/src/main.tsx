import React from "react"
import ReactDOM from "react-dom"

import { Button } from "~/Button/Button";
import { ButtonTwo } from "~/ButtonTwo/ButtonTwo";

function main() {
	ReactDOM.render(
		<React.Fragment>
			<Button label="Test"/>,
			<ButtonTwo label="Test"/>
		</React.Fragment>,
		document.getElementById("app")
	);
}
main();
