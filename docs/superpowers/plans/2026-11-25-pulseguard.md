# PulseGuard Implementation Plan

> **For agentic workers:** Implementing task-by-task using TDD and verification-before-completion.

**Goal:** Build a clean, modern, single-admin self-hosted Uptime & Incident Monitor (`PulseGuard`) with HTTP/API/TCP monitoring, latency charts, 3-strike Down + single-shot Up alerts (Telegram/Discord/Webhook), and a 90-day Public Status Page supporting manual incidents and planned maintenance.

**Architecture:** Single-process TypeScript monorepo (`server/` + `web/`) using Hono on Node.js v26 with native `node:sqlite` (WAL mode), Zod validation, and a React + Vite + Tailwind CSS v4 + Recharts frontend.

**Tech Stack:** Node.js 26, TypeScript, Hono, `node:sqlite`, Zod, Vitest, React 19, Vite, Tailwind CSS v4, Recharts, `@phosphor-icons/react`, Docker.

---

- [x] **Task 1: Documentation (`ARCHITECTURE.md`, `DESIGN.md`, Plan)**
- [x] **Task 2: Monorepo Scaffold, SQLite Schema & Migrations (TDD)**
- [x] **Task 3: Auth, Security & Validation Layer (TDD)**
- [x] **Task 4: Monitoring Prober, 3-Strike State Machine & Scheduler (TDD)**
- [x] **Task 5: Notification Dispatchers — Telegram, Discord, Webhook (TDD)**
- [x] **Task 6: Hono REST API & Integration Tests (TDD)**
- [x] **Task 7: Frontend (`web/`) Built Strictly to `DESIGN.md`**
- [x] **Task 8: Docker Self-Hosting Files (`Dockerfile`, `docker-compose.yml`)**
- [x] **Task 9: Verification, Impeccable Visual Polish & End-to-End Browser Testing**
