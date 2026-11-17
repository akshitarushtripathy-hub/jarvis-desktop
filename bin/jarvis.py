#!/usr/bin/env python3
"""jarvis - configure the Jarvis desktop assistant from a terminal.

Examples:
  jarvis set-key groq gsk_yourkeyhere
  jarvis use groq
  jarvis status
"""
import base64
import json
import os
import sys
from pathlib import Path

APP = "Jarvis"
PROVIDERS = {
    "openai": "OpenAI",
    "anthropic": "Claude",
    "claude": "Claude",
    "gemini": "Gemini",
    "groq": "Groq",
}
ALIASES = {"claude": "anthropic"}

MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
    "gemini": "gemini-2.0-flash",
    "groq": "llama-3.3-70b-versatile",
}

DEFAULTS = {
    "provider": "groq",
    "identity": {"userName": "", "assistantName": "Jarvis"},
    "models": dict(MODELS),
    "keys": {k: "" for k in ("openai", "anthropic", "gemini", "groq")},
}


def candidates():
    home = Path.home()
    if sys.platform == "darwin":
        dirs = [home / "Library" / "Application Support" / APP]
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
        dirs = [base / APP]
    else:
        xdg = os.environ.get("XDG_CONFIG_HOME")
        dirs = []
        if xdg:
            dirs.append(Path(xdg) / APP)
        dirs += [home / ".config" / APP, home / ".config" / "jarvis-desktop"]
    return [d / "jarvis-settings.json" for d in dirs]


def config_file():
    paths = candidates()
    for p in paths:
        if p.exists():
            return p
    return paths[0]


def read_config():
    path = config_file()
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        data = {}
    cfg = json.loads(json.dumps(DEFAULTS))
    cfg.update({k: v for k, v in data.items() if k in cfg})
    cfg["identity"] = {**DEFAULTS["identity"], **(data.get("identity") or {})}
    cfg["models"] = {**DEFAULTS["models"], **(data.get("models") or {})}
    cfg["keys"] = {**DEFAULTS["keys"], **(data.get("keys") or {})}
    return cfg


def write_config(cfg):
    path = config_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cfg, indent=2) + "\n")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return path


def normalize(provider):
    p = provider.lower().strip()
    if p not in PROVIDERS:
        raise ValueError(f"unknown provider '{provider}' (choose: openai, claude, gemini, groq)")
    return ALIASES.get(p, p)


def encode_key(key):
    # The app understands the 'raw:' prefix and decodes it on startup.
    return "raw:" + base64.b64encode(key.encode()).decode()


def is_set(value):
    return bool(value)


def usage():
    print(__doc__.strip())
    sys.exit(0)


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        usage()

    cmd, args = argv[0], argv[1:]
    cfg = read_config()

    if cmd == "set-key":
        if len(args) != 2:
            raise ValueError("usage: jarvis set-key <provider> <key>")
        p = normalize(args[0])
        cfg["keys"][p] = encode_key(args[1]) if args[1] else ""
        cfg["provider"] = p
        write_config(cfg)
        print(f"Key saved for {PROVIDERS[p]} and selected.")

    elif cmd == "clear-key":
        if len(args) != 1:
            raise ValueError("usage: jarvis clear-key <provider>")
        p = normalize(args[0])
        cfg["keys"][p] = ""
        write_config(cfg)
        print(f"Key cleared for {PROVIDERS[p]}.")

    elif cmd == "use":
        if len(args) != 1:
            raise ValueError("usage: jarvis use <provider>")
        p = normalize(args[0])
        cfg["provider"] = p
        write_config(cfg)
        print(f"Now using {PROVIDERS[p]}.")

    elif cmd == "model":
        if len(args) != 2:
            raise ValueError("usage: jarvis model <provider> <model>")
        p = normalize(args[0])
        cfg["models"][p] = args[1]
        write_config(cfg)
        print(f"Model for {PROVIDERS[p]} set to {args[1]}.")

    elif cmd == "name":
        if len(args) not in (1, 2):
            raise ValueError("usage: jarvis name <your-name> [assistant-name]")
        cfg["identity"]["userName"] = args[0]
        if len(args) == 2:
            cfg["identity"]["assistantName"] = args[1]
        write_config(cfg)
        print("Names updated.")

    elif cmd == "status":
        active = cfg["provider"]
        print(f"Active provider: {PROVIDERS.get(active, active)}")
        for p in ("openai", "anthropic", "gemini", "groq"):
            mark = "configured" if is_set(cfg["keys"].get(p)) else "no key"
            sel = " <- active" if p == active else ""
            print(f"  {PROVIDERS[p]:<10} {mark}{sel}")
        ident = cfg["identity"]
        if ident.get("userName"):
            print(f"User: {ident['userName']}  |  Assistant: {ident.get('assistantName')}")

    elif cmd == "path":
        print(config_file())

    else:
        raise ValueError(f"unknown command '{cmd}'")


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except ValueError as e:
        print(f"jarvis: {e}", file=sys.stderr)
        sys.exit(1)
