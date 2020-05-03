import React from "react";

import ButtonStyle from "~/Button/Button.css";

interface ButtonProps {
	label: string;
}

interface State {
	clicked: boolean;
}

export class Button extends React.Component<ButtonProps, State> {
	state: State

	constructor(props: ButtonProps) {
		super(props);
		this.state = {
			clicked: false,
		}
	}

	render() {
		const {
			label
		} = this.props;
		const {
			clicked
		} = this.state;
		return (
			<button
				type="button"
				className={[
					ButtonStyle.button,
					clicked ? ButtonStyle.clicked : undefined,
				].join('a ')}
				onClick={() => {
					this.setState({
						clicked: true,
					})
				}}
			>
				{label}
			</button>
		)
	}
}
