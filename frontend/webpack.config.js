const path = require("path");
const webpack = require("webpack");

let noopPath = path.join(__dirname, "src/modules/shims/noop");
let emptyPath = path.join(__dirname, "src/modules/shims/empty");

module.exports = (env, argv) => ({
  entry: "./src/components/App.js",

  output: {
    filename: "bundle.js",
    path: __dirname,
  },

  devtool: argv.mode === "production" ? false : "eval-source-map",

  node: {
    Buffer: false,
  },

  node: {
    __dirname: false,
  },

  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(argv.mode)
    }),
    new webpack.DefinePlugin({
      'process.platform': JSON.stringify("browser")
    })
  ],

  resolve: {
    alias: {
      react: path.join(__dirname, "node_modules/preact/dist/preact.min"),
      preact: path.join(__dirname, "node_modules/preact/dist/preact.min"),
      "prop-types": path.join(__dirname, "src/modules/shims/prop-types"),
      fs: path.join(__dirname, "src/modules/shims/fs"),
      util: path.join(__dirname, "src/modules/shims/util"),
      electron: path.join(__dirname, "src/modules/shims/electron"),
      buffer: path.join(__dirname, "src/modules/shims/buffer"),
      "@sabaki/boardmatcher": path.join(
        __dirname,
        "src/modules/shims/boardmatcher"
      ),
      "character-entities": emptyPath,
      "character-entities-html4": emptyPath,
      "character-entities-legacy": emptyPath,
      "character-entities-invalid": emptyPath,
      "character-reference-invalid": emptyPath,
      moment: emptyPath,
      "uuid/v1": noopPath,
      "recursive-copy": noopPath,
      rimraf: noopPath,
      "argv-split": path.join(__dirname, "src/modules/shims/argv-split"), // user(me)-defined modules
      "@sabaki/gtp": path.join(__dirname, "src/modules/shims/gtp"), // user(me)-defined modules
      "./i18n": path.join(__dirname, "src/modules/shims/i18n"),
      "../i18n": path.join(__dirname, "src/modules/shims/i18n"),
      "../../i18n": path.join(__dirname, "src/modules/shims/i18n"),
      "../menu": emptyPath,

      "./TextSpinner": noopPath,
      "../TextSpinner": noopPath,
      "./bars/AutoplayBar": noopPath,
    },
    fallback: {
      "path": require.resolve("path-browserify")
    },
  },

  externals: {
    moment: "null",
    "iconv-lite": "null",
    jschardet: "null",
  },
});
