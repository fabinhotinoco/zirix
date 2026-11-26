"""Fundo de tela da TV do set do Zirix Podcast (1920x1080).

Logo da Zirix + "PODCAST" e, na faixa de baixo, espaço para patrocinadores.
Os logos dos patrocinadores são repintados numa cor só da paleta da Zirix,
para o fundo manter a nossa identidade de cores.

Uso:
    python3 identidade/fundo_tv.py saida.png
    python3 identidade/fundo_tv.py saida.png --patrocinadores a.png b.png --cor cinza
    python3 identidade/fundo_tv.py saida.png --sem-faixa
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

AQUI = Path(__file__).parent
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
W, H = 1920, 1080
VERMELHO = (206, 51, 47)      # #CE332F, medido no logo
GRAFITE = (58, 58, 60)
CINZA = (120, 120, 124)
FUNDO = (248, 247, 245)
FAIXA = (239, 237, 233)
CORES = {"vermelho": VERMELHO, "grafite": GRAFITE, "cinza": CINZA}
MAX_PATROCINADORES = 4


def fonte(tam: int, negrito: bool = True) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FB if negrito else FR, tam)


def monocromatico(caminho: Path, rgb: tuple[int, int, int]) -> Image.Image:
    """Logo do patrocinador numa cor só, preservando o desenho (alfa ou luminância)."""
    im = Image.open(caminho).convert("RGBA")
    alfa = im.getchannel("A")
    if alfa.getextrema() == (255, 255):
        # Sem transparência: o fundo é a cor do canto; o desenho é o que difere dela.
        fundo = im.getpixel((0, 0))[:3]
        rgb_im = im.convert("RGB")
        dist = Image.eval(rgb_im.split()[0], lambda v: abs(v - fundo[0]))
        for canal, ref in zip(rgb_im.split()[1:], fundo[1:]):
            dist = ImageChops.lighter(dist, Image.eval(canal, lambda v, r=ref: abs(v - r)))
        alfa = dist.point(lambda v: 255 if v > 24 else 0)
    saida = Image.new("RGBA", im.size, rgb + (0,))
    saida.putalpha(alfa)
    caixa = saida.getbbox()
    return saida.crop(caixa) if caixa else saida


def original(caminho: Path) -> Image.Image:
    """Logo do patrocinador nas cores originais (fundo sólido vira transparente)."""
    im = Image.open(caminho).convert("RGBA")
    if im.getchannel("A").getextrema() == (255, 255):
        im.putalpha(_forma(im))
    caixa = im.getbbox()
    return im.crop(caixa) if caixa else im


def _forma(im: Image.Image) -> Image.Image:
    fundo = im.getpixel((0, 0))[:3]
    canais = im.convert("RGB").split()
    dist = Image.eval(canais[0], lambda v: abs(v - fundo[0]))
    for canal, ref in zip(canais[1:], fundo[1:]):
        dist = ImageChops.lighter(dist, Image.eval(canal, lambda v, r=ref: abs(v - r)))
    return dist.point(lambda v: 255 if v > 24 else 0)


def caber(im: Image.Image, w: int, h: int) -> Image.Image:
    k = min(w / im.width, h / im.height)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


def nome_como_logo(nome: str, rgb: tuple[int, int, int]) -> Image.Image:
    """Provisório enquanto não há o arquivo do logo: o nome da empresa em texto."""
    f = fonte(50)
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    w = int(tmp.textlength(nome, font=f)) + 10
    im = Image.new("RGBA", (w, 90), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((5, 5), nome, font=f, fill=rgb + (255,))
    return im.crop(im.getbbox())


TEMAS = {
    # fundo, faixa, linha da faixa, cor do logo/destaque, cor do texto, cor dos apoiadores
    "claro":    dict(fundo=FUNDO, faixa=FAIXA, linha=VERMELHO, marca=None, destaque=VERMELHO,
                     texto=(70, 70, 70), apoio="grafite"),
    "branco":   dict(fundo=(255, 255, 255), faixa=(255, 255, 255), linha=VERMELHO, marca=None,
                     destaque=VERMELHO, texto=(70, 70, 70), apoio="vermelho"),
    "vermelho": dict(fundo=VERMELHO, faixa=(178, 40, 37), linha=(255, 255, 255), marca=(255, 255, 255),
                     destaque=(255, 255, 255), texto=(255, 232, 230), apoio="branco"),
}
CORES["branco"] = (255, 255, 255)


def _logo(rgb: tuple[int, int, int] | None, largura: int, altura: int) -> Image.Image:
    lg = Image.open(AQUI / "logo-zirix.png").convert("RGBA")
    if rgb is not None:  # repinta mantendo a transparência (as ondas continuam em degradê)
        novo = Image.new("RGBA", lg.size, rgb + (0,))
        novo.putalpha(lg.getchannel("A"))
        lg = novo
    return caber(lg, largura, altura)


def gerar(saida: Path, patrocinadores: list[Path | str], cor: str | None = None, faixa: bool = True,
          tema: str = "claro", layout: str = "horizontal", apoio_original: bool = False,
          escala: int = 1) -> Path:
    """`patrocinadores`: arquivo de logo (PNG/JPG) ou, se não for arquivo, o nome da empresa.

    tema: claro | branco | vermelho. layout: horizontal | centralizado.
    apoio_original: faixa de apoio branca com os logos nas cores originais.
    escala: 1 = Full HD (1920x1080); 2 = 4K (3840x2160), desenhado nativamente (não é ampliação).
    """
    if len(patrocinadores) > MAX_PATROCINADORES:
        raise ValueError(f"no máximo {MAX_PATROCINADORES} patrocinadores na faixa")
    S = lambda v: int(round(v * escala))  # noqa: E731 — coordenadas do layout Full HD na escala pedida
    LW, LH = S(W), S(H)
    t = TEMAS[tema]
    cor_apoio = CORES[cor or t["apoio"]]
    im = Image.new("RGBA", (LW, LH), t["fundo"] + (255,))
    d = ImageDraw.Draw(im)
    base = 0 if faixa else 110

    if layout == "horizontal":
        lg = _logo(t["marca"], S(760), S(300))
        im.alpha_composite(lg, (S(200), S(430 + base) - lg.height // 2))
        d.rectangle([S(1030), S(280 + base), S(1038), S(600 + base)], fill=t["destaque"])
        d.text((S(1090), S(300 + base)), "PODCAST", font=fonte(S(124)), fill=t["destaque"])
        d.text((S(1096), S(470 + base)), "a conversa de quem", font=fonte(S(46), False), fill=t["texto"])
        d.text((S(1096), S(530 + base)), "opera ônibus", font=fonte(S(46), False), fill=t["texto"])
    else:
        lg = _logo(t["marca"], S(820), S(300))
        im.alpha_composite(lg, ((LW - lg.width) // 2, S(150 + base)))
        f = fonte(S(96)); txt = "P O D C A S T"
        d.text(((LW - d.textlength(txt, font=f)) / 2, S(150 + base) + lg.height + S(40)), txt, font=f, fill=t["destaque"])
        sub = "a conversa de quem opera ônibus"; fs = fonte(S(40), False)
        d.text(((LW - d.textlength(sub, font=fs)) / 2, S(150 + base) + lg.height + S(175)), sub, font=fs, fill=t["texto"])

    if faixa:
        cor_faixa = (255, 255, 255) if apoio_original else t["faixa"]
        rotulo = VERMELHO if apoio_original else t["destaque"]
        d.rectangle([0, S(800), LW, LH], fill=cor_faixa)
        if not apoio_original:
            d.rectangle([0, S(800), LW, S(806)], fill=t["linha"])
        d.text((S(200), S(900)), "APOIO", font=fonte(S(34)), fill=rotulo)
        slot_w, slot_h, gap, x0, y0 = S(300), S(130), S(40), S(420), S(860)
        for i in range(MAX_PATROCINADORES):
            x = x0 + i * (slot_w + gap)
            if i < len(patrocinadores):
                item = patrocinadores[i]
                eh_arquivo = Path(str(item)).is_file()
                if apoio_original:
                    bruto = original(Path(item)) if eh_arquivo else nome_como_logo(str(item), GRAFITE)
                else:
                    bruto = monocromatico(Path(item), cor_apoio) if eh_arquivo else nome_como_logo(str(item), cor_apoio)
                if not eh_arquivo and escala != 1:
                    bruto = bruto.resize((bruto.width * escala, bruto.height * escala), Image.LANCZOS)
                # nomes em texto mantêm o mesmo tamanho; só logos de arquivo são ajustados à caixa
                lg = (caber(bruto, slot_w - S(40), slot_h - S(20))
                      if eh_arquivo or bruto.width > slot_w - S(40) else bruto)
                im.alpha_composite(lg, (x + (slot_w - lg.width) // 2, y0 + (slot_h - lg.height) // 2))
            elif not patrocinadores:
                d.rounded_rectangle([x, y0, x + slot_w, y0 + slot_h], S(14), outline=t["texto"], width=S(3))
                tx = "SEU LOGO AQUI"; ft = fonte(S(24))
                d.text((x + (slot_w - d.textlength(tx, font=ft)) / 2, y0 + S(50)), tx, font=ft, fill=t["texto"])
    im.convert("RGB").save(saida)
    return Path(saida)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("saida", type=Path)
    ap.add_argument("--patrocinadores", nargs="*", default=[],
                    help="arquivo do logo ou nome da empresa (texto provisório)")
    ap.add_argument("--cor", choices=sorted(CORES), default=None, help="cor dos apoiadores (padrão: a do tema)")
    ap.add_argument("--tema", choices=sorted(TEMAS), default="claro")
    ap.add_argument("--apoio-original", action="store_true",
                    help="faixa de apoio branca, com os logos nas cores originais")
    ap.add_argument("--4k", dest="quatro_k", action="store_true", help="gera em 3840x2160 (4K)")
    ap.add_argument("--layout", choices=["horizontal", "centralizado"], default="horizontal")
    ap.add_argument("--sem-faixa", action="store_true")
    a = ap.parse_args()
    print(gerar(a.saida, a.patrocinadores, a.cor, not a.sem_faixa, a.tema, a.layout, a.apoio_original,
                2 if a.quatro_k else 1))
