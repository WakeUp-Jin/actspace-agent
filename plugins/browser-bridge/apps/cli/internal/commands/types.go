package commands

type RiskLevel string

const (
	RiskLow    RiskLevel = "low"
	RiskMedium RiskLevel = "medium"
	RiskHigh   RiskLevel = "high"
)

type ImplementationStatus string

const (
	StatusImplemented    ImplementationStatus = "implemented"
	StatusPartial        ImplementationStatus = "partial"
	StatusNotImplemented ImplementationStatus = "not_implemented"
)

type Schema struct {
	Type        string            `json:"type"`
	Description string            `json:"description,omitempty"`
	Properties  map[string]Schema `json:"properties,omitempty"`
	Required    []string          `json:"required,omitempty"`
	Items       *Schema           `json:"items,omitempty"`
	Enum        []string          `json:"enum,omitempty"`
}

type Command struct {
	ID                   string               `json:"id"`
	Category             string               `json:"category"`
	Action               string               `json:"action"`
	Title                string               `json:"title"`
	Description          string               `json:"description"`
	InputSchema          Schema               `json:"inputSchema"`
	OutputSchema         Schema               `json:"outputSchema"`
	BackendRequirements  []string             `json:"backendRequirements"`
	RequiredCapabilities []string             `json:"requiredCapabilities"`
	RiskLevel            RiskLevel            `json:"riskLevel"`
	ReadOnly             bool                 `json:"readOnly"`
	Effect               string               `json:"effect"`
	OriginPolicy         string               `json:"originPolicy"`
	PreviewKind          string               `json:"previewKind"`
	Status               ImplementationStatus `json:"status"`
	HandlerKey           string               `json:"handlerKey,omitempty"`
	LegacyAliases        []string             `json:"legacyAliases,omitempty"`
	Examples             []string             `json:"examples"`
}

type RegistryReport struct {
	Version    string    `json:"version"`
	Count      int       `json:"count"`
	Categories []string  `json:"categories"`
	Commands   []Command `json:"commands"`
}
