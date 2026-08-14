package main

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"fmt"
	"log"
	"time"

	api "github.com/trisacrypto/trisa/pkg/trisa/api/v1beta1"
	"github.com/trisacrypto/trisa/pkg/trisa/envelope"
	"github.com/trisacrypto/trisa/pkg/trisa/peers"
	"github.com/trisacrypto/trisa/pkg/trust"
	"google.golang.org/protobuf/types/known/anypb"
)

// Node holds the mTLS identity and the peer/directory client. It is both a TRISA server
// (receives Transfer/KeyExchange from other VASPs over mTLS) and a TRISA client (looks a
// counterparty up in the GDS, seals an IVMS101 envelope, and sends it a Transfer).
type Node struct {
	api.UnimplementedTRISANetworkServer

	cfg   *Config
	certs *trust.Provider
	pool  trust.ProviderPool
	priv  *rsa.PrivateKey
	peers *peers.Peers
}

// NewNode loads the certificate archive the operator installed (never generated here),
// builds the trust pool, and wires the GDS peer client. All of this fails loudly if the
// cert material is missing or unreadable — the node will not start without real certs.
func NewNode(cfg *Config) (*Node, error) {
	// A private serializer decrypts a PKCS12 archive when a password is set; otherwise the
	// serializer reads a PEM/zip bundle. This mirrors the reference trisa CLI (cmd/trisa).
	var sz *trust.Serializer
	var err error
	if cfg.CertsPassword != "" {
		sz, err = trust.NewSerializer(true, cfg.CertsPassword)
	} else {
		sz, err = trust.NewSerializer(false)
	}
	if err != nil {
		return nil, fmt.Errorf("could not init cert serializer: %w", err)
	}

	certs, err := sz.ReadFile(cfg.CertsPath)
	if err != nil {
		return nil, fmt.Errorf("could not read identity certs from %s: %w", cfg.CertsPath, err)
	}
	pool, err := sz.ReadPoolFile(cfg.ChainPath)
	if err != nil {
		return nil, fmt.Errorf("could not read trust chain from %s: %w", cfg.ChainPath, err)
	}
	priv, err := certs.GetRSAKeys()
	if err != nil {
		return nil, fmt.Errorf("identity cert has no usable RSA key (needed to unseal envelopes): %w", err)
	}

	return &Node{
		cfg:   cfg,
		certs: certs,
		pool:  pool,
		priv:  priv,
		peers: peers.New(certs, pool, cfg.Directory),
	}, nil
}

// ---- Server side: RPCs other VASPs call on us over mTLS ----

// Transfer receives a sealed envelope, unseals it with our private key, validates the
// IVMS101 identity, and returns a compliant response sealed back to the caller. A protocol
// rejection (bad key, invalid payload) is returned as a TRISA error envelope, not a gRPC
// error, which is what the spec expects.
func (n *Node) Transfer(ctx context.Context, in *api.SecureEnvelope) (*api.SecureEnvelope, error) {
	env, reject, err := envelope.Open(in, envelope.WithRSAPrivateKey(n.priv))
	if err != nil {
		if reject != nil {
			return rejectEnvelope(in.Id, reject)
		}
		return rejectEnvelope(in.Id, api.Errorf(api.Error_UNHANDLED, "could not open envelope: %s", err))
	}

	payload, err := env.Payload()
	if err != nil {
		return rejectEnvelope(in.Id, api.Errorf(api.Error_MISSING_FIELDS, "no payload after unseal: %s", err))
	}

	if rej := validateIdentityAny(payload.Identity); rej != nil {
		return rejectEnvelope(in.Id, rej)
	}
	log.Printf("transfer %s: unsealed and validated IVMS101 identity", in.Id)

	// Build the beneficiary response: echo the identity, stamp ReceivedAt, keep the
	// transaction. Seal it back to the originator using their signing key (from the GDS
	// lookup of the common name on their client cert).
	resp := &api.Payload{
		Identity:    payload.Identity,
		Transaction: payload.Transaction,
		SentAt:      payload.SentAt,
		ReceivedAt:  time.Now().UTC().Format(time.RFC3339),
	}

	key, err := n.callerKey(ctx)
	if err != nil {
		// We validated the request but cannot seal a reply to an unknown caller. A pending
		// error envelope is a valid TRISA response.
		return rejectEnvelope(in.Id, api.Errorf(api.Error_NO_SIGNING_KEY, "could not resolve caller signing key: %s", err))
	}

	out, reject, err := envelope.Seal(resp, envelope.WithRSAPublicKey(key), envelope.WithEnvelopeID(in.Id))
	if err != nil {
		if reject != nil {
			return rejectEnvelope(in.Id, reject)
		}
		return rejectEnvelope(in.Id, api.Errorf(api.Error_INTERNAL_ERROR, "could not seal response: %s", err))
	}
	return out.Proto(), nil
}

// KeyExchange returns our leaf public signing key so a peer can seal an envelope to us.
// Mirrors how peers.Peer.ExchangeKeys builds its request from the leaf certificate.
func (n *Node) KeyExchange(ctx context.Context, in *api.SigningKey) (*api.SigningKey, error) {
	leaf, err := n.certs.GetLeafCertificate()
	if err != nil {
		return nil, fmt.Errorf("no leaf certificate available: %w", err)
	}
	out := &api.SigningKey{
		Version:            int64(leaf.Version),
		Signature:          leaf.Signature,
		SignatureAlgorithm: leaf.SignatureAlgorithm.String(),
		PublicKeyAlgorithm: leaf.PublicKeyAlgorithm.String(),
		NotBefore:          leaf.NotBefore.Format(time.RFC3339),
		NotAfter:           leaf.NotAfter.Format(time.RFC3339),
	}
	if out.Data, err = x509.MarshalPKIXPublicKey(leaf.PublicKey); err != nil {
		return nil, fmt.Errorf("could not marshal public key: %w", err)
	}
	return out, nil
}

// callerKey identifies the calling peer from its mTLS client certificate, then resolves its
// signing key via the GDS (Lookup fills the signing certificate; a dial-back KeyExchange is
// the fallback). Returns the RSA public key to seal the response with.
func (n *Node) callerKey(ctx context.Context) (*rsa.PublicKey, error) {
	peer, err := n.peers.FromContext(ctx)
	if err != nil {
		return nil, err
	}
	if _, err = n.peers.Lookup(peer.Info().CommonName); err == nil {
		if key := peer.SigningKey(); key != nil {
			return key, nil
		}
	}
	return peer.ExchangeKeys(false)
}

// ---- Client side: we originate a transfer to a counterparty ----

// TransferResult is the decoded outcome of an outbound transfer, returned to the HTTP bridge.
type TransferResult struct {
	EnvelopeID    string `json:"envelopeId"`
	Beneficiary   string `json:"beneficiary"`
	Endpoint      string `json:"endpoint"`
	TransferState string `json:"transferState"`
	ReceivedAt    string `json:"receivedAt,omitempty"`
	Rejected      string `json:"rejected,omitempty"`
}

// SendTransfer looks the beneficiary VASP up in the GDS by common name, exchanges keys,
// seals the IVMS101 payload, sends the Transfer over mTLS, and opens the reply with our
// private key. This is the real VASP-to-VASP exchange a serverless function cannot perform.
func (n *Node) SendTransfer(beneficiaryCommonName string, identity *anypb.Any, txn *anypb.Any) (*TransferResult, error) {
	peer, err := n.peers.Lookup(beneficiaryCommonName)
	if err != nil {
		return nil, fmt.Errorf("GDS lookup for %q failed: %w", beneficiaryCommonName, err)
	}
	sealKey, err := peer.ExchangeKeys(false)
	if err != nil {
		return nil, fmt.Errorf("key exchange with %q failed: %w", beneficiaryCommonName, err)
	}

	payload := &api.Payload{
		Identity:    identity,
		Transaction: txn,
		SentAt:      time.Now().UTC().Format(time.RFC3339),
	}
	env, reject, err := envelope.Seal(payload, envelope.WithRSAPublicKey(sealKey))
	if err != nil {
		if reject != nil {
			return nil, fmt.Errorf("payload rejected before send: %s", reject.Message)
		}
		return nil, fmt.Errorf("could not seal envelope: %w", err)
	}

	rep, err := peer.Transfer(env.Proto())
	if err != nil {
		return nil, fmt.Errorf("transfer RPC failed: %w", err)
	}

	info := peer.Info()
	result := &TransferResult{
		EnvelopeID:    rep.Id,
		Beneficiary:   info.CommonName,
		Endpoint:      info.Endpoint,
		TransferState: rep.TransferState.String(),
	}

	// A response can carry a TRISA error instead of a sealed payload; surface it honestly.
	if rep.Error != nil && !rep.Error.IsZero() {
		result.Rejected = rep.Error.Message
		return result, nil
	}

	out, reject, err := envelope.Open(rep, envelope.WithRSAPrivateKey(n.priv))
	if err != nil {
		if reject != nil {
			result.Rejected = reject.Message
			return result, nil
		}
		return nil, fmt.Errorf("could not open response envelope: %w", err)
	}
	if outPayload, err := out.Payload(); err == nil {
		result.ReceivedAt = outPayload.ReceivedAt
	}
	return result, nil
}
