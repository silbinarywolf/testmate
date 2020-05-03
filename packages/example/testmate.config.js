module.exports = {
	version: "1.0.0",
	fileExtensions: ["js", "jsx", "ts", "tsx"],
	testRegex: /.test.tsx?/,
	preprocessor: (options) => {
		const { preprocess } = require('@testmate/webpack-preprocessor');
		const path = require('path');
		const webpackConfig = require(path.resolve(__dirname, 'webpack.config.js'));
		if (!webpackConfig) {
			throw new Error('Missing webpack.config.js file.');
		}
		return preprocess(options, webpackConfig);
	},
	// NOTE(Jae): 2020-04-24
	// Example of Jest
	/*verbose: true,
	moduleFileExtensions: ["js", "ts", "tsx"],
	moduleDirectories: ["node_modules"],
	moduleNameMapper: {
		"\\.css$": "identity-obj-proxy",
		"\\.(gif|ttf|eot|svg)$": "<rootDir>/__mocks__/fileMock.js",
		"client(.*)": "<rootDir>/client/$1"
	},
	transform: {
		"^.+\\.tsx?$": "ts-jest"
	},*/
};
