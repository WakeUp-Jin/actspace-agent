package main

import (
	"fmt"
	"io"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

func cmdServe(args []string, stdout, stderr io.Writer) int {
	socketPath := ""
	timeoutSec := 300

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--socket":
			i++
			if i >= len(args) {
				fmt.Fprintln(stderr, "--socket requires a value")
				return 2
			}
			socketPath = args[i]
		case "--timeout":
			i++
			if i >= len(args) {
				fmt.Fprintln(stderr, "--timeout requires a value")
				return 2
			}
			v, err := strconv.Atoi(args[i])
			if err != nil {
				fmt.Fprintf(stderr, "invalid --timeout value: %s\n", args[i])
				return 2
			}
			timeoutSec = v
		case "--help", "-h":
			fmt.Fprintln(stdout, "Usage: abb serve --socket <path> [--timeout <seconds>]")
			fmt.Fprintln(stdout, "")
			fmt.Fprintln(stdout, "Start a socket server for long-lived agent connections.")
			fmt.Fprintln(stdout, "")
			fmt.Fprintln(stdout, "Options:")
			fmt.Fprintln(stdout, "  --socket <path>    Unix socket path to listen on (required)")
			fmt.Fprintln(stdout, "  --timeout <sec>    Idle timeout in seconds (default: 300)")
			return 0
		default:
			fmt.Fprintf(stderr, "unknown option: %s\n", args[i])
			return 2
		}
	}

	if socketPath == "" {
		fmt.Fprintln(stderr, "error: --socket is required")
		fmt.Fprintln(stderr, "Usage: abb serve --socket <path>")
		return 2
	}

	idleTimeout := time.Duration(timeoutSec) * time.Second
	srv, err := NewServer(socketPath, idleTimeout)
	if err != nil {
		fmt.Fprintf(stderr, "failed to start server: %s\n", err)
		return 1
	}

	fmt.Fprintf(stderr, "[abb] listening on %s (idle timeout: %ds)\n", socketPath, timeoutSec)
	srv.Start()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	fmt.Fprintln(stderr, "[abb] shutting down...")
	srv.Stop()
	return 0
}
