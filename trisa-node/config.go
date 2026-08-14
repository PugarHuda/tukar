package main

import (
	"fmt"
	"os"
)

// Config is loaded entirely from the environment. No cert material or secret is ever
// hardcoded; the paths and password point at files the operator installs after the GDS
// issues certificates (see README). Nothing here invents an endpoint or a credential.
type Config struct {
	ListenAddr    string // mTLS gRPC TRISA endpoint peers dial, e.g. :4433
	BridgeAddr    string // localhost HTTP bridge for the Next.js app, e.g. 127.0.0.1:8091
	CertsPath     string // identity certificate archive (zip/pem/pkcs12) from the GDS
	ChainPath     string // trust chain pool; defaults to CertsPath when the archive bundles it
	CertsPassword string // PKCS12 password, when the archive is encrypted (may be empty)
	Directory     string // GDS lookup endpoint, e.g. api.trisatest.net:443 (testnet)
	CommonName    string // our own registered common name, used in transfer metadata
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// LoadConfig reads the environment. It fails only for the two things the node cannot run
// without: a certificate path and a directory endpoint. Everything else has a sane default.
func LoadConfig() (*Config, error) {
	c := &Config{
		ListenAddr:    env("LISTEN_ADDR", ":4433"),
		BridgeAddr:    env("BRIDGE_ADDR", "127.0.0.1:8091"),
		CertsPath:     os.Getenv("TRISA_CERTS"),
		ChainPath:     os.Getenv("TRISA_CHAIN"),
		CertsPassword: os.Getenv("TRISA_CERTS_PASSWORD"),
		Directory:     env("DIRECTORY", "api.trisatest.net:443"),
		CommonName:    os.Getenv("TRISA_COMMON_NAME"),
	}
	if c.CertsPath == "" {
		return nil, fmt.Errorf("TRISA_CERTS is required (path to the identity certificate archive issued by the GDS)")
	}
	if c.ChainPath == "" {
		c.ChainPath = c.CertsPath // the issued archive usually bundles the trust chain
	}
	if c.Directory == "" {
		return nil, fmt.Errorf("DIRECTORY is required (GDS lookup endpoint, e.g. api.trisatest.net:443)")
	}
	return c, nil
}
