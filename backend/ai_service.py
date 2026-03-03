from openai import OpenAI
from dotenv import load_dotenv
import os
import json

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Alle verfügbaren Kategorien und Unterkategorien
KATEGORIEN = {
    "Tiefgekühltes": ["Tiefkühlgemüse", "Tiefkühlpizza & Fertiggerichte", "Tiefkühleis", "Tiefkühlfleisch & Fisch"],
    "Gekühltes": ["Molkereiprodukte", "Fleisch & Wurst", "Fisch", "Fertiggerichte (gekühlt)", "Getränke (gekühlt)"],
    "Ungekühltes": ["Obst & Gemüse", "Backwaren & Brot", "Nudeln, Reis & Körner", "Konserven", "Süßwaren & Snacks", "Getränke", "Gewürze & Saucen", "Hygieneartikel", "Haushalt & Reinigung"]
}

def kategorisiere_produkt(produktname: str) -> dict:
    """Fragt OpenAI nach der Kategorie eines Produkts"""
    
    prompt = f"""Du bist ein Supermarkt-Kategorisierungssystem.
Ordne das Produkt "{produktname}" einer Kategorie und Unterkategorie zu.

Verfügbare Kategorien und Unterkategorien:
{json.dumps(KATEGORIEN, ensure_ascii=False, indent=2)}

Antworte NUR mit einem JSON-Objekt in diesem Format:
{{"kategorie": "Gekühltes", "unterkategorie": "Fleisch & Wurst"}}

Wähle die am besten passende Unterkategorie. Wenn nichts passt, nutze "Ungekühltes" und "Sonstiges"."""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0
    )
    
    antwort = response.choices[0].message.content.strip()
    return json.loads(antwort)