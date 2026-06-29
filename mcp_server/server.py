"""
Standalone MCP server for AgentPlatform.

Exposes 3 basic tools via FastMCP over streamable-http transport:
  - calculate   : safe math expression evaluator
  - get_datetime: current ISO timestamp
  - http_get    : fetch a URL's text content (capped at 5000 chars)

Auth: every request to /mcp must include X-API-Key matching MCP_API_KEY env var.
The /health endpoint is always public.
"""
import ast
import operator
import os
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

import httpx
import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.responses import Response

MCP_API_KEY = os.getenv("MCP_API_KEY", "secret")
print("MCP_API_KEY",MCP_API_KEY)
mcp = FastMCP("AgentPlatform MCP Server")


# ---------------------------------------------------------------------------
# Auth middleware (pure ASGI, works regardless of FastMCP internals)
# ---------------------------------------------------------------------------

class _APIKeyMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path == "/health":
                await Response('{"status":"ok"}', media_type="application/json")(scope, receive, send)
                return
            raw_headers = scope.get("headers", [])
            headers_map = {k.lower(): v for k, v in raw_headers}
            api_key = headers_map.get(b"x-api-key", b"").decode()
            if MCP_API_KEY and api_key != MCP_API_KEY:
                await Response("Unauthorized", status_code=401)(scope, receive, send)
                return
            # Rewrite Host to localhost so the MCP SDK's transport security check passes.
            # The SDK rejects non-localhost Host headers (e.g. 0.0.0.0:8001) with 421.
            port = os.getenv("MCP_PORT", "8001")
            fixed_headers = [
                (b"host", f"localhost:{port}".encode()) if k.lower() == b"host" else (k, v)
                for k, v in raw_headers
            ]
            scope = {**scope, "headers": fixed_headers}
        await self.app(scope, receive, send)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

_SAFE_OPS = {
    ast.Add:  operator.add,
    ast.Sub:  operator.sub,
    ast.Mult: operator.mul,
    ast.Div:  operator.truediv,
    ast.Pow:  operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
    ast.Mod:  operator.mod,
}


def _safe_eval(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_OPS:
        return _SAFE_OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _SAFE_OPS:
        return _SAFE_OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError(f"Unsupported expression: {type(node).__name__}")


@mcp.tool()
def calculate(expression: str) -> str:
    """
    Evaluate a mathematical expression and return the result as a string.
    Supports +, -, *, /, **, %, and parentheses. No variables or functions.
    Example: calculate("(2 + 3) * 4") returns "20".
    """
    try:
        tree = ast.parse(expression.strip(), mode="eval")
        result = _safe_eval(tree.body)
        return str(result)
    except Exception as e:
        return f"Error: {e}"


@mcp.tool()
def get_datetime() -> str:
    """
    Return the current date and time as an ISO 8601 string.
    Example output: 2026-06-27T14:32:01.123456
    """
    return datetime.now().isoformat()


@mcp.tool()
def http_get(url: str) -> str:
    """
    Fetch the text content of a URL via HTTP GET.
    Returns the first 5000 characters of the response body.
    Useful for reading web pages or JSON API responses.
    """
    try:
        with httpx.Client(timeout=10, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": "AgentPlatform-MCP/1.0"})
            resp.raise_for_status()
            return resp.text[:5000]
    except Exception as e:
        return f"Error fetching {url}: {e}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("MCP_PORT", "8001"))
    # Get the FastMCP ASGI app and wrap it with auth middleware
    asgi_app = mcp.streamable_http_app()
    wrapped = _APIKeyMiddleware(asgi_app)
    uvicorn.run(wrapped, host="0.0.0.0", port=port)
