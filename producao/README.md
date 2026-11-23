# Pós-produção do Podcast Zirix

Transforma a gravação de um episódio (câmera A, câmera B e um WAV por lapela)
em episódio horizontal montado e em 4 a 6 cortes verticais legendados.
Spec: `docs/superpowers/specs/2026-11-18-podcast-zirix-design.md` (§5 e §6).

## Preparar o ambiente

O setup script do ambiente "Podcast Zirix" já instala tudo. Para instalar à mão:

    python3 -m pip install -r requirements-producao.txt

## Antes de gravar (iPhone)

- **HDR desligado** (Ajustes > Câmera > Gravar Vídeo > HDR Vídeo; no app
  Blackmagic Camera, codec sem HDR). A ferramenta recusa vídeo HLG/Dolby Vision,
  que ficaria com cores lavadas e diferentes entre as câmeras.
- Câmera A em 4K a 30 fps; câmera B em 1080p a 30 fps.
- Transmissores podem ser ligados antes e desligados depois das câmeras: a
  sincronia acha a sobreposição sozinha.

## Fluxo de um episódio

1. Copie `episodios/modelo/episodio.yaml` para `episodios/EPxx/episodio.yaml` e
   preencha os campos: falantes, enquadramento (medido num quadro da câmera A em
   4K) e `fontes:` (links do Google Drive).
2. Rode as etapas abaixo. Cada etapa grava em `trabalho/EPxx/`, que fica fora do
   git, e pula o que já foi feito (`--refazer` força a repetição).

| Comando | O que faz |
|---|---|
| `python3 -m producao baixar EPxx` | Baixa os arquivos do Drive (compartilhados por link) |
| `python3 -m producao preparar EPxx` | Converte para 30 fps constante, sincroniza B e as lapelas com A (corrigindo a deriva), identifica quem fala e mixa o áudio em −16 LUFS |
| `python3 -m producao transcrever EPxx` | Gera `palavras.json` e `transcricao.txt` (`[mm:ss] Nome: texto`) |
| `python3 -m producao montar EPxx --inicio S --fim S` | **Parada 2:** gera `episodio.mp4` para revisão |
| `python3 -m producao cortar EPxx` | **Parada 1:** exige `episodios/EPxx/cortes.yaml` com `aprovado: true`. Os cortes saem da câmera A em 4K (sem as inserções da B) e não dependem do `montar` |

`cortes.yaml`: o Claude propõe a lista a partir de `transcricao.txt`. São de 4
a 6 cortes, de 30 a 90 s cada, com tempos na linha do tempo da câmera A.

    aprovado: false   # Fabio ou Saulo mudam para true depois de revisar
    cortes:
      - {id: c1, inicio: 754.2, fim: 812.0, titulo: "Quanto custa um ônibus parado"}

## Testes

    python3 -m pytest tests/producao -q                       # rápidos (~3 min)
    python3 -m pytest tests/producao -q -m "lento or not lento" # inclui transcrição real

## Parâmetros a calibrar com a gravação de teste

| Parâmetro | Onde | Valor inicial |
|---|---|---|
| Piso de silêncio da lapela | `falantes.linha_do_tempo(piso_db=)` | −50 dBFS |
| Margem entre falantes | `falantes.linha_do_tempo(margem_db=)` | 6 dB |
| Inserção da câmera B | `montagem.decidir_planos(insercao=, fala_longa=, min_a=)` | 6 s, 25 s, 8 s |
