# Security Policy

## Supported versions

DashDB is pre-1.0. Only the latest code on `main` receives security fixes.

## Reporting a vulnerability

**Please do not open public issues, pull requests or discussions for security problems.**

Email **security@dashdb.dev** with:

- a description of the issue and its impact
- steps to reproduce, or a proof of concept
- affected component(s), version or commit, and any configuration needed
- whether you would like to be credited, and under what name

You can expect:

| Step               | Target                   |
| ------------------ | ------------------------ |
| Acknowledgement    | within 3 business days   |
| Initial assessment | within 10 business days  |
| Fix or mitigation  | as soon as practical     |
| Public disclosure  | 90 days after the report |

## Disclosure policy

We follow a **90-day coordinated disclosure** policy. After a report is received, we aim to ship a fix and
publish an advisory within 90 days. If a fix ships sooner, the advisory may be published once users have had
a reasonable chance to update. If we need more time, we will agree an extension with you before the deadline.
If a vulnerability is being actively exploited, we may disclose sooner.

## Safe harbour

We will not pursue legal action against good-faith research that:

- stays within the scope of this policy and avoids privacy violations, data destruction and service disruption
- only accesses data needed to demonstrate the issue, and does not keep it
- gives us reasonable time to respond before any public disclosure

## Machine-readable contact

See [`/.well-known/security.txt`](apps/web/public/.well-known/security.txt) (RFC 9116).
