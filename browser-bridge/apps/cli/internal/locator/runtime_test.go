package locator

import (
	"regexp"
	"strings"
	"testing"
)

func TestEmbeddedRuntimeHasStableVersionAndNoModelEvaluateEntry(t *testing.T) {
	source := RuntimeSource()
	for _, want := range []string{"window.__actspaceLocator", `var VERSION = "5"`, "normalizeTarget", "setNativeValue", "visible_dom", "paginate", "waitForState", "accessibleName", "computedRole", "queryCSSComposed", "receivesEvents"} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime missing %q", want)
		}
	}
	if strings.Contains(source, "eval(params") || strings.Contains(source, "new Function") {
		t.Fatal("runtime must not execute model-provided JavaScript")
	}
}

func TestEmbeddedRuntimeVersionMatchesGoRuntimeVersion(t *testing.T) {
	match := regexp.MustCompile(`var VERSION = "([^"]+)"`).FindStringSubmatch(RuntimeSource())
	if len(match) != 2 {
		t.Fatal("embedded runtime is missing a VERSION constant")
	}
	if match[1] != RuntimeVersion {
		t.Fatalf("embedded runtime version = %q, Go RuntimeVersion = %q", match[1], RuntimeVersion)
	}
}

func TestVisibleDOMUsesViewportFilteringAndIncludesDraggableElements(t *testing.T) {
	source := RuntimeSource()
	for _, want := range []string{"function isInViewport", "rect.bottom > 0", "rect.top < window.innerHeight", "[draggable=true]", "filter(isInViewport)", `element.tagName.toLowerCase() === "a"`} {
		if !strings.Contains(source, want) {
			t.Fatalf("visible DOM runtime missing %q", want)
		}
	}
}
