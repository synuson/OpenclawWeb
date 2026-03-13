from __future__ import annotations


def summarize_instruction(instruction: str) -> str:
    trimmed = instruction.strip()
    if not trimmed:
        return "No instruction was provided."

    snippet = trimmed[:140]
    if len(trimmed) > 140:
        snippet += "..."
    return f"Local backend accepted the task and generated a placeholder response: {snippet}"
