#!/usr/bin/env python3
"""
Scaffold a production-ready MCP SaaS project from the reusable template.

Example:
  python create_mcp_saas.py ^
    --name "Legal Research MCP" ^
    --description "Case-law + contradiction analysis MCP server" ^
    --author-name "LegalAI" ^
    --author-email "ops@example.com"
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import stat
import sys
from pathlib import Path
from typing import Dict, Any, Iterable


PLACEHOLDER_RE = re.compile(r"\{\{([A-Z_]+)\}\}")


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "my-mcp-saas"


def default_features(project_name: str) -> list[dict[str, str]]:
    return [
        {
            "icon": "API",
            "title": "MCP Native",
            "description": f"{project_name} works as a first-class MCP server over SSE and stdio.",
        },
        {
            "icon": "BILL",
            "title": "Built-in Billing",
            "description": "Stripe metering, API keys, rate limits, free tiers, and checkout flows included.",
        },
        {
            "icon": "OPS",
            "title": "Launch Fast",
            "description": "Docker Compose, health checks, deploy script, and hosted landing page template.",
        },
    ]


def default_tools() -> list[dict[str, str]]:
    return [
        {"name": "echo", "description": "Echo back text for connectivity checks.", "category": "Core"},
        {"name": "hello_world", "description": "Simple greeting tool example.", "category": "Core"},
        {"name": "get_status", "description": "Returns runtime and server status info.", "category": "Ops"},
    ]


def read_optional_json(path: str | None) -> Any:
    if not path:
        return None
    file_path = Path(path).resolve()
    return json.loads(file_path.read_text(encoding="utf-8"))


def build_replacements(args: argparse.Namespace) -> Dict[str, str]:
    slug = args.slug or slugify(args.name)
    server_name = slug
    api_base_url = args.api_base_url or f"http://localhost:{args.port}"

    features = read_optional_json(args.features_file) or default_features(args.name)
    tools = read_optional_json(args.tools_file) or default_tools()

    return {
        "PROJECT_NAME": args.name,
        "PROJECT_SLUG": slug,
        "PROJECT_DESCRIPTION": args.description,
        "HERO_TAGLINE": args.tagline,
        "AUTHOR_NAME": args.author_name,
        "AUTHOR_EMAIL": args.author_email,
        "SERVER_NAME": server_name,
        "SERVER_VERSION": args.server_version,
        "SERVER_PORT": str(args.port),
        "API_BASE_URL": api_base_url,
        "STRIPE_PUBLISHABLE_KEY": args.stripe_publishable_key,
        "PRICING_FREE_CALLS": str(args.pricing_free_calls),
        "PRICING_PRO_PRICE": args.pricing_pro_price,
        "PRICING_PRO_CALLS": str(args.pricing_pro_calls),
        "FEATURES_JSON": json.dumps(features),
        "TOOLS_JSON": json.dumps(tools),
    }


def replace_tokens(text: str, mapping: Dict[str, str]) -> str:
    for key, value in mapping.items():
        text = text.replace(f"{{{{{key}}}}}", value)
    return text


def copy_template(template_dir: Path, output_dir: Path, mapping: Dict[str, str], force: bool) -> None:
    if output_dir.exists():
        if not force and any(output_dir.iterdir()):
            raise RuntimeError(
                f"Output directory already exists and is not empty: {output_dir}\n"
                "Use --force to overwrite."
            )
    output_dir.mkdir(parents=True, exist_ok=True)

    for src in template_dir.rglob("*"):
        rel = src.relative_to(template_dir)
        dst = output_dir / rel

        if src.is_dir():
            dst.mkdir(parents=True, exist_ok=True)
            continue

        dst.parent.mkdir(parents=True, exist_ok=True)
        raw = src.read_bytes()
        try:
            content = raw.decode("utf-8")
            content = replace_tokens(content, mapping)
            dst.write_text(content, encoding="utf-8")
        except UnicodeDecodeError:
            shutil.copy2(src, dst)

    deploy_script = output_dir / "deploy.sh"
    if deploy_script.exists():
        current = deploy_script.stat().st_mode
        deploy_script.chmod(current | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def find_unresolved_tokens(paths: Iterable[Path]) -> list[str]:
    unresolved = []
    for path in paths:
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if PLACEHOLDER_RE.search(text):
            unresolved.append(str(path))
    return unresolved


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a new MCP SaaS project from template.")
    parser.add_argument("--name", required=True, help="Display project name.")
    parser.add_argument("--slug", help="Project slug (defaults to slugified --name).")
    parser.add_argument("--description", required=True, help="One-line product description.")
    parser.add_argument("--tagline", default="Ship your MCP server as a paid SaaS in hours, not weeks.")
    parser.add_argument("--author-name", default="Your Name")
    parser.add_argument("--author-email", default="you@example.com")
    parser.add_argument("--server-version", default="0.1.0")
    parser.add_argument("--port", type=int, default=3020)
    parser.add_argument("--api-base-url", help="Public base URL for landing page JS calls.")
    parser.add_argument("--stripe-publishable-key", default="")
    parser.add_argument("--pricing-free-calls", type=int, default=100)
    parser.add_argument("--pricing-pro-price", default="99")
    parser.add_argument("--pricing-pro-calls", type=int, default=10000)
    parser.add_argument("--features-file", help="Optional JSON file replacing FEATURES_JSON.")
    parser.add_argument("--tools-file", help="Optional JSON file replacing TOOLS_JSON.")
    parser.add_argument("--output", help="Output directory path. Defaults to ./<slug>.")
    parser.add_argument("--force", action="store_true", help="Overwrite output directory if not empty.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    root = Path(__file__).resolve().parent
    template_dir = root / "template"
    if not template_dir.exists():
        print(f"Template directory not found: {template_dir}", file=sys.stderr)
        return 1

    replacements = build_replacements(args)
    slug = replacements["PROJECT_SLUG"]

    output_dir = Path(args.output).resolve() if args.output else Path.cwd() / slug

    try:
        copy_template(template_dir, output_dir, replacements, force=args.force)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    unresolved = find_unresolved_tokens(output_dir.rglob("*"))
    if unresolved:
        print("Warning: unresolved placeholders found in:")
        for item in unresolved:
            print(f"  - {item}")
        print("Update these manually if needed.\n")

    print("MCP SaaS scaffold created successfully.")
    print(f"Project path: {output_dir}")
    print("")
    print("Next steps:")
    print(f"1) cd \"{output_dir}\"")
    print("2) cp .env.example .env")
    print("3) ./deploy.sh setup")
    print("4) ./deploy.sh start")
    print("5) Open /site/index.html locally or host it with your frontend stack")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
