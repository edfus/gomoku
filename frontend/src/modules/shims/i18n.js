// const dolm = require("dolm").load({});
const helper = require("../helper");

const t = (...args) => args.join("");
module.exports = {
  t: t,
  context: context => t,
  loadStrings: helper.noop,
  loadFile: helper.noop,
  loadLang: helper.noop,
  serialize: t,
};
