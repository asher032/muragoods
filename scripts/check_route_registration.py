#!/usr/bin/env python3
"""Every route must be registered AFTER its handler is defined.

    python scripts/check_route_registration.py

`app.router.add_get("/x", handler)` stores the NAME `handler`. If the `def` for
that name has not run yet, the call raises `NameError` at that line.

This matters far more than it looks. All the handlers are nested inside
`_health_server()`, which is a single function: the first forward reference
aborts the whole function, so the TCPSite is never created and the bot serves
NOTHING — /health, the music bridge, the economy routes, all of it. The process
is still alive and the Discord gateway is still connected, which is precisely
why it looks healthy while every HTTP call 404s or the connection is refused.

Nothing catches it: the symptom is a bot that logs in fine and has no HTTP
surface at all.

This parses the module instead of importing it (importing main.py needs a live
Discord token) and asserts, for every `app.router.add_*` call, that the handler
name is defined earlier in the same enclosing scope.
"""
import ast
import sys
from pathlib import Path

MAIN = Path(__file__).resolve().parent.parent / "discord-bot" / "bot" / "main.py"


def main():
    tree = ast.parse(MAIN.read_text(encoding="utf-8"))

    # Explicit parent map, so a handler's enclosing scope can be found.
    parent_of = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parent_of[child] = parent

    def enclosing_func(node):
        """Nearest enclosing FunctionDef/AsyncFunctionDef name, or <module>."""
        cur = node
        while cur in parent_of:
            cur = parent_of[cur]
            if isinstance(cur, (ast.FunctionDef, ast.AsyncFunctionDef)):
                return cur.name
        return "<module>"

    # Record, per enclosing scope, the line where each nested def appears.
    defined_at = {}  # (scope, name) -> lineno
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            scope = enclosing_func(node)
            key = (scope, node.name)
            prev = defined_at.get(key)
            if prev is None or node.lineno < prev:
                defined_at[key] = node.lineno

    violations = []
    registered = 0
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (isinstance(func, ast.Attribute)
                and isinstance(func.value, ast.Attribute)
                and func.value.attr == "router"
                and func.attr.startswith("add_")):
            continue
        if len(node.args) < 2:
            continue
        path = ast.literal_eval(node.args[0]) if isinstance(node.args[0], ast.Constant) else "?"
        handler = node.args[1]
        if not isinstance(handler, ast.Name):
            continue
        registered += 1
        scope = enclosing_func(node)
        dline = defined_at.get((scope, handler.id))
        if dline is None:
            violations.append((node.lineno, path, handler.id,
                               "handler is not a nested def in this scope"))
        elif dline > node.lineno:
            violations.append((node.lineno, path, handler.id,
                               f"defined at line {dline}, AFTER registration"))

    print(f"checked {registered} route registrations in {MAIN.name}")
    if not violations:
        print("ok   every handler is defined before it is registered")
        return 0
    print(f"\nFAIL {len(violations)} route(s) registered before their handler exists:")
    for lineno, path, name, why in sorted(violations):
        print(f"  line {lineno}: {path}")
        print(f"      handler {name!r}: {why}")
    print("\nEach of these raises NameError on the first, which aborts the whole")
    print("enclosing function — so the server never binds a port and every")
    print("dashboard→bot call fails while the bot still looks online.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
