import pathlib

from PIL import Image, ImageDraw, ImageFont

FONDOS = (18, 63, 109, 255)
BANDA = (46, 109, 180, 255)
BLANCO = (255, 255, 255, 255)
FUENTES = [
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def generar(destino, tamano):
    imagen = Image.new("RGBA", (tamano, tamano), (0, 0, 0, 0))
    dibujo = ImageDraw.Draw(imagen)
    dibujo.rounded_rectangle([0, 0, tamano - 1, tamano - 1], radius=int(tamano * 0.19), fill=FONDOS)

    margen = tamano * 0.17
    arriba = tamano * 0.24
    abajo = tamano - tamano * 0.17
    dibujo.rounded_rectangle([margen, arriba, tamano - margen, abajo], radius=int(tamano * 0.055), fill=BLANCO)
    dibujo.rounded_rectangle(
        [margen, arriba, tamano - margen, arriba + tamano * 0.15],
        radius=int(tamano * 0.055),
        fill=BANDA,
    )
    dibujo.rectangle([margen, arriba + tamano * 0.1, tamano - margen, arriba + tamano * 0.15], fill=BANDA)

    fuente = None
    for ruta in FUENTES:
        try:
            fuente = ImageFont.truetype(ruta, int(tamano * 0.22))
            break
        except OSError:
            continue
    if fuente is None:
        fuente = ImageFont.load_default()

    centro = (tamano / 2, arriba + (abajo - arriba) * 0.63)
    dibujo.text(centro, "10A", font=fuente, fill=FONDOS, anchor="mm")
    imagen.save(destino)


def main():
    carpeta = pathlib.Path(__file__).resolve().parent.parent
    generar(carpeta / "icono-192.png", 192)
    generar(carpeta / "icono-512.png", 512)
    print("Iconos generados: icono-192.png, icono-512.png")


if __name__ == "__main__":
    main()
