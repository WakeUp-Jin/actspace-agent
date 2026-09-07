"use strict";

module.exports = Object.freeze({
  loadRuntime: () => import("./dist/index.js"),
});
