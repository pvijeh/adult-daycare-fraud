import re


def standardize_address(address: str | None) -> str:
    if not address:
        return ""
    normalized = address.upper()
    normalized = re.sub(
        r"\b(?:APARTMENT|APT|UNIT|SUITE|STE|FLOOR|FL|ROOM|RM)\b.*$",
        "",
        normalized,
    )
    normalized = re.sub(r"#\s*[A-Z0-9-]+.*$", "", normalized)
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    replacements = {
        "STREET": "ST",
        "AVENUE": "AVE",
        "BOULEVARD": "BLVD",
        "ROAD": "RD",
        "DRIVE": "DR",
        "PLACE": "PL",
        "LANE": "LN",
        "PARKWAY": "PKWY",
        "HIGHWAY": "HWY",
    }
    for source, target in replacements.items():
        normalized = re.sub(rf"\b{source}\b", target, normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def normalize_phone(phone: str | None) -> str:
    return re.sub(r"\D", "", phone or "")
