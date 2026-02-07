from backend.services.text_vectorization import (
    is_valid_vocab_token,
    strip_email_addresses,
    tokenize_newsgroup_text,
)


def test_strip_email_addresses_lowercases_and_removes_emails():
    text = "Contact A_User@Example.com and Keep Words."
    normalized = strip_email_addresses(text)
    assert "a_user@example.com" not in normalized
    assert normalized == normalized.lower()


def test_is_valid_vocab_token_filters_expected_cases():
    assert is_valid_vocab_token("alpha")
    assert not is_valid_vocab_token("a1")
    assert not is_valid_vocab_token("snake_case")
    assert not is_valid_vocab_token("aa")
    assert not is_valid_vocab_token("zf")


def test_tokenize_newsgroup_text_applies_project_rules():
    tokens = tokenize_newsgroup_text(
        "Alpha alpha user@example.com zf aa a1 under_score and beta"
    )
    assert "alpha" in tokens
    assert "beta" in tokens
    assert "zf" not in tokens
    assert "aa" not in tokens
    assert "a1" not in tokens
    assert "under_score" not in tokens

