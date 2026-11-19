# Pós-produção do Podcast Zirix — Plano de implantação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar os arquivos de uma gravação (câmera A, câmera B e um WAV por transmissor de lapela) num episódio horizontal montado e em 4 a 6 cortes verticais legendados, rodando neste ambiente com `python -m producao`.

**Architecture:** Pacote Python `producao/` com módulos pequenos e puros (sincronia, quem fala, legendas, enquadramento), testados com sinais sintéticos. Uma camada fina chama o ffmpeg para extrair áudio, normalizar e renderizar. Cada episódio tem um `episodios/EPxx/episodio.yaml` versionado. A mídia fica fora do git, em `trabalho/EPxx/`. Duas paradas para aprovação humana: lista de cortes e episódio montado.

**Tech Stack:** Python 3.13, numpy, PyYAML, faster-whisper (modelo `small`, pt), ffmpeg 6.1 (já instalado), pytest.

**Spec:** `docs/superpowers/specs/2026-11-18-podcast-zirix-design.md` (§5 Produção, §6 Pós-produção). Ler §5.2, §5.3 e §6.1 antes de começar.

## Global Constraints

- Câmera A: iPhone 16, 4K 30 fps HEVC, é a **câmera mestre**. Câmera B: 1080p 30 fps.
- Fonte oficial de áudio: **a gravação interna de cada transmissor** (um WAV por pessoa, 32-bit float). O áudio das câmeras serve só para sincronia.
- Áudio do episódio normalizado em **−16 LUFS**.
- Cortes verticais: **1080×1920 (9:16)**, de **30 a 90 s**, de **4 a 6 por episódio**, com **legenda queimada** e cartela final com o chamado: "Quer um diagnóstico da sua frota? Chama no WhatsApp da Zirix."
- Transcrição: faster-whisper, modelo `small`, idioma `pt`, marca de tempo por palavra, em CPU (o ambiente não tem GPU).
- Código em `producao/`, testes em `tests/producao/`, dados de episódio em `episodios/EPxx/`, mídia em `trabalho/EPxx/` (fora do git). Nada de `.mp4`, `.mov` ou `.wav` no git: o `.gitignore` já bloqueia.
- Nenhum segredo no repositório.
- Etapas retomáveis: cada comando grava a saída em `trabalho/EPxx/` e pula o que já existir, salvo com `--refazer`.
- Duas paradas obrigatórias para aprovação do Fabio ou do Saulo: (1) lista de cortes antes de renderizar e (2) episódio montado antes de publicar.

## Review Focus

1. **A câmera B começa depois, para no meio ou tem pausas.** O esperado é que a sincronia funcione mesmo assim e que trechos sem câmera B usem só a câmera A. Coberto na Task 2 (`test_offset_com_inicio_atrasado`) e na Task 5 (`test_sem_b_usa_so_a`).
2. **Relógios diferentes derivam ao longo de 60 min.** Duas fontes que começam alinhadas podem terminar dezenas de milissegundos fora de sincronia. O esperado é medir o atraso no início e no fim e corrigir a deriva linearmente. Coberto na Task 2 (`test_deriva_linear`).
3. **O iPhone grava com taxa de quadros variável.** O esperado é converter para 30 fps constante antes de montar, para o vídeo não escorregar em relação ao áudio. Coberto na Task 1 (`test_normaliza_cfr`).
4. **A lapela de um capta a voz do outro.** O esperado é que "quem fala" use energia relativa, com margem, e não um limiar absoluto, para o vazamento não virar fala. Coberto na Task 3 (`test_vazamento_nao_vira_fala`).
5. **O corte começa ou termina no meio de uma palavra.** O esperado é ajustar as bordas para o limite da palavra mais próxima. Coberto na Task 6 (`test_ajusta_para_borda_de_palavra`).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `producao/__init__.py` | Versão do pacote |
| `producao/__main__.py` | CLI: `python -m producao <comando> EPxx` |
| `producao/episodio.py` | Lê e valida o `episodio.yaml` e resolve os caminhos do episódio |
| `producao/midia.py` | Chamadas ao ffmpeg: extrair áudio, ler WAV, converter para fps constante, medir e normalizar loudness |
| `producao/sincronia.py` | Atraso e deriva entre duas fontes de áudio (correlação cruzada) |
| `producao/falantes.py` | Linha do tempo de quem fala, a partir da energia de cada lapela |
| `producao/transcricao.py` | Envolve o faster-whisper e grava palavras com tempo |
| `producao/montagem.py` | Decide os planos A/B e renderiza o episódio horizontal |
| `producao/cortes.py` | Bordas por palavra, legenda ASS, enquadramento 9:16 e render dos cortes |
| `producao/ingestao.py` | Baixa os arquivos do episódio a partir de links do Google Drive |
| `episodios/modelo/episodio.yaml` | Modelo de configuração de episódio |
| `producao/README.md` | Como rodar cada etapa |
| `requirements-producao.txt` | Dependências fixadas |
| `tests/producao/…` | Um arquivo de teste por módulo e `conftest.py` com geradores de mídia sintética |

### Formato do `episodio.yaml` (contrato entre as tasks)

```yaml
codigo: EP00
titulo: "Piloto"
data_gravacao: 2026-12-07
local: estudio            # estudio | externo
camera_a: camera_a.mov    # caminhos relativos a trabalho/EPxx/
camera_b: camera_b.mov    # opcional
falantes:                 # um WAV por transmissor (fonte oficial de áudio)
  fabio:  {arquivo: tx1.wav, nome: "Fabio Tinoco"}
  saulo:  {arquivo: tx2.wav, nome: "Saulo"}
  convidado: {arquivo: tx3.wav, nome: "Nome do convidado", cargo: "Diretor de Operações"}
enquadramento:            # recorte 9:16 de cada pessoa na câmera A (pixels da imagem 3840x2160)
  fabio:     {x: 300,  y: 0, w: 1215, h: 2160}
  saulo:     {x: 1312, y: 0, w: 1215, h: 2160}
  convidado: {x: 2325, y: 0, w: 1215, h: 2160}
fontes:                   # preenchido pela ingestão quando vier do Drive
  camera_a: "https://drive.google.com/file/d/<id>/view"
```

---

### Task 1: Base do pacote, configuração do episódio e ffmpeg

**Files:**
- Create: `producao/__init__.py`, `producao/episodio.py`, `producao/midia.py`, `episodios/modelo/episodio.yaml`, `requirements-producao.txt`
- Test: `tests/producao/conftest.py`, `tests/producao/test_episodio.py`, `tests/producao/test_midia.py`

**Interfaces:**
- Produces:
  - `episodio.Falante(id: str, arquivo: Path, nome: str, cargo: str | None)` (dataclass)
  - `episodio.Recorte(x: int, y: int, w: int, h: int)` (dataclass)
  - `episodio.Episodio(codigo: str, titulo: str, pasta: Path, camera_a: Path, camera_b: Path | None, falantes: dict[str, Falante], enquadramento: dict[str, Recorte])` (dataclass)
  - `episodio.carregar(codigo: str, raiz: Path = Path(".")) -> Episodio`, que lê `episodios/<codigo>/episodio.yaml` e faz os caminhos de mídia apontarem para `trabalho/<codigo>/`
  - `midia.extrair_audio(src: Path, dst: Path, taxa: int = 16000) -> Path` (WAV mono PCM 16-bit)
  - `midia.ler_wav(caminho: Path) -> tuple[np.ndarray, int]` (float32 em −1..1; aceita PCM 16/24 e float 32)
  - `midia.normalizar_cfr(src: Path, dst: Path, fps: int = 30) -> Path`
  - `midia.medir_lufs(caminho: Path) -> float`
  - `midia.normalizar_loudness(src: Path, dst: Path, alvo: float = -16.0) -> Path` (loudnorm em duas passagens)
  - `midia.duracao(caminho: Path) -> float` (segundos, via ffprobe)
- `conftest.py` produz as fixtures `video_sintetico(tmp_path)` (ffmpeg lavfi `testsrc2` 1280×720 com seno de 440 Hz, 10 s) e `wav_sintetico(tmp_path, sinal: np.ndarray, taxa: int)`, usadas por todas as tasks.

- [ ] **Step 1: Escrever os testes que falham**

```python
def test_carregar_resolve_caminhos(tmp_path):
    # cria episodios/EP99/episodio.yaml mínimo com camera_a e 2 falantes
    ep = carregar("EP99", raiz=tmp_path)
    assert ep.camera_a == tmp_path / "trabalho/EP99/camera_a.mov"
    assert set(ep.falantes) == {"fabio", "saulo"}
    assert ep.camera_b is None

def test_carregar_recusa_enquadramento_de_falante_inexistente(tmp_path):
    with pytest.raises(ValueError, match="enquadramento.*joao"):
        carregar("EP98", raiz=tmp_path)

def test_ler_wav_float32(tmp_path):        # WAV 32-bit float, como o do transmissor
    sinal, taxa = ler_wav(gravar_float32(tmp_path, np.full(48000, 0.5, np.float32), 48000))
    assert taxa == 48000 and sinal.dtype == np.float32 and abs(sinal.mean() - 0.5) < 1e-4

def test_normaliza_cfr(video_sintetico, tmp_path):
    saida = normalizar_cfr(video_sintetico, tmp_path / "cfr.mp4")
    assert ffprobe_campo(saida, "r_frame_rate") == "30/1"
    assert ffprobe_campo(saida, "avg_frame_rate") == "30/1"

def test_normalizar_loudness_chega_a_menos_16(video_sintetico, tmp_path):
    wav = extrair_audio(video_sintetico, tmp_path / "a.wav", taxa=48000)
    assert abs(medir_lufs(normalizar_loudness(wav, tmp_path / "n.wav")) - (-16.0)) <= 1.0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/producao/test_episodio.py tests/producao/test_midia.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'producao'`

- [ ] **Step 3: Implementar `producao/episodio.py` e `producao/midia.py` com as assinaturas acima.** Use `subprocess.run([...], check=True)` sem `shell=True`. Para `medir_lufs`, use o filtro `ebur128` e leia o "I:" do stderr. `requirements-producao.txt`: `numpy`, `PyYAML`, `faster-whisper`, `pytest`, com versões fixadas pelo que o `pip install` resolver.

- [ ] **Step 4: Rodar e ver passar**

Run: `pip install -r requirements-producao.txt && python -m pytest tests/producao -q`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add producao tests/producao episodios/modelo requirements-producao.txt
git commit -m "producao: base do pacote, episodio.yaml e chamadas ao ffmpeg"
```

---

### Task 2: Sincronia (atraso e deriva)

**Files:**
- Create: `producao/sincronia.py`
- Test: `tests/producao/test_sincronia.py`

**Interfaces:**
- Consumes: `midia.ler_wav`
- Produces:
  - `sincronia.estimar_atraso(ref: np.ndarray, outro: np.ndarray, taxa: int, max_seg: float = 120.0) -> float`. Devolve, em segundos, quanto `outro` começa depois de `ref` (positivo = começou depois). Usa correlação cruzada por FFT sobre o envelope (valor absoluto suavizado em 10 ms), para não depender da fase entre microfones diferentes.
  - `sincronia.Alinhamento(atraso: float, deriva: float)` (dataclass), em que `deriva` é segundos de atraso a mais por segundo de gravação
  - `sincronia.alinhar(ref: np.ndarray, outro: np.ndarray, taxa: int, janela_seg: float = 60.0) -> Alinhamento`. Mede o atraso numa janela no início e noutra no fim e calcula a deriva linear. Se a gravação for menor que `3 * janela_seg`, devolve `deriva=0.0`.
  - `sincronia.tempo_em_outro(t_ref: float, al: Alinhamento) -> float`, que é `t_ref - al.atraso - al.deriva * t_ref`

- [ ] **Step 1: Escrever os testes que falham**

```python
def test_atraso_conhecido():
    taxa = 16000; ruido = rng.normal(size=taxa * 30).astype(np.float32)
    outro = ruido[int(2.35 * taxa):]                 # outro começou 2,35 s depois
    assert abs(estimar_atraso(ruido, outro, taxa) - 2.35) < 0.01

def test_offset_com_inicio_atrasado():
    # câmera B ligada 40 s depois e desligada 20 s antes do fim
    ...
    assert abs(estimar_atraso(ref, b, taxa) - 40.0) < 0.02

def test_deriva_linear():
    # 'outro' reamostrado com fator 1.00002 (≈ 72 ms em 60 min)
    al = alinhar(ref, outro, taxa)
    assert abs(al.deriva - 2e-5) < 5e-6

def test_ganhos_diferentes_nao_atrapalham():
    assert abs(estimar_atraso(ruido, 0.05 * outro, taxa) - 2.35) < 0.01
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/producao/test_sincronia.py -q`
Expected: FAIL com `ImportError`

- [ ] **Step 3: Implementar `producao/sincronia.py` com as assinaturas acima** (numpy `rfft`/`irfft` com zero-padding para potência de 2; procurar o pico só em ±`max_seg`)

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/producao/test_sincronia.py -q`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add producao/sincronia.py tests/producao/test_sincronia.py
git commit -m "producao: sincronia por correlação com correção de deriva"
```

---

### Task 3: Quem fala

**Files:**
- Create: `producao/falantes.py`
- Test: `tests/producao/test_falantes.py`

**Interfaces:**
- Consumes: `midia.ler_wav`, `sincronia.Alinhamento`
- Produces:
  - `falantes.Trecho(inicio: float, fim: float, falante: str)` (dataclass)
  - `falantes.linha_do_tempo(faixas: dict[str, np.ndarray], taxa: int, quadro: float = 0.5, margem_db: float = 6.0, minimo: float = 1.5) -> list[Trecho]`. As faixas já chegam alinhadas à câmera A. Em cada quadro, o falante é quem tem energia RMS pelo menos `margem_db` acima de todos os outros e acima do piso de ruído da própria faixa (percentil 10 + 6 dB). Quadros sem vencedor recebem o falante anterior. Trechos menores que `minimo` são absorvidos pelo vizinho.
  - `falantes.salvar(trechos: list[Trecho], caminho: Path) -> None` e `falantes.carregar(caminho: Path) -> list[Trecho]` (JSON)

- [ ] **Step 1: Escrever os testes que falham**

```python
def test_alternancia_simples():
    # fabio fala 0–10 s, saulo 10–20 s (seno com envelope), silêncio no outro
    t = linha_do_tempo({"fabio": a, "saulo": b}, 16000)
    assert [(x.falante, round(x.inicio), round(x.fim)) for x in t] == [("fabio", 0, 10), ("saulo", 10, 20)]

def test_vazamento_nao_vira_fala():
    # saulo fala; a lapela do fabio capta a mesma voz 12 dB abaixo
    t = linha_do_tempo({"fabio": 0.25 * voz, "saulo": voz}, 16000)
    assert {x.falante for x in t} == {"saulo"}

def test_interjeicao_curta_e_absorvida():
    # 'é' de 0,6 s do saulo no meio da fala do fabio não vira troca
    assert [x.falante for x in linha_do_tempo(...)] == ["fabio"]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/producao/test_falantes.py -q`
Expected: FAIL com `ImportError`

- [ ] **Step 3: Implementar `producao/falantes.py` com as assinaturas acima**

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/producao/test_falantes.py -q`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add producao/falantes.py tests/producao/test_falantes.py
git commit -m "producao: linha do tempo de quem fala por energia relativa"
```

---

### Task 4: Transcrição e ambiente

**Files:**
- Create: `producao/transcricao.py`
- Test: `tests/producao/test_transcricao.py`

**Interfaces:**
- Produces:
  - `transcricao.Palavra(inicio: float, fim: float, texto: str)` (dataclass)
  - `transcricao.transcrever(wav: Path, modelo: str = "small", idioma: str = "pt") -> list[Palavra]` (faster-whisper, `word_timestamps=True`, `vad_filter=True`, `compute_type="int8"`)
  - `transcricao.salvar(palavras, caminho: Path)` e `transcricao.carregar(caminho: Path) -> list[Palavra]` (JSON)
  - `transcricao.texto_com_tempos(palavras: list[Palavra], falantes: list[Trecho], nomes: dict[str, str]) -> str`: uma linha por troca de falante, no formato `[mm:ss] Nome: texto`. É o que o Claude lê para propor os cortes.

- [ ] **Step 1: Liberar o download do modelo.** Propor ao Fabio, com `update_environment` no ambiente "Podcast Zirix", os hosts `huggingface.co` e `cdn-lfs.huggingface.co`. Se o download for redirecionado para outro host, propor também esse host exato. Esperar a aprovação.

- [ ] **Step 2: Escrever os testes que falham**

```python
def test_texto_com_tempos_formata_por_falante():
    p = [Palavra(0.0, 0.4, "Bom"), Palavra(0.4, 0.8, "dia"), Palavra(65.0, 65.5, "Obrigado")]
    f = [Trecho(0, 60, "fabio"), Trecho(60, 70, "saulo")]
    assert texto_com_tempos(p, f, nomes={"fabio": "Fabio", "saulo": "Saulo"}) == "[00:00] Fabio: Bom dia\n[01:05] Saulo: Obrigado"

@pytest.mark.lento
def test_transcreve_portugues(tmp_path):
    # frase gerada com espeak-ng ("frota de ônibus urbano") ou WAV curto em tests/producao/dados/
    palavras = transcrever(wav_frase)
    assert "ônibus" in " ".join(p.texto.lower() for p in palavras)
```

(`nomes` vem de `Episodio.falantes`.)

- [ ] **Step 3: Rodar e ver falhar**

Run: `python -m pytest tests/producao/test_transcricao.py -q`
Expected: FAIL com `ImportError`

- [ ] **Step 4: Implementar `producao/transcricao.py` com as assinaturas acima**

- [ ] **Step 5: Rodar e ver passar, incluindo o teste lento**

Run: `python -m pytest tests/producao/test_transcricao.py -q -m "lento or not lento"`
Expected: PASS (2 testes). O primeiro uso baixa o modelo `small`.

- [ ] **Step 6: Gravar o setup do ambiente.** Testar o script a partir de `/home/user`, a pasta acima do repositório, e então propor com `update_environment` o setup script: `if [ -d zirix ]; then pip install -r zirix/requirements-producao.txt; fi`.

- [ ] **Step 7: Commit**

```bash
git add producao/transcricao.py tests/producao/test_transcricao.py
git commit -m "producao: transcrição com faster-whisper e texto por falante"
```

---

### Task 5: Montagem do episódio horizontal

**Files:**
- Create: `producao/montagem.py`
- Test: `tests/producao/test_montagem.py`

**Interfaces:**
- Consumes: `Episodio`, `Alinhamento`, `Trecho`, `midia.*`
- Produces:
  - `montagem.Plano(inicio: float, fim: float, camera: str)` (dataclass; `camera` é `"A"` ou `"B"`; tempos na linha do tempo da câmera A)
  - `montagem.decidir_planos(falantes: list[Trecho], duracao: float, cobertura_b: tuple[float, float] | None, fala_longa: float = 25.0, insercao: float = 6.0, min_a: float = 8.0) -> list[Plano]`. Regras: a base é A. Insere B por `insercao` segundos (1) logo depois de cada troca de falante e (2) a cada `fala_longa` segundos de uma mesma fala. Nunca deixa A por menos de `min_a` entre duas inserções. Só usa B dentro de `cobertura_b`.
  - `montagem.renderizar(ep: Episodio, planos: list[Plano], al_b: Alinhamento | None, audio: Path, saida: Path, corte_inicio: float, corte_fim: float) -> Path`. Gera um vídeo 1920×1080 a 30 fps com o áudio mixado das lapelas, já normalizado, cortando o tempo morto antes de `corte_inicio` e depois de `corte_fim`.
  - `montagem.mixar_lapelas(faixas_alinhadas: dict[str, Path], saida: Path) -> Path` (soma, `amix` com `normalize=0`, e depois `midia.normalizar_loudness`)

- [ ] **Step 1: Escrever os testes que falham**

```python
def test_insere_b_apos_troca_de_falante():
    p = decidir_planos([Trecho(0, 30, "fabio"), Trecho(30, 60, "saulo")], 60, (0, 60))
    assert Plano(30, 36, "B") in p and all(x.camera in "AB" for x in p)

def test_sem_b_usa_so_a():
    assert {x.camera for x in decidir_planos(trechos, 600, None)} == {"A"}

def test_b_so_dentro_da_cobertura():
    p = decidir_planos(trechos, 600, (100, 300))
    assert all(100 <= x.inicio and x.fim <= 300 for x in p if x.camera == "B")

def test_planos_cobrem_tudo_sem_buraco():
    p = decidir_planos(trechos, 600, (0, 600))
    assert p[0].inicio == 0 and p[-1].fim == 600
    assert all(a.fim == b.inicio for a, b in zip(p, p[1:]))

def test_renderiza_1080p30_com_duracao_certa(video_sintetico, tmp_path):
    saida = renderizar(ep_sintetico, planos, None, audio, tmp_path / "ep.mp4", 1.0, 9.0)
    assert ffprobe_resolucao(saida) == (1920, 1080) and abs(duracao(saida) - 8.0) < 0.1
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/producao/test_montagem.py -q`
Expected: FAIL com `ImportError`

- [ ] **Step 3: Implementar `producao/montagem.py` com as assinaturas acima.** Renderizar cada plano com `-ss/-to` da câmera certa (para B, os tempos passam por `sincronia.tempo_em_outro`), escalar para 1920×1080 e juntar com o filtro `concat`. O áudio é um só, por cima de tudo.

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/producao/test_montagem.py -q`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add producao/montagem.py tests/producao/test_montagem.py
git commit -m "producao: montagem do episódio horizontal com planos A/B"
```

---

### Task 6: Cortes verticais legendados

**Files:**
- Create: `producao/cortes.py`, `producao/estilo/legenda.ass.tpl`, `producao/estilo/cartela.png` (provisória; a identidade final vem na Task 8)
- Test: `tests/producao/test_cortes.py`

**Interfaces:**
- Consumes: `Palavra`, `Trecho`, `Recorte`, `Episodio`
- Produces:
  - `cortes.Corte(id: str, inicio: float, fim: float, titulo: str)` (dataclass)
  - `cortes.ler_lista(caminho: Path) -> list[Corte]`, que lê `episodios/EPxx/cortes.yaml` (escrito pelo Claude e **aprovado** pelo Fabio ou pelo Saulo). Recusa corte com menos de 30 s ou mais de 90 s, e lista com menos de 4 ou mais de 6 cortes.
  - `cortes.ajustar_bordas(c: Corte, palavras: list[Palavra], folga: float = 0.15) -> Corte`: o início vai para o começo da palavra mais próxima, menos a folga, e o fim para o fim da palavra mais próxima, mais a folga.
  - `cortes.legenda_ass(palavras: list[Palavra], inicio: float, fim: float, max_palavras: int = 4) -> str`: blocos de até 4 palavras, com tempos relativos ao início do corte, centralizados no terço inferior, fonte grande, contorno preto.
  - `cortes.enquadrar(trechos: list[Trecho], inicio: float, fim: float, enquadramento: dict[str, Recorte]) -> list[tuple[float, float, Recorte]]`: em cada intervalo, o recorte de quem está falando.
  - `cortes.renderizar(ep: Episodio, c: Corte, palavras, trechos, episodio_mp4: Path, saida: Path) -> Path`: vídeo 1080×1920 a 30 fps com legenda queimada e cartela de 3 s no fim.

- [ ] **Step 1: Escrever os testes que falham**

```python
def test_ajusta_para_borda_de_palavra():
    p = [Palavra(10.0, 10.4, "a"), Palavra(10.5, 11.0, "frota"), Palavra(49.6, 50.2, "fim")]
    c = ajustar_bordas(Corte("c1", 10.45, 49.9, "x"), p)
    assert c.inicio == pytest.approx(10.35) and c.fim == pytest.approx(50.35)

def test_lista_recusa_corte_fora_de_30_a_90(tmp_path):
    with pytest.raises(ValueError, match="c2.*95"):
        ler_lista(yaml_com_corte_de_95s)

def test_legenda_ass_blocos_e_tempos_relativos():
    ass = legenda_ass(palavras_8, inicio=100.0, fim=104.0)
    assert ass.count("Dialogue:") == 2 and "0:00:00.00" in ass

def test_enquadra_quem_fala():
    r = enquadrar([Trecho(0, 20, "fabio"), Trecho(20, 40, "saulo")], 10, 30, quadros)
    assert [x[2] for x in r] == [quadros["fabio"], quadros["saulo"]]

def test_renderiza_vertical_com_cartela(video_sintetico, tmp_path):
    saida = renderizar(ep_sintetico, Corte("c1", 0, 6, "x"), palavras, trechos, video_sintetico, tmp_path / "c1.mp4")
    assert ffprobe_resolucao(saida) == (1080, 1920) and abs(duracao(saida) - 9.0) < 0.15
```

Atenção: o recorte do `episodio.yaml` está em pixels da câmera A em 4K. Como `renderizar` recorta do episódio já montado em 1920×1080, `enquadrar` precisa escalar o `Recorte` por `1920 / 3840`. Teste isso em `test_enquadra_quem_fala`, com os quadros em 4K e a expectativa já escalada.

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/producao/test_cortes.py -q`
Expected: FAIL com `ImportError`

- [ ] **Step 3: Implementar `producao/cortes.py` com as assinaturas acima.** Para o recorte por intervalo, use `crop` com expressões `if(between(t,a,b),…)` ou um segmento por intervalo, juntos com `concat`. Depois `scale=1080:1920`, `subtitles=` com o ASS e, por fim, `concat` com a cartela.

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/producao/test_cortes.py -q`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add producao/cortes.py producao/estilo tests/producao/test_cortes.py
git commit -m "producao: cortes verticais com legenda e enquadramento em quem fala"
```

---

### Task 7: CLI ponta a ponta, ingestão e gravação de teste

**Files:**
- Create: `producao/__main__.py`, `producao/ingestao.py`, `producao/README.md`
- Modify: `.gitignore` (adicionar `trabalho/`)
- Test: `tests/producao/test_cli.py`, `tests/producao/test_ingestao.py`

**Interfaces:**
- Consumes: todos os módulos anteriores
- Produces: os comandos abaixo, cada um retomável, gravando em `trabalho/EPxx/`:

| Comando | Faz | Grava |
|---|---|---|
| `python -m producao baixar EPxx` | Baixa os arquivos listados em `fontes:` do yaml | mídia em `trabalho/EPxx/` |
| `python -m producao preparar EPxx` | Converte A e B para fps constante, extrai áudios, sincroniza B e cada lapela com A, monta a linha de quem fala e mixa | `alinhamento.json`, `falantes.json`, `audio_final.wav` |
| `python -m producao transcrever EPxx` | Transcreve o áudio final | `palavras.json`, `transcricao.txt` |
| `python -m producao montar EPxx --inicio S --fim S` | **Parada 2:** renderiza o episódio para revisão | `episodio.mp4` |
| `python -m producao cortar EPxx` | **Parada 1 cumprida:** exige `episodios/EPxx/cortes.yaml` com `aprovado: true` | `cortes/c1.mp4` … |

- `ingestao.url_download(link: str) -> str` converte `https://drive.google.com/file/d/<id>/view…` em `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t`. Links fora desse formato geram `ValueError`.

- [ ] **Step 1: Escrever os testes que falham**

```python
def test_url_download_de_link_do_drive():
    assert url_download("https://drive.google.com/file/d/ABC123/view?usp=sharing") == \
        "https://drive.usercontent.google.com/download?id=ABC123&export=download&confirm=t"

def test_cortar_exige_aprovacao(tmp_path):
    r = rodar_cli(["cortar", "EP99"], raiz=tmp_path)   # cortes.yaml com aprovado: false
    assert r.returncode != 0 and "aprovado" in r.stderr

def test_preparar_e_retomavel(tmp_path):
    rodar_cli(["preparar", "EP99"], raiz=tmp_path)
    mtime = (tmp_path / "trabalho/EP99/falantes.json").stat().st_mtime
    rodar_cli(["preparar", "EP99"], raiz=tmp_path)
    assert (tmp_path / "trabalho/EP99/falantes.json").stat().st_mtime == mtime

def test_ponta_a_ponta_sintetico(tmp_path):
    # vídeo A, vídeo B atrasado 2 s, 2 lapelas sintéticas; preparar → montar → cortar
    ...
    assert (tmp_path / "trabalho/EP99/cortes/c1.mp4").exists()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/producao/test_cli.py tests/producao/test_ingestao.py -q`
Expected: FAIL

- [ ] **Step 3: Implementar `producao/__main__.py` (argparse, um subcomando por linha da tabela, `--refazer` em todos) e `producao/ingestao.py`.** Liberar `drive.google.com` e `drive.usercontent.google.com` com `update_environment`, mediante aprovação do Fabio, antes do primeiro `baixar` real.

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/producao -q`
Expected: PASS (todos)

- [ ] **Step 5: Processar a gravação de teste de 27/11.** O Fabio sobe os arquivos e compartilha por link. Criar `episodios/EPTESTE/episodio.yaml` com os recortes medidos num quadro da câmera A, e rodar `baixar`, `preparar`, `transcrever` e `montar`. Conferir junto com o Fabio: sincronia labial (diferença menor que 1 quadro) no início e no fim, quem fala acertado em pelo menos 90% de uma amostra de 5 min, e loudness em −16 ± 1 LUFS. Registrar os ajustes de parâmetros no `README.md`.

- [ ] **Step 6: Commit**

```bash
git add producao tests/producao .gitignore episodios/EPTESTE/episodio.yaml
git commit -m "producao: CLI ponta a ponta, ingestão do Drive e calibração com a gravação de teste"
```

---

### Task 8: Identidade visual dos cortes

**Files:**
- Modify: `producao/estilo/legenda.ass.tpl`, `producao/estilo/cartela.png`
- Create: `producao/estilo/README.md` (fonte, cores, tamanhos e o porquê)

**Interfaces:**
- Consumes: `cortes.legenda_ass`, `cortes.renderizar`

- [ ] **Step 1: Propor 2 opções de estilo** de legenda e cartela, com a marca Zirix: fonte, cor de destaque e posição. Mostrar ao Fabio um quadro de cada opção, renderizado de um corte da gravação de teste.
- [ ] **Step 2: Aplicar a opção escolhida** no template e na cartela. A cartela tem o logo, "Quer um diagnóstico da sua frota? Chama no WhatsApp da Zirix." e o número comercial (quando o Rafael conectar).
- [ ] **Step 3: Rodar** `python -m pytest tests/producao/test_cortes.py -q` → PASS, e renderizar 1 corte real para aprovação final.
- [ ] **Step 4: Commit**

```bash
git add producao/estilo
git commit -m "producao: identidade visual da legenda e da cartela"
```

---

## Roteiro geral (este plano e os próximos)

| Semana | Este plano | Outros planos e pendências |
|---|---|---|
| 23 a 27/11 | Tasks 1 a 4. **Task 7, passo 5, com a gravação de teste de sexta, 27/11** (Tasks 5 a 7 adiantadas no que for preciso) | Rafael conecta o número comercial · Fabio compra lapelas, tripés e HD |
| 30/11 a 04/12 | Tasks 5 a 8 concluídas e calibradas | **Plano 2 — TalkWork:** atendentes, setores, etiquetas, qualificação (5 perguntas), IA e modelos enviados à Meta · Rafael entrega a integração até 04/12 |
| 07 a 11/12 | **EP00 (piloto)** de ponta a ponta | Teste de lead real: formulário `Podcast \| EP00 \| Teste` → ZXCRM → WhatsApp → fila |
| 14 a 18/12 | EP01 e EP02 processados | **Plano 3 — relatório semanal** (API de leitura do ZXCRM) |
| 19/12 a 11/01 | Ajustes | Pauta e convidados de fevereiro (lista de especialistas da Zirix) |
| **12/01/2027** | **Lançamento** | |
