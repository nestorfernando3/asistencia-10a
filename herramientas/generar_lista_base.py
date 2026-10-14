import datetime
import json
import pathlib
import sys

RETIRADAS = {494, 521}


def main():
    carpeta = pathlib.Path(__file__).resolve().parent
    origen = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else carpeta.parent.parent / "analisis_10A.json"
    registros = json.loads(origen.read_text(encoding="utf-8"))
    estudiantes = [
        {
            "mat": registro["mat"],
            "no": registro["no"],
            "nombre": registro["nombre"],
            "estado": "retirada" if registro["mat"] in RETIRADAS else "activo",
            "notaPersistente": None,
        }
        for registro in sorted(registros, key=lambda registro: registro["no"])
    ]
    salida = {
        "curso": "10°-A",
        "colegio": "IED Brisas del Río",
        "generado": datetime.date.today().isoformat(),
        "fuente": origen.name,
        "estudiantes": estudiantes,
    }
    destino = carpeta.parent / "datos-base"
    destino.mkdir(exist_ok=True)
    archivo = destino / "lista_10A_base.json"
    archivo.write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Listo: {archivo} ({len(estudiantes)} estudiantes)")


if __name__ == "__main__":
    main()
