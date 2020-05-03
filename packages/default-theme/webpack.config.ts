const path = require("path");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
	entry: path.resolve(__dirname, "src", "main.tsx"),
	mode: process.env.NODE_ENV !== "production" ? "development" : "production",
	devtool: process.env.NODE_ENV !== "production" ? "inline-source-map" : "source-map",
	module: {
		rules: [
			{
				test: /\.html$/i,
				loader: "html-loader",
				include: [
					path.resolve("src")
				],
			},
			{
				test: /\.css$/,
				use: [
					{
						loader: MiniCssExtractPlugin.loader,
						options: {
							// you can specify a publicPath here
							// by default it uses publicPath in webpackOptions.output
							//publicPath: "/",
							hmr: process.env.NODE_ENV === "development",
						},
					},
					{
						loader: require.resolve("css-modules-typescript-loader"),
						options: {
							mode: process.env.CI ? "verify" : "emit"
						}
					},
					{
						loader: require.resolve("css-loader"),
						options: {
							modules: {
								localIdentName: '[name]__[local]--[hash:base64:5]',
							},
							importLoaders: 1,
						},
					},
					{
						loader: require.resolve("postcss-loader")
					}
				],
			},
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/
			},
		]
	},
	resolve: {
		extensions: [
			".tsx",
			".ts",
			".js",
		],
		plugins: [
			new TsconfigPathsPlugin()
		]
	},
	plugins: [
	 	new CleanWebpackPlugin(),
		new MiniCssExtractPlugin({
			// Options similar to the same options in webpackOptions.output
			// both options are optional
			filename: process.env.NODE_ENV !== "production" ? "[name].css" : "[name].[hash].css",
			chunkFilename: process.env.NODE_ENV !== "production" ? "[id].css" : "[id].[hash].css",
		}),
		new HtmlWebpackPlugin({
			template: "src/index.html",
		}),
	],
	output: {
		filename: "bundle.min.js",
		path: path.resolve(__dirname, "lib"),
		// NOTE(Jake): 2019-10-30
		// Need this or React Router falls over on sub-urls.
		// See: https://github.com/jantimon/html-webpack-plugin/issues/156
		publicPath: "/",
	},
	devServer: {
		contentBase: path.join(__dirname, "lib"),
		compress: true,
		port: 9000,
		historyApiFallback: true,
	}
};
