package commands

import (
	"fmt"
	"math"
)

func ValidateInput(command Command, params map[string]any) error {
	if params == nil {
		params = map[string]any{}
	}
	for _, required := range command.InputSchema.Required {
		if _, exists := params[required]; !exists {
			return fmt.Errorf("missing required parameter %q", required)
		}
	}
	for key, value := range params {
		property, exists := command.InputSchema.Properties[key]
		if !exists {
			return fmt.Errorf("unknown parameter %q", key)
		}
		if err := validateValue(key, value, property); err != nil {
			return err
		}
	}
	if command.Category == "locator" && locatorActionRequiresTarget(command.Action) {
		selector, _ := params["selector"].(string)
		target, hasTarget := params["target"].(map[string]any)
		if selector == "" && (!hasTarget || target == nil) {
			return fmt.Errorf("locator target required: provide non-empty selector or target")
		}
		if hasTarget {
			if err := validateLocatorTarget("target", target); err != nil {
				return err
			}
		}
	}
	if target, ok := params["target"].(map[string]any); ok && !locatorActionRequiresTarget(command.Action) {
		if err := validateLocatorTarget("target", target); err != nil {
			return err
		}
	}
	return nil
}

func locatorActionRequiresTarget(action string) bool {
	switch action {
	case "click", "double_click", "fill", "press", "select_option", "set_checked", "inner_text", "text_content", "all_text_contents", "read_all", "get_attribute", "is_visible", "is_enabled", "count", "wait_for", "download_media":
		return true
	default:
		return false
	}
}

func validateLocatorTarget(path string, target map[string]any) error {
	kind, _ := target["kind"].(string)
	requireValue := kind == "css" || kind == "text" || kind == "label" || kind == "placeholder" || kind == "test_id"
	value, _ := target["value"].(string)
	role, _ := target["role"].(string)
	if requireValue && value == "" {
		return fmt.Errorf("parameter %q requires non-empty value", path)
	}
	if kind == "role" && role == "" && value == "" {
		return fmt.Errorf("parameter %q requires non-empty role", path)
	}
	if frames, ok := target["frame_path"].([]any); ok {
		for index, frame := range frames {
			frameTarget, ok := frame.(map[string]any)
			if !ok {
				return fmt.Errorf("parameter %q must be an object", fmt.Sprintf("%s.frame_path[%d]", path, index))
			}
			if err := validateLocatorTarget(fmt.Sprintf("%s.frame_path[%d]", path, index), frameTarget); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateValue(path string, value any, schema Schema) error {
	if value == nil {
		return fmt.Errorf("parameter %q cannot be null", path)
	}
	switch schema.Type {
	case "string":
		text, ok := value.(string)
		if !ok {
			return fmt.Errorf("parameter %q must be a string", path)
		}
		if len(schema.Enum) > 0 && !contains(schema.Enum, text) {
			return fmt.Errorf("parameter %q must be one of %v", path, schema.Enum)
		}
	case "number":
		if !isNumber(value) {
			return fmt.Errorf("parameter %q must be a number", path)
		}
	case "integer":
		if !isInteger(value) {
			return fmt.Errorf("parameter %q must be an integer", path)
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("parameter %q must be a boolean", path)
		}
	case "array":
		values, ok := value.([]any)
		if !ok {
			return fmt.Errorf("parameter %q must be an array", path)
		}
		if schema.Items != nil {
			for index, item := range values {
				if err := validateValue(fmt.Sprintf("%s[%d]", path, index), item, *schema.Items); err != nil {
					return err
				}
			}
		}
	case "object":
		objectValue, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("parameter %q must be an object", path)
		}
		if len(schema.Properties) > 0 {
			for _, required := range schema.Required {
				if _, exists := objectValue[required]; !exists {
					return fmt.Errorf("missing required parameter %q", path+"."+required)
				}
			}
			for key, nested := range objectValue {
				property, exists := schema.Properties[key]
				if !exists {
					return fmt.Errorf("unknown parameter %q", path+"."+key)
				}
				if err := validateValue(path+"."+key, nested, property); err != nil {
					return err
				}
			}
		}
	default:
		return fmt.Errorf("parameter %q has unsupported schema type %q", path, schema.Type)
	}
	return nil
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func isNumber(value any) bool {
	switch value.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return true
	default:
		return false
	}
}

func isInteger(value any) bool {
	switch number := value.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return true
	case float32:
		return math.Trunc(float64(number)) == float64(number)
	case float64:
		return math.Trunc(number) == number
	default:
		return false
	}
}
