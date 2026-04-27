CREATE TABLE `edge` (
	`id` text PRIMARY KEY NOT NULL,
	`src` text NOT NULL,
	`dst` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('realizes','constrains','decides','justifies','supersedes','syncs_with','depends_on','produced_by','references')),
	`weight` real DEFAULT 1 NOT NULL,
	`body` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`src`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dst`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action
) STRICT, WITHOUT ROWID;
--> statement-breakpoint
CREATE UNIQUE INDEX `edge_unique` ON `edge` (`src`,`dst`,`kind`) WHERE "edge"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `edge_src` ON `edge` (`src`,`kind`);--> statement-breakpoint
CREATE INDEX `edge_dst` ON `edge` (`dst`,`kind`);--> statement-breakpoint
CREATE TABLE `event_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`actor` text NOT NULL,
	`kind` text NOT NULL,
	`task_id` text,
	`trace_id` text,
	`payload` blob NOT NULL,
	`prev_hash` blob,
	`hash` blob NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action
) STRICT;
--> statement-breakpoint
CREATE INDEX `event_log_ts` ON `event_log` (`ts`);--> statement-breakpoint
CREATE INDEX `event_log_task` ON `event_log` (`task_id`);--> statement-breakpoint
CREATE TABLE `fence_seq` (
	`next` integer NOT NULL
) STRICT;
--> statement-breakpoint
INSERT INTO `fence_seq` (`next`) VALUES (1);
--> statement-breakpoint
CREATE TABLE `lease` (
	`node_id` text NOT NULL,
	`scope` text NOT NULL CHECK (`scope` IN ('mutate','drift-fix','verify','plan')),
	`holder` text NOT NULL,
	`reason` text,
	`expires_at` integer NOT NULL,
	`acquired_at` integer NOT NULL,
	`fence_token` integer NOT NULL,
	PRIMARY KEY(`node_id`, `scope`),
	FOREIGN KEY (`node_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action
) STRICT, WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `lease_expiry` ON `lease` (`expires_at`);--> statement-breakpoint
CREATE TABLE `node` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('intent','constraint','rationale','decision','concept','code_module','code_symbol','counterexample','task')),
	`title` text NOT NULL,
	`body` text NOT NULL,
	`confidence` text NOT NULL CHECK (`confidence` IN ('extracted','inferred','semantic','asserted')),
	`parent_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action
) STRICT, WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `node_kind_updated` ON `node` (`kind`,`updated_at`);--> statement-breakpoint
CREATE INDEX `node_parent` ON `node` (`parent_id`);--> statement-breakpoint
CREATE TABLE `obligation` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_node_id` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('property','typecheck','formal','example','metamorphic')),
	`source` text NOT NULL CHECK (`source` IN ('llm','human','mined')),
	`test_code` text NOT NULL,
	`rationale` text,
	`status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','verified','failed','rejected')),
	`filters_passed` text DEFAULT '[]' NOT NULL,
	`counterexample_node_id` text,
	`last_run_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`intent_node_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counterexample_node_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action
) STRICT, WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `obligation_intent` ON `obligation` (`intent_node_id`);--> statement-breakpoint
CREATE TABLE `retrieval` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text,
	`query_hash` text NOT NULL,
	`query_text` text,
	`seed_node_ids` text NOT NULL,
	`ppr_top_k` text NOT NULL,
	`algorithm` text NOT NULL CHECK (`algorithm` IN ('vec_only','vec+ppr','bm25','hybrid')),
	`embedding_model` text,
	`k` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trace_id`) REFERENCES `trace_event`(`trace_id`) ON UPDATE no action ON DELETE no action
) STRICT, WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `retrieval_query_hash` ON `retrieval` (`query_hash`);--> statement-breakpoint
CREATE TABLE `row_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`tx_id` integer,
	`tbl` text NOT NULL,
	`op` text NOT NULL CHECK (`op` IN ('I','U','D')),
	`rowid` integer,
	`before` text,
	`after` text
) STRICT;
--> statement-breakpoint
CREATE TABLE `trace_event` (
	`trace_id` text PRIMARY KEY NOT NULL,
	`parent_trace_id` text,
	`task_node_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`capability_id` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('model_call','tool_call','retrieval','verifier','monitor','mutation')),
	`model` text,
	`model_version` text,
	`provider` text,
	`prompt_hash` text,
	`prompt_text` text,
	`reasoning_hash` text,
	`reasoning_text` text,
	`tool_calls` text,
	`retrieved_node_ids` text,
	`produced_mutations` text,
	`verifier_outcomes` text,
	`monitor_verdict` text,
	`probe_results` text,
	`usage` text NOT NULL,
	`cost_usd` real NOT NULL,
	`latency_ms` integer NOT NULL,
	`ttft_ms` integer,
	`status` text NOT NULL CHECK (`status` IN ('ok','error','guardrail_tripped')),
	`error` text,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	FOREIGN KEY (`parent_trace_id`) REFERENCES `trace_event`(`trace_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_node_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action
) STRICT, WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `te_task` ON `trace_event` (`task_node_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `te_parent` ON `trace_event` (`parent_trace_id`);--> statement-breakpoint
CREATE INDEX `te_flagged` ON `trace_event` (json_extract(`monitor_verdict`, '$.flagged'));--> statement-breakpoint
CREATE VIEW `task_active` AS select "id", json_extract("body", '$.status') as "status", json_extract("body", '$.capability_id') as "capability_id", json_extract("body", '$.parent_task_id') as "parent_task_id", "updated_at" from "node" where "node"."kind" = 'task' AND "node"."deleted_at" IS NULL AND json_extract("node"."body", '$.status') IN ('proposed','leased','running','produced','monitor_pending');
--> statement-breakpoint
-- §4.10 vec0 virtual tables are NOT created in this migration. Per ADR-0015:28
-- the sqlite-vec extension load is gated by phase-5 wiring, and
-- `CREATE VIRTUAL TABLE ... USING vec0` requires the module to be registered
-- at parse time — `IF NOT EXISTS` does not avoid the parse-time module lookup.
-- Applying vec0 DDL here would crash bootstrap on every fresh DB until phase 5
-- lands the extension load. Instead, the DDL ships as exported `sql\`\``
-- constants `createVecIntentTable` / `createVecCodeTable` from
-- `packages/skill/src/db/schema.ts`; the runtime applies them at startup
-- AFTER the sqlite-vec extension is loaded. This is consistent with
-- ADR-0015's "the DDL lives in the migration; the extension load is gated by
-- phase-5 wiring" — read in the spirit it was written, the migration *system*
-- (schema-as-TS exports + a deferred apply) carries the DDL even though this
-- one .sql file does not.
--> statement-breakpoint
-- §4.9 AFTER triggers per ADR-0015:29 — CDC capture for the four tracked
-- tables (node, edge, obligation, lease). Inert until phase 4 (when
-- AgentRunner mutations correlate `tx_id` with `event_log.id`); the
-- trigger contract ships day 1 so the audit table's shape is visible
-- end-to-end. Each trigger writes an `I`/`U`/`D` row capturing a JSON
-- snapshot of the affected row's columns.
--
-- All four tracked tables are `WITHOUT ROWID`, so SQLite does not expose
-- a `rowid` to the trigger context (https://www.sqlite.org/withoutrowid.html).
-- `row_audit.rowid` is therefore stored as NULL on these inserts; the
-- persistent identity is in the JSON snapshot's logical PK fields
-- (node.id, edge.id, obligation.id, lease.{node_id,scope}). Future tables
-- on rowid-bearing storage may use the rowid column for human debugging.
CREATE TRIGGER IF NOT EXISTS `row_audit_node_insert` AFTER INSERT ON `node` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'node', 'I', NULL, NULL,
		json_object('id', NEW.id, 'kind', NEW.kind, 'title', NEW.title, 'body', NEW.body, 'confidence', NEW.confidence, 'parent_id', NEW.parent_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at)
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_node_update` AFTER UPDATE ON `node` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'node', 'U', NULL,
		json_object('id', OLD.id, 'kind', OLD.kind, 'title', OLD.title, 'body', OLD.body, 'confidence', OLD.confidence, 'parent_id', OLD.parent_id, 'version', OLD.version, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at),
		json_object('id', NEW.id, 'kind', NEW.kind, 'title', NEW.title, 'body', NEW.body, 'confidence', NEW.confidence, 'parent_id', NEW.parent_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at)
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_node_delete` AFTER DELETE ON `node` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'node', 'D', NULL,
		json_object('id', OLD.id, 'kind', OLD.kind, 'title', OLD.title, 'body', OLD.body, 'confidence', OLD.confidence, 'parent_id', OLD.parent_id, 'version', OLD.version, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at),
		NULL
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_edge_insert` AFTER INSERT ON `edge` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'edge', 'I', NULL, NULL,
		json_object('id', NEW.id, 'src', NEW.src, 'dst', NEW.dst, 'kind', NEW.kind, 'weight', NEW.weight, 'body', NEW.body, 'created_at', NEW.created_at, 'deleted_at', NEW.deleted_at)
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_edge_update` AFTER UPDATE ON `edge` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'edge', 'U', NULL,
		json_object('id', OLD.id, 'src', OLD.src, 'dst', OLD.dst, 'kind', OLD.kind, 'weight', OLD.weight, 'body', OLD.body, 'created_at', OLD.created_at, 'deleted_at', OLD.deleted_at),
		json_object('id', NEW.id, 'src', NEW.src, 'dst', NEW.dst, 'kind', NEW.kind, 'weight', NEW.weight, 'body', NEW.body, 'created_at', NEW.created_at, 'deleted_at', NEW.deleted_at)
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_edge_delete` AFTER DELETE ON `edge` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'edge', 'D', NULL,
		json_object('id', OLD.id, 'src', OLD.src, 'dst', OLD.dst, 'kind', OLD.kind, 'weight', OLD.weight, 'body', OLD.body, 'created_at', OLD.created_at, 'deleted_at', OLD.deleted_at),
		NULL
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_obligation_insert` AFTER INSERT ON `obligation` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'obligation', 'I', NULL, NULL,
		json_object('id', NEW.id, 'intent_node_id', NEW.intent_node_id, 'kind', NEW.kind, 'source', NEW.source, 'test_code', NEW.test_code, 'rationale', NEW.rationale, 'status', NEW.status, 'filters_passed', NEW.filters_passed, 'counterexample_node_id', NEW.counterexample_node_id, 'last_run_at', NEW.last_run_at, 'created_at', NEW.created_at)
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_obligation_update` AFTER UPDATE ON `obligation` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'obligation', 'U', NULL,
		json_object('id', OLD.id, 'intent_node_id', OLD.intent_node_id, 'kind', OLD.kind, 'source', OLD.source, 'test_code', OLD.test_code, 'rationale', OLD.rationale, 'status', OLD.status, 'filters_passed', OLD.filters_passed, 'counterexample_node_id', OLD.counterexample_node_id, 'last_run_at', OLD.last_run_at, 'created_at', OLD.created_at),
		json_object('id', NEW.id, 'intent_node_id', NEW.intent_node_id, 'kind', NEW.kind, 'source', NEW.source, 'test_code', NEW.test_code, 'rationale', NEW.rationale, 'status', NEW.status, 'filters_passed', NEW.filters_passed, 'counterexample_node_id', NEW.counterexample_node_id, 'last_run_at', NEW.last_run_at, 'created_at', NEW.created_at)
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_obligation_delete` AFTER DELETE ON `obligation` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'obligation', 'D', NULL,
		json_object('id', OLD.id, 'intent_node_id', OLD.intent_node_id, 'kind', OLD.kind, 'source', OLD.source, 'test_code', OLD.test_code, 'rationale', OLD.rationale, 'status', OLD.status, 'filters_passed', OLD.filters_passed, 'counterexample_node_id', OLD.counterexample_node_id, 'last_run_at', OLD.last_run_at, 'created_at', OLD.created_at),
		NULL
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_lease_insert` AFTER INSERT ON `lease` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'lease', 'I', NULL, NULL,
		json_object('node_id', NEW.node_id, 'scope', NEW.scope, 'holder', NEW.holder, 'reason', NEW.reason, 'expires_at', NEW.expires_at, 'acquired_at', NEW.acquired_at, 'fence_token', NEW.fence_token)
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_lease_update` AFTER UPDATE ON `lease` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'lease', 'U', NULL,
		json_object('node_id', OLD.node_id, 'scope', OLD.scope, 'holder', OLD.holder, 'reason', OLD.reason, 'expires_at', OLD.expires_at, 'acquired_at', OLD.acquired_at, 'fence_token', OLD.fence_token),
		json_object('node_id', NEW.node_id, 'scope', NEW.scope, 'holder', NEW.holder, 'reason', NEW.reason, 'expires_at', NEW.expires_at, 'acquired_at', NEW.acquired_at, 'fence_token', NEW.fence_token)
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `row_audit_lease_delete` AFTER DELETE ON `lease` BEGIN
	INSERT INTO `row_audit`(ts, tbl, op, rowid, before, after) VALUES (
		(unixepoch('now') * 1000), 'lease', 'D', NULL,
		json_object('node_id', OLD.node_id, 'scope', OLD.scope, 'holder', OLD.holder, 'reason', OLD.reason, 'expires_at', OLD.expires_at, 'acquired_at', OLD.acquired_at, 'fence_token', OLD.fence_token),
		NULL
	);
END;