# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Choc-collab, please report it privately via email:

**Choc-collab@proton.me**

Please include:
- A description of the vulnerability
- Steps to reproduce it
- Any relevant screenshots or logs

We will acknowledge your report within 48 hours and work with you to understand and address the issue before any public disclosure.

## What NOT to do

- Do not open a public GitHub issue for security vulnerabilities
- Do not post details in Discussions or any public channel

## Scope

Choc-collab is a local-first app — all data lives in the user's browser. There is no server-side component to attack in the default configuration. That said, we still take seriously:

- XSS or injection vulnerabilities in the client
- Issues with the service worker or CSP configuration
- Sensitive data leaking into the bundle or logs
- Vulnerabilities in dependencies

Thank you for helping keep Choc-collab safe.
