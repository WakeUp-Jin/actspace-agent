package locator

import _ "embed"

//go:embed generated/runtime.js
var runtimeSource string

const RuntimeVersion = "5"

func RuntimeSource() string {
	return runtimeSource
}
