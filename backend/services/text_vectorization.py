from __future__ import annotations

import re
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS

EMAIL_ADDRESS_RE = re.compile(r"(?i)\b[\w.%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b")
LETTER_TOKEN_RE = re.compile(r"[a-zA-Z]{2,}")
VALID_VOCAB_TOKEN_RE = re.compile(r"^[A-Za-z]{2,}$")
HAS_VOWEL_RE = re.compile(r"[aeiou]")
HAS_CONSONANT_RE = re.compile(r"[b-df-hj-np-tv-z]")


def strip_email_addresses(text: str) -> str:
    """
    Remove email addresses and normalize casing for downstream tokenization.
    """
    if not text:
        return ""
    without_emails = EMAIL_ADDRESS_RE.sub(" ", text)
    return without_emails.lower()


def is_valid_vocab_token(token: str) -> bool:
    """
    Validate newsgroup tokens against project filtering rules.
    """
    normalized = token.lower()
    if VALID_VOCAB_TOKEN_RE.fullmatch(normalized) is None:
        return False
    if HAS_VOWEL_RE.search(normalized) is None:
        return False
    if HAS_CONSONANT_RE.search(normalized) is None:
        return False
    return True


def tokenize_newsgroup_text(text: str) -> list[str]:
    """
    Tokenize text using letters-only tokens and project-specific filtering rules.
    """
    normalized_text = strip_email_addresses(text)
    tokens = LETTER_TOKEN_RE.findall(normalized_text)
    return [
        token for token in tokens if token not in ENGLISH_STOP_WORDS and is_valid_vocab_token(token)
    ]


def create_20newsgroups_vectorizer(max_features: int = 9999) -> CountVectorizer:
    """
    Create a CountVectorizer configured for 20 Newsgroups preprocessing rules.
    """
    return CountVectorizer(
        max_features=max_features,
        lowercase=False,
        tokenizer=tokenize_newsgroup_text,
        token_pattern=None,
    )

