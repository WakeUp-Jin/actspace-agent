package main

import (
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestNativeHostInstancesDoNotStealSockets(t *testing.T) {
	root, err := os.MkdirTemp("/tmp", "abb-i-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(root) })
	t.Setenv("ABB_SUPPORT_DIR", root)
	t.Setenv("ABB_SOCKET", "")
	first, err := newNativeHostSocketPath()
	if err != nil {
		t.Fatal(err)
	}
	second, err := newNativeHostSocketPath()
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("host sockets must be unique")
	}
	for _, socket := range []string{first, second} {
		listener, err := net.Listen("unix", socket)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { listener.Close(); os.Remove(socket) })
		if err := os.Chmod(socket, 0600); err != nil {
			t.Fatal(err)
		}
		if err := publishNativeHostInstance(socket, "12345678-1234-1234-1234-123456789abc", "0.2.2", "0.2.0"); err != nil {
			t.Fatal(err)
		}
	}
	instances := activeNativeHostInstances()
	if len(instances) != 2 {
		t.Fatalf("expected two instances, got %d", len(instances))
	}
	if got := defaultSocketPath(); got != "" {
		t.Fatalf("ambiguous instance must not select a socket: %q", got)
	}
	if _, err := sendCLIRequest("", "agent_browser_bridge.ping", nil); err == nil {
		t.Fatal("ambiguous CLI request must fail")
	}
	if err := os.WriteFile(filepath.Join(root, "instances", "bad.json"), []byte(`{"socketPath":"/tmp/unowned.sock"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if got := len(activeNativeHostInstances()); got != 2 {
		t.Fatalf("malformed record admitted: %d", got)
	}
}
