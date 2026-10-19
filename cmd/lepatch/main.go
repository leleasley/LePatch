package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"lepatch/internal/config"
	"lepatch/internal/events"
	"lepatch/internal/server"
	"lepatch/internal/store"
	"lepatch/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "error", err.Error())
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	db, err := store.Open(ctx, cfg.DatabasePath)
	cancel()
	if err != nil {
		logger.Error("open database", "error", err.Error())
		os.Exit(1)
	}
	defer db.Close()

	hub := events.NewHub(512)
	runner := worker.New(db.DB(), hub, cfg.GitHubToken, cfg.EncryptionKey, logger)
	runner.SetDataDir(cfg.DataDir)
	stop, stopSignal := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignal()
	runner.Start(stop)
	app := server.New(cfg, db, hub, runner, logger)
	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           app.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       90 * time.Second,
	}
	go func() {
		logger.Info("LePatch listening", "address", httpServer.Addr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP server stopped", "error", err.Error())
			os.Exit(1)
		}
	}()

	<-stop.Done()

	shutdown, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdown); err != nil {
		logger.Error("graceful shutdown failed", "error", err.Error())
	}
}
