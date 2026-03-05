import os
import json
import logging
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
logger = logging.getLogger(__name__)

def korrigiere_und_kategorisiere(name: str) -> dict:
    """
    Korrigiert die Rechtschreibung eines Produktnamens und kategorisiert es.
    Gibt JSON zurück:
    {
        "corrected_name": "Milch",
        "kategorie": "Gekühltes",
        "unterkategorie": "Molkereiprodukte"
    }
    """
    prompt = f"""Du bist ein erfahrener Supermarktmitarbeiter. Deine Aufgabe:

1. Korrigiere die Rechtschreibung des Produktnamens:
   - Behalte den Namen so nah am Original wie möglich.
   - Korrigiere nur offensichtliche Tippfehler.
   - Normalisiere Großschreibung (Substantive groß).

2. Ordne das Produkt exakt einer dieser Kategorien und Unterkategorien zu:

Ungekühltes:
  - Obst & Gemüse
  - Backwaren & Brot
  - Nudeln, Reis & Körner
  - Konserven
  - Süßwaren & Snacks
  - Getränke
  - Gewürze & Saucen
  - Hygieneartikel
  - Haushalt & Reinigung

Gekühltes:
  - Molkereiprodukte
  - Fleisch & Wurst
  - Fisch
  - Fertiggerichte (gekühlt)
  - Getränke (gekühlt)

Tiefgekühltes:
  - Tiefkühlgemüse
  - Tiefkühlpizza & Fertiggerichte
  - Tiefkühleis
  - Tiefkühlfleisch & Fisch

Hinweise:
- Alkohol (Bier, Wein, Vodka, Gin, Rum, Whisky, Sekt etc.) → Ungekühltes › Getränke
- Säfte, Wasser, Limonaden → Ungekühltes › Getränke
- Milch, Joghurt, Käse, Butter → Gekühltes › Molkereiprodukte
- Wähle immer die am besten passende Unterkategorie aus der Liste oben.

Produkt: "{name}"

Antworte mit einem JSON-Objekt mit genau diesen drei Feldern:
corrected_name, kategorie, unterkategorie"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=200,
        response_format={"type": "json_object"},  # erzwingt valides JSON, kein Markdown
    )

    raw = response.choices[0].message.content.strip()
    logger.info(f"AI-Antwort für '{name}': {raw}")

    result = json.loads(raw)

    # Sicherstellen dass alle Felder vorhanden sind
    return {
        "corrected_name":   result.get("corrected_name", name),
        "kategorie":        result.get("kategorie"),
        "unterkategorie":   result.get("unterkategorie"),
    }