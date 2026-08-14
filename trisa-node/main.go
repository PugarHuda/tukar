// Command trisa-node is Tukar's always-on TRISA companion node. It hosts the two things a
// serverless function cannot: a stable, mTLS-authenticated gRPC endpoint that TRISA peers
// dial, and an outbound client that looks a counterparty up in the Global TRISA Directory,
// seals an IVMS101 envelope, and performs a real Travel Rule Transfer. A localhost HTTP
// bridge lets the Next.js app drive it.
//
// It will not start without real certificate material issued by the GDS (see README).
package main

import (
	"log"
	"net"
	"net/http"

	api "github.com/trisacrypto/trisa/pkg/trisa/api/v1beta1"
	"github.com/trisacrypto/trisa/pkg/trisa/mtls"
	"google.golang.org/grpc"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	node, err := NewNode(cfg)
	if err != nil {
		log.Fatalf("could not initialize node (check TRISA_CERTS): %v", err)
	}

	// mTLS gRPC server: the inbound TRISA surface peers dial. Credentials come from the
	// installed identity cert + trust pool; connections require a verified client cert.
	creds, err := mtls.ServerCreds(node.certs, node.pool)
	if err != nil {
		log.Fatalf("could not build mTLS server credentials: %v", err)
	}
	srv := grpc.NewServer(creds)
	api.RegisterTRISANetworkServer(srv, node)

	lis, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		log.Fatalf("could not listen on %s: %v", cfg.ListenAddr, err)
	}

	// Localhost HTTP bridge for the Next.js app.
	go func() {
		log.Printf("HTTP bridge listening on http://%s (POST /trisa/transfer, GET /healthz)", cfg.BridgeAddr)
		if err := http.ListenAndServe(cfg.BridgeAddr, node.Bridge()); err != nil {
			log.Fatalf("bridge server failed: %v", err)
		}
	}()

	log.Printf("TRISA node listening on %s (mTLS), directory %s", cfg.ListenAddr, cfg.Directory)
	if err := srv.Serve(lis); err != nil {
		log.Fatalf("gRPC server failed: %v", err)
	}
}
