from database import SessionLocal
from models import Category, Subcategory, Product

db = SessionLocal()

# Kategorien und Unterkategorien definieren
data = {
    "Tiefgekühltes": {
        "position": 2,
        "subcategories": [
            "Tiefkühlgemüse",
            "Tiefkühlpizza & Fertiggerichte",
            "Tiefkühleis",
            "Tiefkühlfleisch & Fisch"
        ]
    },
    "Gekühltes": {
        "position": 1,
        "subcategories": [
            "Molkereiprodukte",
            "Fleisch & Wurst",
            "Fisch",
            "Fertiggerichte (gekühlt)",
            "Getränke (gekühlt)"
        ]
    },
    "Ungekühltes": {
        "position": 0,
        "subcategories": [
            "Obst & Gemüse",
            "Backwaren & Brot",
            "Nudeln, Reis & Körner",
            "Konserven",
            "Süßwaren & Snacks",
            "Getränke",
            "Gewürze & Saucen",
            "Hygieneartikel",
            "Haushalt & Reinigung"
        ]
    }
}

# Kategorien und Subcategories in DB schreiben
subcategory_map = {}  # Name → Subcategory-Objekt, für Produktzuordnung später

for cat_name, cat_data in data.items():
    category = Category(name=cat_name, position=cat_data["position"])
    db.add(category)
    db.flush()  # gibt category.id, ohne vollen commit

    for i, sub_name in enumerate(cat_data["subcategories"]):
        subcategory = Subcategory(
            name=sub_name,
            position=i,
            category_id=category.id
        )
        db.add(subcategory)
        db.flush()
        subcategory_map[sub_name] = subcategory

# Startprodukte definieren
products = [
    ("Milch", "Molkereiprodukte"),
    ("Butter", "Molkereiprodukte"),
    ("Joghurt", "Molkereiprodukte"),
    ("Käse", "Molkereiprodukte"),
    ("Eier", "Molkereiprodukte"),
    ("Hähnchenbrust", "Fleisch & Wurst"),
    ("Hackfleisch", "Fleisch & Wurst"),
    ("Salami", "Fleisch & Wurst"),
    ("Lachs", "Fisch"),
    ("Äpfel", "Obst & Gemüse"),
    ("Bananen", "Obst & Gemüse"),
    ("Tomaten", "Obst & Gemüse"),
    ("Kartoffeln", "Obst & Gemüse"),
    ("Zwiebeln", "Obst & Gemüse"),
    ("Brot", "Backwaren & Brot"),
    ("Brötchen", "Backwaren & Brot"),
    ("Spaghetti", "Nudeln, Reis & Körner"),
    ("Reis", "Nudeln, Reis & Körner"),
    ("Dosentomaten", "Konserven"),
    ("Kichererbsen", "Konserven"),
    ("Schokolade", "Süßwaren & Snacks"),
    ("Chips", "Süßwaren & Snacks"),
    ("Orangensaft", "Getränke"),
    ("Wasser", "Getränke"),
    ("Olivenöl", "Gewürze & Saucen"),
    ("Salz", "Gewürze & Saucen"),
    ("Pfeffer", "Gewürze & Saucen"),
    ("Shampoo", "Hygieneartikel"),
    ("Zahnpasta", "Hygieneartikel"),
    ("Spülmittel", "Haushalt & Reinigung"),
    ("Tiefkühlpizza", "Tiefkühlpizza & Fertiggerichte"),
    ("Erbsen (TK)", "Tiefkühlgemüse"),
    ("Vanilleeis", "Tiefkühleis"),
]

for product_name, sub_name in products:
    product = Product(
        name=product_name,
        subcategory_id=subcategory_map[sub_name].id,
        ai_verified=False
    )
    db.add(product)

db.commit()
print(f"Datenbank befüllt: {len(data)} Kategorien, {len(subcategory_map)} Unterkategorien, {len(products)} Produkte")
db.close()