# ternssh Cloudflare Workers Template

Prebuilt deploy snapshot from [HaradaKashiwa/ternssh](https://github.com/HaradaKashiwa/ternssh) **v0.0.9**.

Use this repository for Cloudflare Workers one-click deploy and Workers Builds. Frontend assets are already built; `npm run build` is a no-op.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/haradakashiwa/ternssh-cloudflare-workers-template)

## Workers Builds

| Step | Command |
|------|---------|
| Build | `npm run build` |
| Deploy | `npm run deploy` |

Ensure a remote D1 database named `ternssh` exists, or set `D1_DATABASE_ID` in build environment variables.

## Source

Generated automatically from `HaradaKashiwa/ternssh` tag `v0.0.9`. Do not edit by hand.
