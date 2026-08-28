package main

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

// bridgeRequest is the body the Next.js app POSTs to /trisa/transfer. beneficiaryVASP is
// the counterparty's directory common name (e.g. api.bob.vaspbot.net); ivms101 is the
// identity payload; the transaction fields describe the settlement.
type bridgeRequest struct {
	BeneficiaryVASP string          `json:"beneficiaryVASP"`
	IVMS101         json.RawMessage `json:"ivms101"`
	Amount          float64         `json:"amount"`
	Network         string          `json:"network"`
	Txid            string          `json:"txid"`
	Asset           string          `json:"asset"`
}

// Bridge is a localhost HTTP shim so a serverless Next.js route can drive the always-on
// TRISA node. It is bound to localhost by default (see BRIDGE_ADDR); /trisa/transfer also
// requires the shared bearer token (TRISA_BRIDGE_TOKEN) so the transfer surface is never open
// even when the bridge is reachable. /healthz stays unauthenticated for liveness probes. The
// mTLS-protected surface is the gRPC server.
func (n *Node) Bridge() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":     "ok",
			"directory":  n.cfg.Directory,
			"listen":     n.cfg.ListenAddr,
			"commonName": n.cfg.CommonName,
		})
	})

	mux.HandleFunc("POST /trisa/transfer", func(w http.ResponseWriter, r *http.Request) {
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if subtle.ConstantTimeCompare([]byte(got), []byte(n.cfg.BridgeToken)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "missing or invalid bridge token"})
			return
		}

		var req bridgeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "invalid JSON body"})
			return
		}
		if req.BeneficiaryVASP == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "beneficiaryVASP (directory common name) is required"})
			return
		}

		identity, err := buildIdentity(req.IVMS101)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		txn, err := buildTransaction(req.Amount, req.Network, req.Txid, req.Asset)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
			return
		}

		result, err := n.SendTransfer(req.BeneficiaryVASP, identity, txn)
		if err != nil {
			log.Printf("bridge transfer to %s failed: %v", req.BeneficiaryVASP, err)
			writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": result.Rejected == "", "result": result})
	})

	return mux
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
