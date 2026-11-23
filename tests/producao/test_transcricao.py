import shutil
import subprocess

import pytest

from producao.falantes import Trecho
from producao.transcricao import Palavra, carregar, salvar, texto_com_tempos, transcrever


def test_texto_com_tempos_formata_por_falante():
    p = [Palavra(0.0, 0.4, "Bom"), Palavra(0.4, 0.8, "dia"), Palavra(65.0, 65.5, "Obrigado")]
    f = [Trecho(0, 60, "fabio"), Trecho(60, 70, "saulo")]
    assert texto_com_tempos(p, f, nomes={"fabio": "Fabio", "saulo": "Saulo"}) == \
        "[00:00] Fabio: Bom dia\n[01:05] Saulo: Obrigado"


def test_texto_com_tempos_horas():
    p = [Palavra(3725.0, 3725.5, "fim")]
    assert texto_com_tempos(p, [Trecho(0, 4000, "fabio")], {"fabio": "Fabio"}) == "[1:02:05] Fabio: fim"


def test_salvar_e_carregar(tmp_path):
    p = [Palavra(0.0, 0.4, "ônibus")]
    salvar(p, tmp_path / "p.json")
    assert carregar(tmp_path / "p.json") == p


@pytest.mark.lento
@pytest.mark.skipif(not shutil.which("espeak-ng"), reason="espeak-ng não instalado")
def test_transcreve_portugues(tmp_path):
    wav = tmp_path / "frase.wav"
    subprocess.run(["espeak-ng", "-v", "pt-br", "-s", "130", "-w", str(wav),
                    "A frota de ônibus urbano precisa de telemetria."], check=True)
    palavras = transcrever(wav)
    texto = " ".join(p.texto.lower() for p in palavras)
    assert "ônibus" in texto or "onibus" in texto
    assert all(p.fim >= p.inicio for p in palavras)
