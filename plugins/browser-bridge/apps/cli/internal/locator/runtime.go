package locator

import _ "embed"

//go:embed runtime.js
var runtimeSource string

const RuntimeVersion = "4"

func RuntimeSource() string {
	return runtimeSource
}
