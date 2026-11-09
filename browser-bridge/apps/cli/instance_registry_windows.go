//go:build windows

package main

import "os"

// Windows has no POSIX ownership on FileInfo; the Unix-socket registry is not
// used there yet, so this only keeps the CLI compiling for the desktop package.
func ownedByCurrentUser(os.FileInfo) bool {
	return false
}
