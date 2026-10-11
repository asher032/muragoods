"""Murabot's built-in message language.

ONE table, ONE resolver. A guild's `language` setting (written by the dashboard
into the canonical `guild_config` document, the same one this process reads)
selects the language of the strings **Murabot itself composes** — its join and
leave notices.

What this is deliberately NOT: a translator for the operator's own words. A
server that writes its own welcome or leave message gets exactly those words
back, in whatever language they were written. Rewriting a server's own message
into another language would be Murabot editing its owner's copy.

Placeholders are the ones the message fields accept on both sides of the
bridge — `discord-bot/scripts/test_general_settings.py` asserts this table and
`app/lib/general-settings.ts` agree on the language codes, so the dashboard can
never offer a language Murabot does not speak.
"""

from __future__ import annotations

from typing import Any, Mapping

#: Used whenever a guild has no valid language stored.
DEFAULT_LANGUAGE = "en"

#: Placeholders any message template may use. Shared with the dashboard.
PLACEHOLDERS = ("user", "username", "server", "member_count")

#: code -> {key: template}. Every language declares EVERY key; the test suite
#: fails the build if one is missing, so a half-translated language can never
#: silently fall back to English mid-message.
LANGUAGES: dict[str, dict[str, str]] = {
    "en": {
        "join.title": "🎉 Welcome",
        "join.body": "**{user}** joined {server}. Welcome!",
        "leave.title": "👋 Goodbye",
        "leave.body": "**{user}** left {server}.",
    },
    "de": {
        "join.title": "🎉 Willkommen",
        "join.body": "**{user}** ist {server} beigetreten. Willkommen!",
        "leave.title": "👋 Auf Wiedersehen",
        "leave.body": "**{user}** hat {server} verlassen.",
    },
    "es": {
        "join.title": "🎉 Bienvenido",
        "join.body": "**{user}** se ha unido a {server}. ¡Bienvenido!",
        "leave.title": "👋 Hasta luego",
        "leave.body": "**{user}** ha salido de {server}.",
    },
    "fr": {
        "join.title": "🎉 Bienvenue",
        "join.body": "**{user}** a rejoint {server}. Bienvenue !",
        "leave.title": "👋 Au revoir",
        "leave.body": "**{user}** a quitté {server}.",
    },
}

#: Human labels for the dashboard / any future bot surface.
LABELS: dict[str, str] = {
    "en": "English",
    "de": "Deutsch",
    "es": "Español",
    "fr": "Français",
}


def supported_language_codes() -> list[str]:
    """Every code Murabot can actually speak, in a stable order."""
    return list(LANGUAGES)


def normalize_language(raw: Any) -> str | None:
    """The canonical code for `raw`, or None when it is not supported.

    Returning None (rather than silently defaulting) is what lets the dashboard
    reject an unsupported value instead of storing one the bot would ignore.
    """
    if not isinstance(raw, str):
        return None
    code = raw.strip().lower().replace("_", "-")
    if not code:
        return None
    # Accept a full tag ("en-US", "pt-BR") by its primary subtag.
    primary = code.split("-")[0]
    return primary if primary in LANGUAGES else None


def resolve_language(cfg: Mapping[str, Any] | str | None) -> str:
    """The language a guild's config selects, defaulting to English.

    Accepts the guild config document itself (the call sites all have it) or a
    bare code, so no caller has to know the shape twice.
    """
    if isinstance(cfg, str):
        return normalize_language(cfg) or DEFAULT_LANGUAGE
    if isinstance(cfg, Mapping):
        return normalize_language(cfg.get("language")) or DEFAULT_LANGUAGE
    return DEFAULT_LANGUAGE


def label(code: str) -> str:
    """Display label for a code; unknown codes report the default's label."""
    return LABELS.get(resolve_language(code), LABELS[DEFAULT_LANGUAGE])


def t(cfg: Mapping[str, Any] | str | None, key: str, **fields: Any) -> str:
    """A built-in string for the guild's language, with placeholders filled.

    A missing key in the selected language falls back to English and then to
    an empty string — never to a KeyError on a message path, because a broken
    notice must not take the member-join event down with it.
    """
    code = resolve_language(cfg)
    table = LANGUAGES.get(code, LANGUAGES[DEFAULT_LANGUAGE])
    template = table.get(key) or LANGUAGES[DEFAULT_LANGUAGE].get(key) or ""
    return fill(template, fields)


def fill(template: str, fields: Mapping[str, Any]) -> str:
    """Replace `{name}` placeholders.

    Only declared placeholders are substituted. An unknown `{...}` is left
    exactly as written: a server that writes `{not_a_placeholder}` sees their
    own text, not a silently blanked line.
    """
    out = str(template)
    for name in PLACEHOLDERS:
        if name in fields:
            out = out.replace("{" + name + "}", str(fields[name]))
    return out


def render_message(cfg: Mapping[str, Any] | str | None, custom: Any, key: str,
                   **fields: Any) -> str:
    """The server's own template when it set one, else the localized default.

    `custom` is the operator's message field. Whitespace-only counts as unset:
    the dashboard renders empty as "Murabot's default", and a field holding a
    single space is a typo, not a message.
    """
    if isinstance(custom, str) and custom.strip():
        return fill(custom.strip(), fields)
    return t(cfg, key, **fields)
