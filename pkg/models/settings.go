package models

type Settings struct {
	BaseURL string `json:"baseUrl"`
	APIKey  string `json:"apiKey"` // read from secure json data
}

type QueryRange struct {
	From *string `json:"from"`
	To   *string `json:"to"`
}

type OrcaQuery struct {
	RefID     string     `json:"refId"`
	SheetID   string     `json:"sheetId"`
	Limit     int        `json:"limit"`
	Skip      int        `json:"skip"`
	TimeField string     `json:"timeField"`
	Range     QueryRange `json:"range"`
}

type Field struct {
	Key         string `json:"key"`
	Label       string `json:"label,omitempty"`
	Type        string `json:"type,omitempty"`
	Format      string `json:"format,omitempty"`
	GrafanaType string `json:"grafanaType"`
	IsTime      bool   `json:"isTime,omitempty"`
	Decimals    *int   `json:"decimals,omitempty"`
}
