from pathlib import Path

from ars.config import (
    get_legacy_storage_dir,
    get_runtime_dir,
    get_skill_data_dir,
    get_skill_projection_dir,
    get_user_data_dir,
)


def test_runtime_directory_uses_explicit_environment(monkeypatch, tmp_path: Path):
    """显式运行目录应由当前进程环境拥有。"""
    runtime_dir = tmp_path / "runtime" / "api"
    monkeypatch.setenv("ARS_RUNTIME_DIR", str(runtime_dir))

    assert get_runtime_dir() == runtime_dir


def test_runtime_directory_default_does_not_fall_back_to_save_dir(monkeypatch, tmp_path: Path):
    """缺少配置时，可丢弃运行数据不得回落到持久保存目录。"""
    save_dir = tmp_path / "saves"
    monkeypatch.setenv("ARS_LEGACY_STORAGE_DIR", str(save_dir))
    monkeypatch.delenv("ARS_RUNTIME_DIR", raising=False)

    runtime_dir = get_runtime_dir()

    assert runtime_dir != get_legacy_storage_dir()
    assert save_dir not in runtime_dir.parents
    assert runtime_dir.name.startswith("ars-runtime-")


def test_skill_storage_directories_support_explicit_domain_mounts(monkeypatch, tmp_path: Path):
    """Skill 持久源与授权投影必须能作为独立存储域挂载。"""
    data_dir = tmp_path / "skill-data"
    projection_dir = tmp_path / "skill-projections"
    monkeypatch.setenv("ARS_SKILL_DATA_DIR", str(data_dir))
    monkeypatch.setenv("ARS_SKILL_PROJECTION_DIR", str(projection_dir))

    assert get_skill_data_dir() == data_dir
    assert get_skill_projection_dir() == projection_dir


def test_storage_defaults_do_not_derive_from_legacy_save_dir(monkeypatch, tmp_path: Path):
    legacy_dir = tmp_path / "legacy-saves"
    monkeypatch.setenv("ARS_LEGACY_STORAGE_DIR", str(legacy_dir))
    monkeypatch.delenv("ARS_USER_DATA_DIR", raising=False)
    monkeypatch.delenv("ARS_SKILL_DATA_DIR", raising=False)
    monkeypatch.delenv("ARS_SKILL_PROJECTION_DIR", raising=False)

    assert get_user_data_dir() == Path("user-data")
    assert get_skill_data_dir() == Path("skill-sources")
    assert get_skill_projection_dir() == Path("skill-projections")
