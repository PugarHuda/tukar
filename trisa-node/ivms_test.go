package main

import (
	"encoding/json"
	"testing"
)

// Checks the identity round-trip: the placeholder must be valid IVMS101, a Tukar-shaped
// JSON body (whose field names differ from the protobuf) must fall back to the placeholder,
// and the result must pass the receive-side validator. If any of these breaks, a real
// transfer would seal a malformed identity or reject a valid one.
func TestBuildAndValidateIdentity(t *testing.T) {
	// Empty body -> placeholder identity, which must validate.
	id, err := buildIdentity(nil)
	if err != nil {
		t.Fatalf("placeholder identity build failed: %v", err)
	}
	if rej := validateIdentityAny(id); rej != nil {
		t.Fatalf("placeholder identity did not validate: %s", rej.Message)
	}

	// Tukar's own IVMS101-shaped JSON (camelCase, non-protobuf field names) -> fallback.
	tukarShaped := json.RawMessage(`{"originatingVASP":{"role":"x"},"beneficiaryVASP":{},"originator":{},"beneficiary":{},"transaction":{"amount":"250.00"}}`)
	id2, err := buildIdentity(tukarShaped)
	if err != nil {
		t.Fatalf("fallback identity build failed: %v", err)
	}
	if rej := validateIdentityAny(id2); rej != nil {
		t.Fatalf("fallback identity did not validate: %s", rej.Message)
	}

	// A nil identity must be rejected by the receive-side validator.
	if rej := validateIdentityAny(nil); rej == nil {
		t.Fatal("nil identity should be rejected")
	}
}

func TestBuildTransaction(t *testing.T) {
	txn, err := buildTransaction(250.0, "", "tx123", "USDC")
	if err != nil {
		t.Fatalf("buildTransaction failed: %v", err)
	}
	if txn == nil {
		t.Fatal("expected a transaction any")
	}
}
