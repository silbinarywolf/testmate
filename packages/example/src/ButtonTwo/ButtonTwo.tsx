import React from "react";

import ButtonTwoStyle from "~/ButtonTwo/ButtonTwo.css";

interface ButtonProps {
	label: string;
}

export function ButtonTwo(props: ButtonProps): JSX.Element {
	const {
		label
	} = props;
	return (
		<button
			type="button"
			className={[
				ButtonTwoStyle.button,
			].join(' ')}
			onClick={() => {
				alert("hey for ButtonTwo");
			}}
		>
			{label}
		</button>
	)
}
