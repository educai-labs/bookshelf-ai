"""Tests de arranque del servidor MCP (feature 019).

Cubren: `build_mcp` registra exactamente las 5 tools; el arranque sin
configuración termina con error en stderr (stdout limpio, sin secretos); y la
salida de protocolo STDIO no se mezcla con logs.
"""

from __future__ import annotations

import json
import os
import select
import subprocess
import sys
from pathlib import Path

from conftest import USER_ID

_SERVER_PY = Path(__file__).resolve().parent / "server.py"


def _valid_env() -> dict[str, str]:
    return {
        "PATH": os.environ.get("PATH", ""),
        "SUPABASE_URL": "https://xyz.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
        "GEMINI_API_KEY": "gemini-key",
        "MCP_USER_ID": USER_ID,
    }


async def test_build_mcp_registra_exactamente_5_tools(monkeypatch):
    for name, value in _valid_env().items():
        if name != "PATH":
            monkeypatch.setenv(name, value)

    from server import build_mcp

    mcp = build_mcp()
    tools = await mcp.list_tools()
    names = sorted(tool.name for tool in tools)
    assert names == [
        "chat_with_library",
        "create_book",
        "create_note",
        "get_book_notes",
        "search_books",
    ]


def test_arranque_sin_config_sale_con_error_y_stdout_limpio(tmp_path):
    proc = subprocess.run(
        [sys.executable, str(_SERVER_PY)],
        cwd=str(tmp_path),
        env={"PATH": os.environ.get("PATH", "")},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert proc.returncode != 0
    # La salida de protocolo (stdout) queda limpia: los logs/errores van a stderr.
    assert proc.stdout == ""
    assert "SUPABASE_URL" in proc.stderr
    assert "Error de configuración" in proc.stderr


def test_arranque_config_invalida_no_vuelca_secretos(tmp_path):
    secret = "eyJ-secret-role-key"
    env = {
        "PATH": os.environ.get("PATH", ""),
        "SUPABASE_URL": "https://xyz.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": secret,
        "GEMINI_API_KEY": "gemini-key",
        "MCP_USER_ID": "no-es-un-uuid",
    }
    proc = subprocess.run(
        [sys.executable, str(_SERVER_PY)],
        cwd=str(tmp_path),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert proc.returncode != 0
    assert secret not in proc.stdout
    assert secret not in proc.stderr
    assert "MCP_USER_ID" in proc.stderr


def _read_line(proc, timeout: float = 15.0) -> str:
    ready, _, _ = select.select([proc.stdout], [], [], timeout)
    if not ready:
        proc.kill()
        raise TimeoutError("el servidor no respondió")
    return proc.stdout.readline()


def test_protocolo_stdio_no_mezclado_con_logs(tmp_path):
    proc = subprocess.Popen(
        [sys.executable, str(_SERVER_PY)],
        cwd=str(tmp_path),
        env=_valid_env(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        init = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1.0"},
            },
        }
        proc.stdin.write(json.dumps(init) + "\n")
        proc.stdin.flush()

        line = _read_line(proc)
        payload = json.loads(line)  # válido JSON-RPC → no hay logs mezclados
        assert payload["jsonrpc"] == "2.0"
        assert payload["id"] == 1
        assert "result" in payload

        proc.stdin.write(
            json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
        )
        proc.stdin.flush()

        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}) + "\n")
        proc.stdin.flush()

        line = _read_line(proc)
        payload = json.loads(line)
        names = sorted(tool["name"] for tool in payload["result"]["tools"])
        assert names == [
            "chat_with_library",
            "create_book",
            "create_note",
            "get_book_notes",
            "search_books",
        ]
    finally:
        proc.kill()
        proc.wait(timeout=10)
