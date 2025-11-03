package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"

	"orcascan-orcascan-datasource/pkg/models"
)

const (
	defaultBaseURL = "https://api.orcascan.com/v1"
	fieldCacheTTL  = 5 * time.Minute
)

type apiResponse map[string]any

type orcaDatasource struct {
	im instancemgmt.InstanceManager
}

type orcaInstance struct {
	baseURL      string
	apiKey       string
	httpClient   *http.Client
	fieldCache   map[string]fieldCacheEntry
	fieldCacheMu sync.RWMutex
}

type orcaSheet struct {
	ID   string `json:"_id"`
	Name string `json:"name"`
}

type orcaField struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Type   string `json:"type"`
	Format string `json:"format"`
}

type orcaRowsResponse struct {
	Data []map[string]any `json:"data"`
}

type resourceQueryPayload struct {
	Query models.OrcaQuery `json:"query"`
}

type fieldCacheEntry struct {
	fields    []orcaField
	fetchedAt time.Time
}

type fieldKind int

const (
	fieldKindString fieldKind = iota
	fieldKindNumber
	fieldKindBoolean
	fieldKindTime
	fieldKindGeo
)

func (k fieldKind) grafanaType() string {
	switch k {
	case fieldKindNumber:
		return "number"
	case fieldKindBoolean:
		return "boolean"
	case fieldKindTime:
		return "time"
	case fieldKindGeo:
		return "string"
	default:
		return "string"
	}
}

type fieldDescriptor struct {
	meta        orcaField
	kind        fieldKind
	decimals    int
	hasDecimals bool
}

const detectionSampleLimit = 200

type geoColumnInfo struct {
	latDecimals int
	lonDecimals int
}

func newDatasource() *orcaDatasource {
	return &orcaDatasource{
		im: datasource.NewInstanceManager(newDatasourceInstance),
	}
}

func newDatasourceInstance(_ context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	cfg := models.Settings{}
	if len(settings.JSONData) > 0 {
		if err := json.Unmarshal(settings.JSONData, &cfg); err != nil {
			return nil, fmt.Errorf("invalid json data: %w", err)
		}
	}

	baseURL := strings.TrimSpace(cfg.BaseURL)
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	baseURL = strings.TrimRight(baseURL, "/")

	apiKey := strings.TrimSpace(settings.DecryptedSecureJSONData["apiKey"])

	return &orcaInstance{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
		fieldCache: make(map[string]fieldCacheEntry),
	}, nil
}

// QueryData currently returns empty responses because the frontend issues resource-based queries.
// Once the frontend is migrated to rely on QueryData we can reuse the same Orca API helpers here.
func (d *orcaDatasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	res := backend.NewQueryDataResponse()
	for _, q := range req.Queries {
		res.Responses[q.RefID] = backend.DataResponse{}
	}
	return res, nil
}

func (d *orcaDatasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	inst, err := d.getInstance(ctx, req.PluginContext)
	if err != nil {
		return nil, err
	}

	if err := inst.validateAPIKey(); err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}

	if _, err := inst.listSheets(ctx); err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Orca Scan backend is running",
	}, nil
}

func (d *orcaDatasource) resourcesHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ping", d.handlePing)
	mux.HandleFunc("/sheets", d.handleSheets)
	mux.HandleFunc("/fields", d.handleFields)
	mux.HandleFunc("/query", d.handleQuery)
	return mux
}

func (d *orcaDatasource) handlePing(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst, err := d.instanceFromRequest(r)
	if err != nil {
		backend.Logger.Error("Ping failed to resolve instance", "err", err)
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	if err := inst.validateAPIKey(); err != nil {
		backend.Logger.Warn("Ping missing API key")
		writeError(w, http.StatusBadRequest, err)
		return
	}

	sheets, err := inst.listSheets(ctx)
	if err != nil {
		backend.Logger.Error("Ping listing sheets failed", "err", err)
		writeError(w, statusFromError(err), err)
		return
	}

	backend.Logger.Info("Ping succeeded", "sheetCount", len(sheets))

	writeJSON(w, http.StatusOK, apiResponse{
		"status":     "ok",
		"message":    "Connection successful. Orca Scan data source is ready to use.",
		"sheetCount": len(sheets),
	})
}

func (d *orcaDatasource) handleSheets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst, err := d.instanceFromRequest(r)
	if err != nil {
		backend.Logger.Error("Sheets failed to resolve instance", "err", err)
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	if err := inst.validateAPIKey(); err != nil {
		backend.Logger.Warn("Sheets missing API key")
		writeError(w, http.StatusBadRequest, err)
		return
	}

	sheets, err := inst.listSheets(ctx)
	if err != nil {
		backend.Logger.Error("Sheets listing failed", "err", err)
		writeError(w, statusFromError(err), err)
		return
	}

	backend.Logger.Info("Sheets fetched", "count", len(sheets))

	writeJSON(w, http.StatusOK, apiResponse{"sheets": sheets})
}

func (d *orcaDatasource) handleFields(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst, err := d.instanceFromRequest(r)
	if err != nil {
		backend.Logger.Error("Fields failed to resolve instance", "err", err)
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	if err := inst.validateAPIKey(); err != nil {
		backend.Logger.Warn("Fields missing API key")
		writeError(w, http.StatusBadRequest, err)
		return
	}

	sheetID := strings.TrimSpace(r.URL.Query().Get("sheetId"))
	if sheetID == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("sheetId is required"))
		return
	}

	fieldsMeta, err := inst.getFields(ctx, sheetID)
	if err != nil {
		backend.Logger.Error("Fields fetch failed", "sheetId", sheetID, "err", err)
		writeError(w, statusFromError(err), err)
		return
	}

	descList, _ := buildFieldDescriptors(fieldsMeta, nil)
	fieldInfos := buildFieldInfos(descList, "")

	writeJSON(w, http.StatusOK, apiResponse{"fields": fieldInfos})
}

func (d *orcaDatasource) handleQuery(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst, err := d.instanceFromRequest(r)
	if err != nil {
		backend.Logger.Error("Query failed to resolve instance", "err", err)
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	if err := inst.validateAPIKey(); err != nil {
		backend.Logger.Warn("Query missing API key")
		writeError(w, http.StatusBadRequest, err)
		return
	}

	var payload resourceQueryPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		backend.Logger.Warn("Query invalid JSON payload", "err", err)
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid request body: %w", err))
		return
	}

	query := payload.Query
	if query.SheetID == "" {
		backend.Logger.Debug("Query missing sheetId; returning empty result", "refId", query.RefID)
		writeJSON(w, http.StatusOK, apiResponse{
			"rows":      []map[string]any{},
			"refId":     query.RefID,
			"sheetId":   "",
			"fields":    []string{},
			"timeField": query.TimeField,
		})
		return
	}

	limit := sanitizeLimit(query.Limit)
	skip := sanitizeSkip(query.Skip)

	backend.Logger.Info("Query rows", "sheetId", query.SheetID, "refId", query.RefID, "limit", limit, "skip", skip)

	rows, err := inst.listRows(ctx, query.SheetID, limit, skip)
	if err != nil {
		backend.Logger.Error("Query rows failed", "sheetId", query.SheetID, "err", err)
		writeError(w, statusFromError(err), err)
		return
	}

	fieldsMeta, fieldErr := inst.getFields(ctx, query.SheetID)
	if fieldErr != nil {
		backend.Logger.Warn("Query failed to fetch field metadata", "sheetId", query.SheetID, "err", fieldErr)
	}

	descList, descMap := buildFieldDescriptors(fieldsMeta, rows)

	originalTimeInput := strings.TrimSpace(query.TimeField)
	effectiveTimeField := ""
	if originalTimeInput != "" {
		if resolvedField, ok := resolveTimeField(originalTimeInput, descList, rows); ok {
			effectiveTimeField = resolvedField
		} else {
			backend.Logger.Warn("Requested time field not found", "sheetId", query.SheetID, "timeField", originalTimeInput)
		}
	}

	query.TimeField = effectiveTimeField

	rowsWithGeo, geoSuccess := extendRowsWithGeo(rows, descMap)
	descList, descMap = extendFieldDescriptorsForGeo(descList, descMap, geoSuccess)
	normalizedRows := normalizeRows(rowsWithGeo, descMap)

	filtered := applyClientFilters(normalizedRows, query, effectiveTimeField)

	fieldInfos := buildFieldInfos(descList, effectiveTimeField)
	if len(fieldInfos) == 0 {
		fieldInfos = fallbackFieldInfos(filtered, effectiveTimeField)
	}

	backend.Logger.Info("Query rows returned", "sheetId", query.SheetID, "refId", query.RefID, "total", len(normalizedRows), "returned", len(filtered), "timeField", effectiveTimeField)

	writeJSON(w, http.StatusOK, apiResponse{
		"rows":      filtered,
		"refId":     query.RefID,
		"sheetId":   query.SheetID,
		"fields":    fieldInfos,
		"timeField": effectiveTimeField,
	})
}

func (d *orcaDatasource) instanceFromRequest(r *http.Request) (*orcaInstance, error) {
	pluginCtx := backend.PluginConfigFromContext(r.Context())
	return d.getInstance(r.Context(), pluginCtx)
}

func (d *orcaDatasource) getInstance(ctx context.Context, pluginCtx backend.PluginContext) (*orcaInstance, error) {
	instance, err := d.im.Get(ctx, pluginCtx)
	if err != nil {
		return nil, err
	}

	inst, ok := instance.(*orcaInstance)
	if !ok {
		return nil, errors.New("unexpected instance type")
	}

	return inst, nil
}

func (i *orcaInstance) validateAPIKey() error {
	if i.apiKey == "" {
		return errors.New("API key is required. Configure the data source with a valid Orca Scan API key.")
	}
	return nil
}

func (i *orcaInstance) authHeader() string {
	if strings.HasPrefix(strings.ToLower(i.apiKey), "bearer ") {
		return i.apiKey
	}
	return "Bearer " + i.apiKey
}

func (i *orcaInstance) listSheets(ctx context.Context) ([]orcaSheet, error) {
	var resp struct {
		Data []orcaSheet `json:"data"`
	}

	if err := i.do(ctx, http.MethodGet, "/sheets", nil, nil, &resp); err != nil {
		return nil, err
	}

	return resp.Data, nil
}

func (i *orcaInstance) listRows(ctx context.Context, sheetID string, limit, skip int) ([]map[string]any, error) {
	params := url.Values{}
	if limit > 0 {
		params.Set("limit", strconv.Itoa(limit))
	}
	if skip > 0 {
		params.Set("skip", strconv.Itoa(skip))
	}

	var resp orcaRowsResponse
	path := fmt.Sprintf("/sheets/%s/rows", url.PathEscape(sheetID))
	if err := i.do(ctx, http.MethodGet, path, params, nil, &resp); err != nil {
		return nil, err
	}

	return resp.Data, nil
}

func (i *orcaInstance) getFields(ctx context.Context, sheetID string) ([]orcaField, error) {
	if sheetID == "" {
		return nil, nil
	}

	i.fieldCacheMu.RLock()
	if entry, ok := i.fieldCache[sheetID]; ok && time.Since(entry.fetchedAt) < fieldCacheTTL {
		i.fieldCacheMu.RUnlock()
		return entry.fields, nil
	}
	i.fieldCacheMu.RUnlock()

	var resp struct {
		Data []orcaField `json:"data"`
	}

	path := fmt.Sprintf("/sheets/%s/fields", url.PathEscape(sheetID))
	if err := i.do(ctx, http.MethodGet, path, nil, nil, &resp); err != nil {
		return nil, err
	}

	i.fieldCacheMu.Lock()
	i.fieldCache[sheetID] = fieldCacheEntry{
		fields:    resp.Data,
		fetchedAt: time.Now(),
	}
	i.fieldCacheMu.Unlock()

	return resp.Data, nil
}

func (i *orcaInstance) do(ctx context.Context, method, path string, params url.Values, body io.Reader, out any) error {
	if err := i.validateAPIKey(); err != nil {
		return err
	}

	fullURL := i.baseURL + path
	if len(params) > 0 {
		fullURL += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, body)
	if err != nil {
		return err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", i.authHeader())
	req.Header.Set("User-Agent", "Grafana-OrcaScan-Plugin/1.0")

	resp, err := i.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		return fmt.Errorf("orcascan api: %s %s returned %s (%d)", method, path, strings.TrimSpace(string(bodyBytes)), resp.StatusCode)
	}

	if out == nil {
		io.Copy(io.Discard, resp.Body)
		return nil
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

func sanitizeLimit(v int) int {
	switch {
	case v <= 0:
		return 5000
	case v > 5000:
		return 5000
	default:
		return v
	}
}

func sanitizeSkip(v int) int {
	if v < 0 {
		return 0
	}
	return v
}

func applyClientFilters(rows []map[string]any, query models.OrcaQuery, timeField string) []map[string]any {
	if len(rows) == 0 {
		return rows
	}

	var fromTime, toTime *time.Time

	if timeField != "" {
		if query.Range.From != nil && *query.Range.From != "" {
			if parsed, err := parseOrcaTimeString(*query.Range.From); err == nil {
				fromTime = &parsed
			}
		}
		if query.Range.To != nil && *query.Range.To != "" {
			if parsed, err := parseOrcaTimeString(*query.Range.To); err == nil {
				toTime = &parsed
			}
		}
	}

	matches := make([]map[string]any, 0, len(rows))

	for _, row := range rows {
		if !filtersMatch(row, query.Filters) {
			continue
		}

		keep := true

		if timeField != "" && (fromTime != nil || toTime != nil) {
			val, ok := row[timeField]
			if ok {
				if ts, parsed := timeFromValue(val); parsed {
					if fromTime != nil && ts.Before(*fromTime) {
						keep = false
					}
					if keep && toTime != nil && ts.After(*toTime) {
						keep = false
					}
				}
			}
		}

		if keep {
			matches = append(matches, row)
		}
	}

	return matches
}

func filtersMatch(row map[string]any, filters []models.Filter) bool {
	if len(filters) == 0 {
		return true
	}

	for _, f := range filters {
		if f.Key == "" {
			continue
		}
		key := normalizeFieldKey(f.Key)
		val, ok := resolveFieldKey(row, key)
		if !ok {
			return false
		}
		if !valueEquals(val, f.Value) {
			return false
		}
	}

	return true
}

func resolveFieldKey(row map[string]any, lookup string) (any, bool) {
	if val, ok := row[lookup]; ok {
		return val, true
	}
	reduced := strings.ToLower(lookup)
	for k, v := range row {
		if strings.ToLower(normalizeFieldKey(k)) == reduced {
			return v, true
		}
	}
	return nil, false
}

func normalizeFieldKey(key string) string {
	key = strings.TrimSpace(key)
	key = trimQuotes(key)
	return key
}

func valueEquals(val any, expected string) bool {
	expected = trimQuotes(strings.TrimSpace(expected))
	switch v := val.(type) {
	case string:
		return strings.EqualFold(strings.TrimSpace(v), expected)
	case bool:
		switch strings.ToLower(expected) {
		case "true", "1", "yes":
			return v
		case "false", "0", "no":
			return !v
		default:
			return fmt.Sprint(v) == expected
		}
	case float64:
		if parsed, err := strconv.ParseFloat(expected, 64); err == nil {
			return v == parsed
		}
		return fmt.Sprint(v) == expected
	case time.Time:
		if parsed, err := parseOrcaTimeString(expected); err == nil {
			return v.Equal(parsed)
		}
		return strings.EqualFold(v.Format(time.RFC3339), expected)
	default:
		return fmt.Sprint(v) == expected
	}
}

func trimQuotes(value string) string {
	if len(value) >= 2 {
		if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
			return value[1 : len(value)-1]
		}
	}
	return value
}

func buildFieldDescriptors(fields []orcaField, rows []map[string]any) ([]fieldDescriptor, map[string]fieldDescriptor) {
	if len(fields) == 0 {
		return nil, map[string]fieldDescriptor{}
	}

	list := make([]fieldDescriptor, 0, len(fields))
	mapping := make(map[string]fieldDescriptor, len(fields))
	decimalsMap := computeFieldDecimals(rows)
	for _, f := range fields {
		kind := classifyField(f)
		kind = detectKindFromRows(f.Key, rows, kind)

		descriptor := fieldDescriptor{
			meta: f,
			kind: kind,
		}

		if kind == fieldKindNumber || kind == fieldKindGeo {
			if d, ok := decimalsMap[f.Key]; ok {
				if d > 0 {
					descriptor.decimals = d
					descriptor.hasDecimals = true
				}
			}
		}

		list = append(list, descriptor)
		mapping[f.Key] = descriptor
	}
	return list, mapping
}

func classifyField(f orcaField) fieldKind {
	format := strings.ToLower(strings.TrimSpace(f.Format))
	typ := strings.ToLower(strings.TrimSpace(f.Type))

	switch {
	case strings.Contains(format, "true/false"), typ == "boolean":
		return fieldKindBoolean
	case strings.Contains(format, "number"), strings.Contains(format, "formula"), typ == "number", typ == "integer", typ == "float", typ == "double":
		return fieldKindNumber
	case strings.Contains(format, "gps"), strings.Contains(format, "location"), typ == "gps", typ == "location":
		return fieldKindGeo
	case strings.Contains(format, "date"), strings.Contains(format, "time"), typ == "datetime", typ == "date":
		return fieldKindTime
	default:
		return fieldKindString
	}
}

func detectKindFromRows(key string, rows []map[string]any, current fieldKind) fieldKind {
	if (current != fieldKindString && current != fieldKindGeo) || len(rows) == 0 {
		return current
	}

	numeric := true
	boolean := true
	timeLike := true
	geoLike := true
	evaluated := 0

	for _, row := range rows {
		if evaluated >= detectionSampleLimit {
			break
		}

		val, ok := row[key]
		if !ok || val == nil {
			continue
		}

		if numeric && !isNumericValue(val) {
			numeric = false
		}
		if boolean && !isBooleanValue(val) {
			boolean = false
		}
		if timeLike && !isTimeValue(val) {
			timeLike = false
		}
		if geoLike && !isGeoValue(val) {
			geoLike = false
		}

		evaluated++

		if !numeric && !boolean && !timeLike && !geoLike {
			break
		}
	}

	if evaluated == 0 {
		return current
	}
	if numeric {
		return fieldKindNumber
	}
	if boolean {
		return fieldKindBoolean
	}
	if timeLike {
		return fieldKindTime
	}
	if geoLike {
		return fieldKindGeo
	}
	return current
}

func computeFieldDecimals(rows []map[string]any) map[string]int {
	decimals := make(map[string]int)

	for _, row := range rows {
		for key, val := range row {
			if d, ok := decimalsFromValue(val); ok {
				if current, exists := decimals[key]; !exists || d > current {
					decimals[key] = d
				}
			}
		}
	}

	return decimals
}

func detectGeoColumns(rows []map[string]any) map[string]geoColumnInfo {
	result := make(map[string]geoColumnInfo)

	for _, row := range rows {
		for key, val := range row {
			_, _, latDec, lonDec, ok := parseGeoValue(val)
			if !ok {
				continue
			}
			info := result[key]
			if latDec > info.latDecimals {
				info.latDecimals = latDec
			}
			if lonDec > info.lonDecimals {
				info.lonDecimals = lonDec
			}
			result[key] = info
		}
	}

	return result
}

func decimalsFromValue(val any) (int, bool) {
	switch v := val.(type) {
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return 0, false
		}
		trimmed = strings.TrimPrefix(trimmed, "+")
		trimmed = strings.TrimSpace(trimmed)
		negative := strings.HasPrefix(trimmed, "-")
		if negative {
			trimmed = strings.TrimPrefix(trimmed, "-")
		}
		if trimmed == "" {
			return 0, false
		}
		if strings.ContainsAny(trimmed, "eE") {
			if _, err := strconv.ParseFloat(v, 64); err == nil {
				return 0, true
			}
			return 0, false
		}
		if idx := strings.Index(trimmed, "."); idx >= 0 {
			suffix := trimmed[idx+1:]
			return len(suffix), true
		}
		if _, err := strconv.ParseFloat(v, 64); err == nil {
			return 0, true
		}
		return 0, false
	case json.Number:
		if s := v.String(); s != "" {
			return decimalsFromValue(s)
		}
	case float64, float32:
		// Unable to determine reliably; skip
		return 0, false
	case int, int32, int64, uint, uint32, uint64:
		return 0, true
	}

	return 0, false
}

func isNumericValue(val any) bool {
	switch v := val.(type) {
	case float64, float32, int, int32, int64, uint, uint32, uint64:
		return true
	case json.Number:
		if _, err := v.Float64(); err == nil {
			return true
		}
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return false
		}
		normalized := strings.ReplaceAll(trimmed, ",", "")
		if _, err := strconv.ParseFloat(normalized, 64); err == nil {
			return true
		}
	}
	return false
}

func isBooleanValue(val any) bool {
	switch v := val.(type) {
	case bool:
		return true
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "true", "false", "yes", "no", "1", "0":
			return true
		}
	case float64:
		return v == 0 || v == 1
	case int:
		return v == 0 || v == 1
	}
	return false
}

func isTimeValue(val any) bool {
	switch v := val.(type) {
	case time.Time:
		return true
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return false
		}
		if !strings.ContainsAny(trimmed, "-/:T ") {
			return false
		}
		if _, err := parseOrcaTimeString(trimmed); err == nil {
			return true
		}
	}
	return false
}

func isGeoValue(val any) bool {
	_, _, _, _, ok := parseGeoValue(val)
	return ok
}

func normalizeRows(rows []map[string]any, descriptors map[string]fieldDescriptor) []map[string]any {
	if len(descriptors) == 0 || len(rows) == 0 {
		return rows
	}

	normalized := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out := make(map[string]any, len(row))
		for key, val := range row {
			if desc, ok := descriptors[key]; ok {
				out[key] = normalizeValue(val, desc.kind)
			} else {
				out[key] = val
			}
		}
		normalized = append(normalized, out)
	}
	return normalized
}

func normalizeValue(value any, kind fieldKind) any {
	if value == nil {
		return nil
	}

	switch kind {
	case fieldKindNumber:
		return normalizeNumber(value)
	case fieldKindBoolean:
		return normalizeBoolean(value)
	case fieldKindTime:
		if ts, err := parseValueToTime(value); err == nil {
			return ts
		}
		return value
	default:
		return value
	}
}

func normalizeNumber(value any) any {
	switch v := value.(type) {
	case float64, float32, int64, int32, int, uint, uint32, uint64:
		return toFloat64(v)
	case json.Number:
		if f, err := v.Float64(); err == nil {
			return f
		}
	case string:
		if trimmed := strings.TrimSpace(v); trimmed != "" {
			if f, err := strconv.ParseFloat(trimmed, 64); err == nil {
				return f
			}
		}
	}
	return value
}

func toFloat64(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int32:
		return float64(v)
	case int64:
		return float64(v)
	case uint:
		return float64(v)
	case uint32:
		return float64(v)
	case uint64:
		return float64(v)
	default:
		return 0
	}
}

func normalizeBoolean(value any) any {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "true", "1", "yes":
			return true
		case "false", "0", "no":
			return false
		}
	case float64:
		return v != 0
	case int:
		return v != 0
	}
	return value
}

func parseValueToTime(value any) (time.Time, error) {
	switch v := value.(type) {
	case time.Time:
		return v, nil
	case string:
		return parseOrcaTimeString(v)
	default:
		return time.Time{}, fmt.Errorf("unsupported time value")
	}
}

func parseOrcaTimeString(v string) (time.Time, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return time.Time{}, fmt.Errorf("empty time")
	}

	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006-01-02",
		"02/01/2006 15:04:05",
		"02/01/2006 15:04",
		"02/01/2006",
		"02-01-2006 15:04:05",
		"02-01-2006 15:04",
		"02-01-2006",
		"01/02/2006 15:04:05",
		"01/02/2006 15:04",
		"01/02/2006",
		"2006/01/02 15:04:05",
		"2006/01/02 15:04",
	}

	for _, layout := range layouts {
		if ts, err := time.ParseInLocation(layout, v, time.UTC); err == nil {
			return ts, nil
		}
	}

	return time.Time{}, fmt.Errorf("unable to parse time")
}

func timeFromValue(value any) (time.Time, bool) {
	switch v := value.(type) {
	case time.Time:
		return v, true
	case string:
		if ts, err := parseOrcaTimeString(v); err == nil {
			return ts, true
		}
		return time.Time{}, false
	default:
		return time.Time{}, false
	}
}

func firstTimeField(descriptors []fieldDescriptor) string {
	for _, desc := range descriptors {
		if desc.kind == fieldKindTime {
			return desc.meta.Key
		}
	}
	return ""
}

func buildFieldInfos(descriptors []fieldDescriptor, timeField string) []models.Field {
	if len(descriptors) == 0 {
		return nil
	}

	fields := make([]models.Field, 0, len(descriptors))
	selectedIndex := -1

	for idx, desc := range descriptors {
		label := desc.meta.Label
		if label == "" {
			label = desc.meta.Key
		}

		var decimalsPtr *int
		if desc.hasDecimals && desc.decimals > 0 {
			d := desc.decimals
			decimalsPtr = &d
		}

		field := models.Field{
			Key:         desc.meta.Key,
			Label:       label,
			Type:        desc.meta.Type,
			Format:      desc.meta.Format,
			GrafanaType: desc.kind.grafanaType(),
			IsTime:      desc.kind == fieldKindTime,
			Decimals:    decimalsPtr,
		}

		if timeField != "" && desc.meta.Key == timeField {
			selectedIndex = idx
		}

		fields = append(fields, field)
	}

	if timeField != "" && selectedIndex > 0 {
		selected := fields[selectedIndex]
		copy(fields[1:selectedIndex+1], fields[0:selectedIndex])
		fields[0] = selected
	}

	return fields
}

func fallbackFieldInfos(rows []map[string]any, timeField string) []models.Field {
	if len(rows) == 0 {
		return nil
	}

	seen := make(map[string]struct{})
	keys := make([]string, 0)
	for _, row := range rows {
		for key := range row {
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			keys = append(keys, key)
		}
	}

	decimalsMap := computeFieldDecimals(rows)
	geoMap := detectGeoColumns(rows)
	if timeField != "" {
		for idx, key := range keys {
			if key == timeField && idx > 0 {
				copy(keys[1:idx+1], keys[0:idx])
				keys[0] = key
				break
			}
		}
	}

	fields := make([]models.Field, 0, len(keys))
	added := map[string]struct{}{}
	for _, key := range keys {
		kind := detectKindFromRows(key, rows, fieldKindString)
		var decimalsPtr *int
		if kind == fieldKindNumber {
			if d, ok := decimalsMap[key]; ok && d > 0 {
				dCopy := d
				decimalsPtr = &dCopy
			}
		}
		fields = append(fields, models.Field{
			Key:         key,
			Label:       key,
			GrafanaType: kind.grafanaType(),
			IsTime:      key == timeField || kind == fieldKindTime,
			Decimals:    decimalsPtr,
		})
		added[key] = struct{}{}

		if kind == fieldKindGeo {
			info := geoMap[key]
			latKey := fmt.Sprintf("%s_lat", key)
			lngKey := fmt.Sprintf("%s_lon", key)
			if _, exists := added[latKey]; !exists {
				latDec := info.latDecimals
				var latDecimalsPtr *int
				if latDec > 0 {
					latDecimalsPtr = &latDec
				}
				fields = append(fields, models.Field{
					Key:         latKey,
					Label:       fmt.Sprintf("%s Latitude", key),
					GrafanaType: "number",
					Decimals:    latDecimalsPtr,
				})
				added[latKey] = struct{}{}
			}
			if _, exists := added[lngKey]; !exists {
				lonDec := info.lonDecimals
				var lonDecimalsPtr *int
				if lonDec > 0 {
					lonDecimalsPtr = &lonDec
				}
				fields = append(fields, models.Field{
					Key:         lngKey,
					Label:       fmt.Sprintf("%s Longitude", key),
					GrafanaType: "number",
					Decimals:    lonDecimalsPtr,
				})
				added[lngKey] = struct{}{}
			}
		}
	}
	return fields
}

func extendRowsWithGeo(rows []map[string]any, descriptors map[string]fieldDescriptor) ([]map[string]any, map[string]geoColumnInfo) {
	if len(descriptors) == 0 || len(rows) == 0 {
		return rows, map[string]geoColumnInfo{}
	}

	success := make(map[string]geoColumnInfo)
	extended := make([]map[string]any, 0, len(rows))

	for _, row := range rows {
		out := make(map[string]any, len(row)+4)
		for key, val := range row {
			out[key] = val
		}

		for key, desc := range descriptors {
			if desc.kind != fieldKindGeo {
				continue
			}

			lat, lon, latDec, lonDec, ok := parseGeoValue(row[key])
			if !ok {
				continue
			}

			out[fmt.Sprintf("%s_lat", key)] = lat
			out[fmt.Sprintf("%s_lon", key)] = lon

			info := success[key]
			if latDec > info.latDecimals {
				info.latDecimals = latDec
			}
			if lonDec > info.lonDecimals {
				info.lonDecimals = lonDec
			}
			success[key] = info
		}

		extended = append(extended, out)
	}

	return extended, success
}

func parseGeoValue(val any) (float64, float64, int, int, bool) {
	var raw string
	switch v := val.(type) {
	case string:
		raw = v
	case fmt.Stringer:
		raw = v.String()
	default:
		raw = fmt.Sprint(v)
	}

	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, 0, 0, 0, false
	}

	raw = strings.ReplaceAll(raw, ";", ",")
	raw = strings.ReplaceAll(raw, ", ", ",")
	parts := strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == '|' })
	if len(parts) != 2 {
		return 0, 0, 0, 0, false
	}

	latToken := strings.TrimSpace(parts[0])
	lonToken := strings.TrimSpace(parts[1])

	lat, err1 := strconv.ParseFloat(latToken, 64)
	lon, err2 := strconv.ParseFloat(lonToken, 64)
	if err1 != nil || err2 != nil {
		return 0, 0, 0, 0, false
	}

	if math.Abs(lat) > 90 || math.Abs(lon) > 180 {
		return 0, 0, 0, 0, false
	}

	latDec := decimalsInComponent(latToken)
	lonDec := decimalsInComponent(lonToken)

	return lat, lon, latDec, lonDec, true
}

func decimalsInComponent(token string) int {
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return 0
	}
	trimmed = strings.TrimPrefix(trimmed, "+")
	trimmed = strings.TrimPrefix(trimmed, "-")
	if trimmed == "" {
		return 0
	}
	if idx := strings.Index(trimmed, "."); idx >= 0 {
		return len(trimmed) - idx - 1
	}
	return 0
}

func extendFieldDescriptorsForGeo(list []fieldDescriptor, mapping map[string]fieldDescriptor, success map[string]geoColumnInfo) ([]fieldDescriptor, map[string]fieldDescriptor) {
	extended := make([]fieldDescriptor, 0, len(list))
	newMapping := make(map[string]fieldDescriptor, len(mapping))

	for _, desc := range list {
		extended = append(extended, desc)
		newMapping[desc.meta.Key] = desc

		if desc.kind == fieldKindGeo {
			info, ok := success[desc.meta.Key]
			if !ok {
				continue
			}
			latField := orcaField{
				Key:   fmt.Sprintf("%s_lat", desc.meta.Key),
				Label: fmt.Sprintf("%s Latitude", labelOrKey(desc.meta)),
				Type:  "number",
			}

			lonField := orcaField{
				Key:   fmt.Sprintf("%s_lon", desc.meta.Key),
				Label: fmt.Sprintf("%s Longitude", labelOrKey(desc.meta)),
				Type:  "number",
			}

			latDesc := fieldDescriptor{meta: latField, kind: fieldKindNumber}
			lonDesc := fieldDescriptor{meta: lonField, kind: fieldKindNumber}

			if info.latDecimals > 0 {
				latDesc.decimals = info.latDecimals
				latDesc.hasDecimals = true
			}
			if info.lonDecimals > 0 {
				lonDesc.decimals = info.lonDecimals
				lonDesc.hasDecimals = true
			}

			extended = append(extended, latDesc, lonDesc)
			newMapping[latField.Key] = latDesc
			newMapping[lonField.Key] = lonDesc
		}
	}

	return extended, newMapping
}

func labelOrKey(f orcaField) string {
	if f.Label != "" {
		return f.Label
	}
	return f.Key
}

func resolveTimeField(input string, descriptors []fieldDescriptor, rows []map[string]any) (string, bool) {
	if input == "" {
		return "", false
	}

	for _, desc := range descriptors {
		if strings.EqualFold(desc.meta.Key, input) {
			return desc.meta.Key, true
		}
	}

	for _, desc := range descriptors {
		if desc.meta.Label != "" && strings.EqualFold(desc.meta.Label, input) {
			return desc.meta.Key, true
		}
	}

	for _, row := range rows {
		if row == nil {
			continue
		}
		for key := range row {
			if strings.EqualFold(key, input) {
				return key, true
			}
		}
	}

	return "", false
}

func statusFromError(err error) int {
	var httpErr interface{ Status() int }
	if errors.As(err, &httpErr) {
		return httpErr.Status()
	}

	// Default to 502 for upstream failures, 500 for everything else.
	if strings.Contains(err.Error(), "orcascan api") {
		return http.StatusBadGateway
	}
	return http.StatusInternalServerError
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, apiResponse{"error": err.Error()})
}

func main() {
	ds := newDatasource()
	backend.Logger.Info("Starting Orca Scan backend (SDK v0.281.x)")

	opts := datasource.ServeOpts{
		CallResourceHandler: httpadapter.New(ds.resourcesHandler()),
		QueryDataHandler:    ds,
		CheckHealthHandler:  ds,
	}

	if err := datasource.Serve(opts); err != nil {
		backend.Logger.Error("Failed to start backend", "err", err)
		os.Exit(1)
	}
}
