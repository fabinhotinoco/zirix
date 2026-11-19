import pytest

from apoio import gerar_video


@pytest.fixture
def video_sintetico(tmp_path):
    return gerar_video(tmp_path / "sintetico.mp4")
