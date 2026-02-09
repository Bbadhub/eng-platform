# MCP SaaS Template

Reusable system for turning any MCP server into a paid SaaS product with:
- MCP transport (`SSE` + `stdio`)
- Billing and API keys (`Stripe` metering + rate limits)
- Usage tracking (calls, costs, per-tool activity)
- Affiliate commissions (referral signup + payout tracking)
- Deploy stack (`Docker Compose`, `Fly.io`, `Railway`)
- Ready landing page + consumer web panel (`template/site/index.html`)
- Competitive pricing analysis engine (`template/strategy/`)
- Prompt pack for install/sales/public messaging (`template/prompts/`)

## Fastest Launch Stack

1. Backend deploy: `Railway` (fastest setup) or `Fly.io` (more infra control).
2. Billing: `Stripe` metered usage + checkout (already wired in `billing.py`).
3. Auth + usage limits: built-in API key layer in `billing.py` (can swap for Unkey later).
4. Monitoring:
   - `/health` endpoint for uptime checks
   - `/billing/metrics` for revenue and usage totals
   - `/billing/activity` for per-user recent calls
5. Website: edit `site/index.html` placeholders and host with your frontend provider.

## Scaffold a New Product

```bash
cd mcp-saas-template
python create_mcp_saas.py \
  --name "Legal Research MCP" \
  --description "Case law and contradiction analysis server" \
  --author-name "LegalAI" \
  --author-email "ops@example.com"
```

Output defaults to `./legal-research-mcp` (or your custom `--slug`).

## Generator Options

```bash
python create_mcp_saas.py --help
```

Key flags:
- `--name`, `--description` (required)
- `--slug`
- `--port`
- `--pricing-free-calls`, `--pricing-pro-price`, `--pricing-pro-calls`
- `--features-file`, `--tools-file` (JSON overrides for landing page content)
- `--output`, `--force`

## Generated Project Layout

- `server.py`: MCP protocol server with billing middleware
- `tools/`: example MCP tools
- `billing.py`: API keys, Stripe metering, usage accounting
- `deploy.sh`: one-command operations workflow
- `docker-compose.yml`: local/prod container startup
- `.env.example`: runtime config
- `site/index.html`: landing page with pricing and signup flow

## Duplication Workflow

1. Generate project from template.
2. Replace `tools/example.py` with your domain tools.
3. Set tool pricing in `billing.py` (`BillingConfig.tool_prices`).
4. Configure Stripe:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID` (metered)
   - `STRIPE_WEBHOOK_SECRET`
5. Launch backend (`./deploy.sh start`).
6. Host website and point the frontend API URL to your backend URL.
7. Register MCP endpoint in Claude clients.
8. Run `./deploy.sh benchmark` to generate pricing recommendations and public comparison artifacts.

## Notes

- Default persistence in `billing.py` is JSON files for speed of launch.
- For scale, swap storage to Redis/PostgreSQL and keep the same middleware shape.
- `billing.py` is intentionally standalone so you can drop it into existing MCP servers.
