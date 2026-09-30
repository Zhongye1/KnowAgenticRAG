from __future__ import annotations

from ars.utils.thread_utils import extract_thread_id


def test_extract_thread_id_reads_stable_event_paths():
    assert extract_thread_id({"thread_id": " parent-thread "}) == "parent-thread"
    assert extract_thread_id({"configurable": {"thread_id": "child-thread"}}) == "child-thread"
    assert extract_thread_id({"metadata": {"thread_id": "meta-thread"}}) == "meta-thread"
    assert extract_thread_id({"stream_event": {"thread_id": "event-thread"}}) == "event-thread"
    assert extract_thread_id({"meta": {"thread_id": "run-thread"}}) == "run-thread"


def test_extract_thread_id_uses_fallback_for_missing_or_unstable_paths():
    assert extract_thread_id(None, "fallback-thread") == "fallback-thread"
    assert extract_thread_id({"thread_id": " "}, "fallback-thread") == "fallback-thread"
    assert extract_thread_id({"data": {"metadata": {"thread_id": "nested-thread"}}}, "fallback-thread") == (
        "fallback-thread"
    )
    assert extract_thread_id({"metadata": {"configurable": {"thread_id": "nested-thread"}}}, "fallback-thread") == (
        "fallback-thread"
    )
