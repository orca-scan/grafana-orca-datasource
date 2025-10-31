package main

import (
	"testing"
)

func TestComputeFieldDecimals(t *testing.T) {
	rows := []map[string]any{
		{
			"int_as_string":   "42",
			"float_as_string": "12.3450",
			"mixed":           "7.1",
		},
		{
			"float_as_string": "9.8",
			"mixed":           "7.1234",
			"ignored":         "abc",
		},
	}

	got := computeFieldDecimals(rows)

	if got["int_as_string"] != 0 {
		t.Fatalf("expected 0 decimals for int_as_string, got %d", got["int_as_string"])
	}
	if got["float_as_string"] != 4 {
		t.Fatalf("expected trailing decimals to preserve 4 digits, got %d", got["float_as_string"])
	}
	if got["mixed"] != 4 {
		t.Fatalf("expected longest decimal precision 4 for mixed, got %d", got["mixed"])
	}
	if _, exists := got["ignored"]; exists {
		t.Fatalf("expected non-numeric column to be skipped, but found entry: %v", got)
	}
}

func TestParseGeoValue(t *testing.T) {
	lat, lon, latDec, lonDec, ok := parseGeoValue("51.5072, -0.1275")
	if !ok {
		t.Fatal("expected parse success for valid coordinate")
	}
	if lat != 51.5072 || lon != -0.1275 {
		t.Fatalf("unexpected coordinates: lat=%f lon=%f", lat, lon)
	}
	if latDec != 4 || lonDec != 4 {
		t.Fatalf("expected 4 decimals for both components, got lat=%d lon=%d", latDec, lonDec)
	}

	_, _, _, _, ok = parseGeoValue("not,a,coordinate")
	if ok {
		t.Fatal("expected failure for invalid coordinate")
	}
}

func TestDecimalsFromValue(t *testing.T) {
	tests := []struct {
		input    any
		expected int
		ok       bool
	}{
		{"123", 0, true},
		{"-7.890", 3, true},
		{"  3.14159 ", 5, true},
		{"xyz", 0, false},
		{123, 0, true},
	}

	for _, tc := range tests {
		got, ok := decimalsFromValue(tc.input)
		if ok != tc.ok {
			t.Fatalf("input %v: expected ok=%v, got %v", tc.input, tc.ok, ok)
		}
		if got != tc.expected {
			t.Fatalf("input %v: expected %d decimals, got %d", tc.input, tc.expected, got)
		}
	}
}
