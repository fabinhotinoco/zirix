import pytest

from producao.ingestao import url_download


def test_url_download_de_link_do_drive():
    assert url_download("https://drive.google.com/file/d/ABC123/view?usp=sharing") == \
        "https://drive.usercontent.google.com/download?id=ABC123&export=download&confirm=t"


def test_url_download_de_link_open_id():
    assert url_download("https://drive.google.com/open?id=XYZ_9-a") == \
        "https://drive.usercontent.google.com/download?id=XYZ_9-a&export=download&confirm=t"


def test_url_download_recusa_outro_host():
    with pytest.raises(ValueError, match="Google Drive"):
        url_download("https://exemplo.com/arquivo.mov")
