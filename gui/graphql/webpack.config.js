const path = require('path');

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';

module.exports = {
	mode: mode,
	entry: { main: './src/index.jsx' },
	output: {
		filename: '[name].js',
		path: path.resolve('public')
	},
	resolve: {
		extensions: ['.mjs', '.jsx', '.js', '.css']
	},
	module: {
		rules: [
			{
				test: /\.html$/,
				use: ['file?name=[name].[ext]'],
			},
			// for graphql module, which uses mjs still
			{
				type: 'javascript/auto',
				test: /\.mjs$/,
				use: [],
				include: /node_modules/,
			},
			{
				test: /\.(js|jsx)$/,
				use: [
					{
						loader: 'babel-loader',
						options: {
							presets: [
								['@babel/preset-env', { modules: false }],
								'@babel/preset-react',
							],
						},
					},
				],
			},
			{
				test: /\.css$/,
				use: ['style-loader', 'css-loader'],
			},
			{
				test: /\.svg$/,
				use: [{ loader: 'svg-inline-loader' }],
			},
		],
	},
	resolve: {
		extensions: ['.js', '.json', '.jsx', '.css', '.mjs'],
		fallback: {
			fs: false,
			module: false
	  }
	}
};
