---
name: supabase-postgres-best-practices
description: Postgres and Supabase database guidance for query tuning, indexing, RLS, schema design, connection management, and scaling decisions.
---
# Supabase Postgres Best Practices

Use this skill when writing SQL, designing schemas, or debugging Postgres performance in Supabase-backed systems.

## When to Apply

Reference these guidelines when:

- Writing or reviewing SQL queries
- Designing tables, indexes, constraints, or policies
- Investigating slow queries or scaling issues
- Working with Row-Level Security
- Making tradeoffs around concurrency, pooling, or advanced Postgres features

## Priority Order

Apply fixes in this order:

1. Query performance
2. Connection management
3. Security and RLS
4. Schema design
5. Concurrency and locking
6. Data access patterns
7. Monitoring and diagnostics
8. Advanced features

## Core Guidance

### 1. Query Performance

- Start with `EXPLAIN` or `EXPLAIN ANALYZE` for slow queries
- Add indexes for real filter, join, and sort patterns rather than indexing everything
- Prefer targeted column selection over `SELECT *`
- Use pagination deliberately and avoid unbounded result sets
- Consider composite, partial, or covering indexes when the workload justifies them

### 2. Connection Management

- Avoid per-request connection churn
- Use pooling intentionally, especially under bursty workloads
- Keep transactions short and predictable
- Be careful with long-running queries that monopolize pooled connections

### 3. Security and RLS

- Enable RLS anywhere user-scoped data should be protected
- Write explicit policies and test them with real auth contexts
- Keep policy logic understandable; security rules that nobody can reason about are risky
- Be especially careful with privileged functions and `security definer`

### 4. Schema Design

- Use proper relational modeling when the shape is stable
- Add constraints that encode business rules close to the data
- Use JSONB for flexible edges, not as an excuse to skip schema design
- Choose types carefully so the database can enforce correctness for you

### 5. Concurrency and Locking

- Keep write transactions as short as possible
- Understand when your queries take row locks or stronger locks
- Use conflict-aware patterns, queue-friendly approaches, or optimistic designs where appropriate
- Avoid surprise contention from background jobs and user traffic touching the same rows

### 6. Data Access Patterns

- Eliminate N+1 query patterns
- Batch work when it reduces round trips without making queries unreadable
- Use views, RPCs, or server-side functions when they simplify repeated logic
- Keep access paths consistent with your authorization model

### 7. Monitoring and Diagnostics

- Track slow queries and frequently executed queries separately
- Watch table bloat, vacuum health, index usage, and lock contention
- Re-check plans after schema or workload changes
- Measure before and after every meaningful optimization

### 8. Advanced Features

- Reach for partitioning, materialized views, full-text search, or vector features only when simpler designs no longer fit
- Prefer operational clarity over novelty
- Make sure backup, migration, and observability plans still work after adding advanced features

## Review Checklist

1. Does the query use indexes that match its real predicates?
2. Is the schema enforcing correctness instead of pushing it all into application code?
3. Are RLS policies explicit, tested, and easy to reason about?
4. Could concurrency or pooling become the real bottleneck?
5. Do monitoring signals exist to prove the change helped?

## References

- PostgreSQL docs
- Supabase database docs
- Supabase RLS guidance

Use the official docs as the primary source when details matter.
