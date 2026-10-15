import sys


def test_import_ars_does_not_eagerly_import_knowledge(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delitem(sys.modules, "ars", raising=False)
    monkeypatch.delitem(sys.modules, "ars.knowledge", raising=False)

    import ars

    assert ars.get_version() == ars.__version__
    assert "ars.knowledge" not in sys.modules
