package commands

func object(required []string, properties map[string]Schema) Schema {
	return Schema{Type: "object", Properties: properties, Required: required}
}

func emptyObject() Schema {
	return object(nil, map[string]Schema{})
}

func stringProperty(description string) Schema {
	return Schema{Type: "string", Description: description}
}

func enumProperty(description string, values ...string) Schema {
	return Schema{Type: "string", Description: description, Enum: values}
}

func numberProperty(description string) Schema {
	return Schema{Type: "number", Description: description}
}

func integerProperty(description string) Schema {
	return Schema{Type: "integer", Description: description}
}

func booleanProperty(description string) Schema {
	return Schema{Type: "boolean", Description: description}
}

func arrayProperty(description string, item Schema) Schema {
	return Schema{Type: "array", Description: description, Items: &item}
}

func paginatedValuesResult(values Schema) Schema {
	return object(
		[]string{"values", "total", "offset", "returned", "has_more"},
		map[string]Schema{
			"values":   values,
			"total":    integerProperty("Total matching result count."),
			"offset":   integerProperty("Zero-based offset of this page."),
			"returned": integerProperty("Number of results in this page."),
			"has_more": booleanProperty("Whether more results remain."),
		},
	)
}

var (
	tabID              = integerProperty("Target Chrome tab id.")
	timeoutMS          = integerProperty("Timeout in milliseconds.")
	selector           = stringProperty("CSS selector interpreted by the Locator subset.")
	nodeID             = stringProperty("Node id returned by browser_dom snapshot.")
	keys               = arrayProperty("Key chord or key sequence.", stringProperty("Key name."))
	modifiers          = arrayProperty("Optional keyboard modifiers.", stringProperty("Modifier name."))
	emptyResult        = emptyObject()
	valueStringResult  = object([]string{"value"}, map[string]Schema{"value": stringProperty("Returned string value.")})
	valueBooleanResult = object([]string{"value"}, map[string]Schema{"value": booleanProperty("Returned boolean value.")})
)

func tabOnlySchema() Schema {
	return object([]string{"tab_id"}, map[string]Schema{"tab_id": tabID})
}

func tabTimeoutSchema() Schema {
	return object([]string{"tab_id"}, map[string]Schema{"tab_id": tabID, "timeout_ms": timeoutMS})
}

func selectorSchema(extra map[string]Schema, required ...string) Schema {
	properties := map[string]Schema{"tab_id": tabID, "selector": selector, "timeout_ms": timeoutMS}
	for key, value := range extra {
		properties[key] = value
	}
	baseRequired := []string{"tab_id", "selector"}
	baseRequired = append(baseRequired, required...)
	return object(baseRequired, properties)
}

func pointSchema(extra map[string]Schema, required ...string) Schema {
	properties := map[string]Schema{
		"tab_id": tabID,
		"x":      numberProperty("CSS pixel x coordinate."),
		"y":      numberProperty("CSS pixel y coordinate."),
	}
	for key, value := range extra {
		properties[key] = value
	}
	baseRequired := []string{"tab_id", "x", "y"}
	baseRequired = append(baseRequired, required...)
	return object(baseRequired, properties)
}
