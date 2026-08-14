package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/trisacrypto/trisa/pkg/ivms101"
	api "github.com/trisacrypto/trisa/pkg/trisa/api/v1beta1"
	generic "github.com/trisacrypto/trisa/pkg/trisa/data/generic/v1beta1"
	"github.com/trisacrypto/trisa/pkg/trisa/envelope"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/types/known/anypb"
)

// placeholderIdentity is a structurally valid IVMS101 identity used when the caller does
// not supply a full protojson IVMS101 payload. Tukar's design keeps PII off-ledger, so the
// personal fields are marked placeholders — the anchors hold the real KYC out of band. This
// lets a real, sealed TRISA transfer execute against the network without inventing PII.
// Shape and enum forms copied from the trisa module testdata (identity_payload.pb.json).
const placeholderIdentity = `{
  "originator": {
    "originator_persons": [{"natural_person": {"name": {"name_identifiers": [
      {"primary_identifier": "ANCHOR-HELD", "secondary_identifier": "ORIGINATOR", "name_identifier_type": "NATURAL_PERSON_NAME_TYPE_CODE_LEGL"}]}}}],
    "account_numbers": ["ANCHOR-HELD-ORIGINATOR-ACCOUNT"]
  },
  "beneficiary": {
    "beneficiary_persons": [{"natural_person": {"name": {"name_identifiers": [
      {"primary_identifier": "ANCHOR-HELD", "secondary_identifier": "BENEFICIARY", "name_identifier_type": "NATURAL_PERSON_NAME_TYPE_CODE_LEGL"}]}}}],
    "account_numbers": ["ANCHOR-HELD-BENEFICIARY-ACCOUNT"]
  },
  "originating_vasp": {"originating_vasp": {"legal_person": {"name": {"name_identifiers": [
    {"legal_person_name": "Tukar Sending Anchor", "legal_person_name_identifier_type": "LEGAL_PERSON_NAME_TYPE_CODE_LEGL"}]}}}},
  "beneficiary_vasp": {"beneficiary_vasp": {"legal_person": {"name": {"name_identifiers": [
    {"legal_person_name": "Tukar Receiving Anchor", "legal_person_name_identifier_type": "LEGAL_PERSON_NAME_TYPE_CODE_LEGL"}]}}}}
}`

var protojsonUnmarshal = protojson.UnmarshalOptions{AllowPartial: true, DiscardUnknown: true}

// buildIdentity turns the JSON the HTTP bridge received into an IVMS101 identity packed in
// an anypb.Any. A full protojson IVMS101 payload is used as-is; anything else (including
// Tukar's own IVMS101-shaped JSON, whose field names differ from the protobuf) falls back
// to the placeholder identity so a real transfer can still be sealed and sent.
func buildIdentity(raw json.RawMessage) (*anypb.Any, error) {
	id := &ivms101.IdentityPayload{}
	if len(raw) > 0 {
		if err := protojsonUnmarshal.Unmarshal(raw, id); err != nil || id.Originator == nil || id.Beneficiary == nil {
			log.Printf("ivms101: payload is not full protojson IVMS101, using placeholder identity (anchors hold PII)")
			id = &ivms101.IdentityPayload{}
			if err := protojson.Unmarshal([]byte(placeholderIdentity), id); err != nil {
				return nil, fmt.Errorf("could not build placeholder identity: %w", err)
			}
		}
	} else {
		if err := protojson.Unmarshal([]byte(placeholderIdentity), id); err != nil {
			return nil, fmt.Errorf("could not build placeholder identity: %w", err)
		}
	}
	return anypb.New(id)
}

// buildTransaction builds a generic TRISA transaction proto from the bridge request fields.
// A transaction is required by the envelope payload validator.
func buildTransaction(amount float64, network, txid, asset string) (*anypb.Any, error) {
	if network == "" {
		network = "Stellar"
	}
	return anypb.New(&generic.Transaction{
		Txid:      txid,
		Amount:    amount,
		Network:   network,
		AssetType: asset,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// validateIdentityAny checks a received envelope's identity is a parseable IVMS101 payload
// with an originator and beneficiary. Returns a TRISA error (for a rejection envelope) or nil.
func validateIdentityAny(id *anypb.Any) *api.Error {
	if id == nil {
		return api.Errorf(api.Error_MISSING_FIELDS, "envelope carries no identity payload")
	}
	ip := &ivms101.IdentityPayload{}
	if err := id.UnmarshalTo(ip); err != nil {
		return api.Errorf(api.Error_UNPARSEABLE_IDENTITY, "identity is not a valid IVMS101 payload: %s", err)
	}
	if ip.Originator == nil || ip.Beneficiary == nil {
		return api.Errorf(api.Error_INCOMPLETE_IDENTITY, "IVMS101 identity is missing an originator or beneficiary")
	}
	return nil
}

// rejectEnvelope wraps a TRISA error into an unsealed rejection SecureEnvelope, the
// spec-correct way to answer a Transfer that cannot be processed.
func rejectEnvelope(id string, e *api.Error) (*api.SecureEnvelope, error) {
	msg, err := envelope.Reject(e, envelope.WithEnvelopeID(id))
	if err != nil {
		return nil, err
	}
	return msg, nil
}
