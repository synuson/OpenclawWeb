from __future__ import annotations

from typing import Iterable

ANALYST_SECTIONS = [
    "\ud575\uc2ec \uc218\uce58 \uc694\uc57d",
    "\ub9ac\uc2a4\ud06c \ub9f5(\uc601\ud5a5\ub3c4\xd7\ubc1c\uc0dd\ud655\ub960)",
    "\uadfc\uac70 \ub370\uc774\ud130 \ucd9c\ucc98",
    "\uc2dc\ub098\ub9ac\uc624\ubcc4 \uc804\ub9dd",
    "\uad8c\uace0\uc548",
]

FACILITATOR_SECTIONS = [
    "\uacb0\ub860",
    "\uadfc\uac70 \uc694\uc57d",
    "\ub2e4\uc74c \uc561\uc158(\ub2f4\ub2f9/\uae30\ud55c)",
    "\ubbf8\ud574\uacb0 \uc774\uc288",
    "\ud68c\uc758\ub85d \uc694\uc57d",
]


def summarize_instruction(instruction: str) -> str:
    trimmed = instruction.strip()
    if not trimmed:
        return "No instruction was provided."

    snippet = trimmed[:140]
    if len(trimmed) > 140:
        snippet += "..."
    return f"Local backend accepted the task and generated a placeholder response: {snippet}"


def _format_sections(sections: Iterable[tuple[str, list[str]]]) -> str:
    rendered: list[str] = []
    for title, lines in sections:
        body = "\n".join(lines) if lines else "- \ub0b4\uc6a9 \uc5c6\uc74c"
        rendered.append(f"## {title}\n{body}")
    return "\n\n".join(rendered)


def _build_analyst_reply(message: str) -> str:
    lowered = message.lower()
    if "btc" in lowered or "bitcoin" in lowered or "\ube44\ud2b8\ucf54\uc778" in message:
        focus = "\ube44\ud2b8\ucf54\uc778 \uc218\uae09\uacfc \ubcc0\ub3d9\uc131"
    elif any(token in lowered for token in ["kospi", "kosdaq", "005930", "kr"]) or "\uad6d\ub0b4" in message:
        focus = "\uad6d\ub0b4 \uc99d\uc2dc\uc640 \ub300\ud615\uc8fc \ud750\ub984"
    elif any(token in lowered for token in ["nasdaq", "qqq", "aapl", "nvda", "us"]) or "\ubbf8\uad6d" in message:
        focus = "\ubbf8\uad6d \uc9c0\uc218\uc640 AI \ub300\ud615\uc8fc \uc21c\ud658"
    else:
        focus = "\uc2dc\uc7a5 \uc804\ubc18\uacfc \ud3ec\uc9c0\uc158 \ub9ac\uc2a4\ud06c"

    return _format_sections(
        [
            (
                ANALYST_SECTIONS[0],
                [
                    f"- \ud604\uc7ac \uc6b0\uc120 \ud655\uc778 \ub300\uc0c1\uc740 {focus}\uc785\ub2c8\ub2e4.",
                    "- \ucd94\uc138\ub294 \uc720\uc9c0\ub418\uc9c0\ub9cc \uac70\ub798\ub300\uae08\uacfc \uc9c0\uc9c0 \uad6c\uac04 \ud655\uc778 \uc804\uae4c\uc9c0\ub294 \uacf5\uaca9\uc801 \ud655\ub300\ub97c \uc720\ubcf4\ud558\ub294 \ud3b8\uc774 \uc548\uc804\ud569\ub2c8\ub2e4.",
                ],
            ),
            (
                ANALYST_SECTIONS[1],
                [
                    "- \ub9ac\uc2a4\ud06c: \ub2e8\uae30 \uacfc\uc5f4 \ud6c4 \ubcc0\ub3d9\uc131 \ud655\ub300 | \uc601\ud5a5\ub3c4: high | \ubc1c\uc0dd\ud655\ub960: medium | \uadfc\uac70: \uac00\uaca9 \ubc18\uc751 \uc18d\ub3c4\uac00 \ube60\ub974\uace0 \ucd94\uaca9 \ub9e4\uc218 \uc720\uc785 \uac00\ub2a5\uc131\uc774 \ud07d\ub2c8\ub2e4. | \ub300\uc751: \ucd94\uaca9 \ube44\uc911\uc744 \ub0ae\ucd94\uace0 \uc190\uc808 \uae30\uc900\uc744 \uba3c\uc800 \uc815\ud569\ub2c8\ub2e4.",
                    "- \ub9ac\uc2a4\ud06c: \ub274\uc2a4 \uacf5\ubc31 \uad6c\uac04\uc758 \uc624\ud310 | \uc601\ud5a5\ub3c4: medium | \ubc1c\uc0dd\ud655\ub960: medium | \uadfc\uac70: \uac00\uaca9\ub9cc \ubcf4\uba74 \uc774\ubca4\ud2b8\uc131 \ubcc0\ub3d9\uc744 \ub193\uce60 \uc218 \uc788\uc2b5\ub2c8\ub2e4. | \ub300\uc751: \ub274\uc2a4\uc640 \uac70\ub798\ub300\uae08\uc744 \ud568\uaed8 \ud655\uc778\ud569\ub2c8\ub2e4.",
                ],
            ),
            (ANALYST_SECTIONS[2], ["- OpenClaw local backend", "- \uc571 \uc2a4\ub0c5\uc0f7"]),
            (
                ANALYST_SECTIONS[3],
                [
                    "- \ubca0\uc774\uc2a4: \ud604\uc7ac \ucd94\uc138\ub294 \uc720\uc9c0\ub418\uc9c0\ub9cc \ud655\uc778 \uc804\uae4c\uc9c0\ub294 \ubcf4\uc218\uc801 \uc811\uadfc\uc774 \uc801\uc808\ud569\ub2c8\ub2e4.",
                    "- \ube44\uad00: \uc9c0\uc9c0\uc120 \uc774\ud0c8\uacfc \uc774\ubca4\ud2b8 \uc545\ud654\uac00 \uacb9\uce58\uba74 \ub2e8\uae30 \ubc29\uc5b4 \uc804\ud658\uc774 \ud544\uc694\ud569\ub2c8\ub2e4.",
                ],
            ),
            (ANALYST_SECTIONS[4], ["- \uc2e0\uaddc \uc9c4\uc785\uc740 \ubd84\ud560 \uae30\uc900\uc73c\ub85c \uc811\uadfc\ud558\uace0, \ub2e4\uc74c \ud655\uc778 \uc2dc\uc810 \uc804\uae4c\uc9c0 \uc190\uc2e4 \ud55c\ub3c4\ub97c \uba3c\uc800 \uc815\ud558\ub294 \ud3b8\uc774 \uc88b\uc2b5\ub2c8\ub2e4."]),
        ]
    )


def _build_facilitator_reply(message: str) -> str:
    lowered = message.lower()
    has_order_intent = any(token in lowered for token in ["buy", "sell", "order"]) or any(token in message for token in ["\ub9e4\uc218", "\ub9e4\ub3c4", "\uc8fc\ubb38"])
    has_research_intent = any(token in lowered for token in ["browse", "browser", "research", "web", "openclaw"]) or any(token in message for token in ["\uc870\uc0ac", "\uac80\uc0c9", "\uc6f9"])

    if has_order_intent:
        action_task = "\ubaa8\uc758\ud22c\uc790 \ud654\uba74\uc5d0\uc11c \uc8fc\ubb38 \uac00\uc815\uacfc \ub9ac\uc2a4\ud06c \ud55c\ub3c4\ub97c \uac80\uc99d\ud55c\ub2e4"
    elif has_research_intent:
        action_task = "OpenClaw \uc870\uc0ac \ubc94\uc704\ub97c \ud655\uc815\ud558\uace0 \ud544\uc694\ud55c URL\uc744 \uc815\ub9ac\ud55c\ub2e4"
    else:
        action_task = "\ub2e4\uc74c \ud655\uc778 \uc2dc\uc810\uacfc \ud310\ub2e8 \uae30\uc900\uc744 \ud655\uc815\ud55c\ub2e4"

    return _format_sections(
        [
            (FACILITATOR_SECTIONS[0], ["- \ud604\uc7ac \uc815\ubcf4\ub9cc\uc73c\ub85c\ub3c4 \ub2e4\uc74c \uc561\uc158\uc740 \uc815\ud560 \uc218 \uc788\uc9c0\ub9cc, \uc2e4\ud589 \uc804 \ub9c8\uc9c0\ub9c9 \ud655\uc778 \ud56d\ubaa9\uc740 \ub0a8\uae30\ub294 \uac83\uc774 \uc548\uc804\ud569\ub2c8\ub2e4."]),
            (
                FACILITATOR_SECTIONS[1],
                [
                    "- \ubd84\uc11d\uac00 \uad00\uc810\uc5d0\uc11c\ub294 \ucd94\uc138\ub294 \uc720\ud6a8\ud558\uc9c0\ub9cc \ub9ac\uc2a4\ud06c \uad00\ub9ac\uac00 \ubc18\ub4dc\uc2dc \uc120\ud589\ub418\uc5b4\uc57c \ud569\ub2c8\ub2e4.",
                    "- \ucd94\uac00 \uc6f9 \uac80\uc99d\uc774 \ud544\uc694\ud558\uba74 OpenClaw \uc870\uc0ac \uacb0\uacfc\ub97c \ud6c4\uc18d \uadfc\uac70\ub85c \ubd99\uc774\ub294 \uad6c\uc870\uac00 \uc801\uc808\ud569\ub2c8\ub2e4.",
                ],
            ),
            (FACILITATOR_SECTIONS[2], [f"- \uc791\uc5c5: {action_task} | \ub2f4\ub2f9: \uc11c\uc724 | \uae30\ud55c: TBD | \uc0c1\ud0dc: todo"]),
            (FACILITATOR_SECTIONS[3], ["- \ud575\uc2ec \uc9c0\uc9c0 \uad6c\uac04\uacfc \ub274\uc2a4 \uc774\ubca4\ud2b8\ub97c \uc5b4\ub290 \ubc94\uc704\uae4c\uc9c0 \ucd94\uac00 \uac80\uc99d\ud560\uc9c0 \uc544\uc9c1 \ud655\uc815\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4."]),
            (FACILITATOR_SECTIONS[4], ["- \uc774\ubc88 \ub77c\uc6b4\ub4dc\ub294 \ucd94\uc138\uc640 \ub9ac\uc2a4\ud06c\ub97c \uc815\ub9ac\ud588\uace0, \uc2e4\ud589 \uc804 \uac80\uc99d \ud56d\ubaa9\uc744 \ub0a8\uae30\ub294 \ucabd\uc73c\ub85c \uc815\ub9ac\ud588\uc2b5\ub2c8\ub2e4."]),
        ]
    )


def build_meeting_reply(agent_id: str, phase: str | None, message: str, history: list[dict] | None = None) -> str:
    del history
    if agent_id == "analyst" or phase == "analysis":
        return _build_analyst_reply(message)
    return _build_facilitator_reply(message)
