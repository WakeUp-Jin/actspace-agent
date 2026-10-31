package locator

import _ "embed"

//go:embed generated/runtime.js
var runtimeSource string

const RuntimeVersion = "6"

func RuntimeSource() string {
	return runtimeSource
}
