package main

import (
	"context"
	"fmt"
	"os"
	"sort"
	"time"

	"lepatch/internal/store"
)

func main() {
	source := os.Getenv("SOURCE_DATABASE_URL")
	target := os.Getenv("TARGET_DATABASE_PATH")
	if source == "" || target == "" {
		fmt.Fprintln(os.Stderr, "Set SOURCE_DATABASE_URL and TARGET_DATABASE_PATH. The target file must not already exist.")
		os.Exit(2)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	counts, err := store.ImportPostgres(ctx, source, target)
	if err != nil {
		fmt.Fprintf(os.Stderr, "PostgreSQL import failed: %v\n", err)
		os.Exit(1)
	}
	tables := make([]string, 0, len(counts))
	for table := range counts {
		tables = append(tables, table)
	}
	sort.Strings(tables)
	for _, table := range tables {
		fmt.Printf("%s: %d rows\n", table, counts[table])
	}
	fmt.Printf("Imported database to %s\n", target)
}
