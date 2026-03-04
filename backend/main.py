from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Category, Subcategory, Product, ShoppingList, ShoppingListItem
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from ai_service import korrigiere_und_kategorisiere

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8081"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str

class ShoppingListCreate(BaseModel):
    name: str

class ShoppingListItemCreate(BaseModel):
    product_id: int

class ItemSubcategoryUpdate(BaseModel):
    subcategory_id: int

class ProductResponse(BaseModel):
    id: int
    name: str
    subcategory_name: Optional[str] = None
    category_name: Optional[str] = None
    is_new: bool = False

    class Config:
        from_attributes = True

class ShoppingListItemResponse(BaseModel):
    id: int
    shopping_list_id: int
    product_id: int
    is_in_cart: bool

    class Config:
        from_attributes = True

# ─── Kategorien (mit Unterkategorien) ───────────────────────────────────────────────────────────────

@app.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """Gibt alle Kategorien mit ihren Unterkategorien zurück – explizit serialisiert
    um SQLAlchemy lazy-loading außerhalb der Session zu vermeiden."""
    kategorien = db.query(Category).order_by(Category.position).all()
    return [
        {
            "id": k.id,
            "name": k.name,
            "position": k.position,
            "subcategories": [
                {"id": s.id, "name": s.name, "position": s.position}
                for s in k.subcategories
            ]
        }
        for k in kategorien
    ]

# ─── Produkte ─────────────────────────────────────────────────────────────────

@app.get("/products")
def get_products(db: Session = Depends(get_db)):
    return db.query(Product).all()

@app.get("/products/search/{name}")
def search_product(name: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.name.ilike(f"%{name}%")).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    return product

@app.post("/products", response_model=ProductResponse)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    """
    3-Stufen-Lookup:
    1. Original-Name in DB suchen
    2. Falls nicht gefunden: AI korrigiert + kategorisiert
    3. Korrigierten Namen nochmal suchen
    4. Falls immer noch neu: Produkt anlegen
    """
    # ── Stufe 1 ───────────────────────────────────────────────────────────────
    vorhandenes_produkt = db.query(Product).filter(
        Product.name.ilike(product.name)
    ).first()

    war_neu = False

    if not vorhandenes_produkt:
        # ── Stufe 2: AI ───────────────────────────────────────────────────────
        try:
            ki_ergebnis = korrigiere_und_kategorisiere(product.name)
            corrected_name      = ki_ergebnis.get("corrected_name", product.name)
            unterkategorie_name = ki_ergebnis.get("unterkategorie")
        except Exception as e:
            print(f"AI-Fehler: {e}")
            corrected_name      = product.name
            unterkategorie_name = None

        # ── Stufe 3: Korrigierten Namen suchen ────────────────────────────────
        vorhandenes_produkt = db.query(Product).filter(
            Product.name.ilike(corrected_name)
        ).first()

        if not vorhandenes_produkt:
            # ── Stufe 4: Neu anlegen ──────────────────────────────────────────
            war_neu = True
            subcategory_id = None
            if unterkategorie_name:
                subcategory = db.query(Subcategory).filter(
                    Subcategory.name.ilike(unterkategorie_name)
                ).first()
                if subcategory:
                    subcategory_id = subcategory.id

            vorhandenes_produkt = Product(
                name=corrected_name,
                subcategory_id=subcategory_id,
                ai_verified=True
            )
            db.add(vorhandenes_produkt)
            db.commit()
            db.refresh(vorhandenes_produkt)

    # ── Kategorie für Response nachladen ──────────────────────────────────────
    subcategory_name = None
    category_name = None

    if vorhandenes_produkt.subcategory_id:
        subcategory = db.query(Subcategory).filter(
            Subcategory.id == vorhandenes_produkt.subcategory_id
        ).first()
        if subcategory:
            subcategory_name = subcategory.name
            category = db.query(Category).filter(
                Category.id == subcategory.category_id
            ).first()
            if category:
                category_name = category.name

    return ProductResponse(
        id=vorhandenes_produkt.id,
        name=vorhandenes_produkt.name,
        subcategory_name=subcategory_name,
        category_name=category_name,
        is_new=war_neu
    )

# ─── Einkaufslisten ───────────────────────────────────────────────────────────

@app.post("/lists")
def create_list(shopping_list: ShoppingListCreate, db: Session = Depends(get_db)):
    db_list = ShoppingList(name=shopping_list.name)
    db.add(db_list)
    db.commit()
    db.refresh(db_list)
    return db_list

@app.get("/lists/{list_id}/items")
def get_list_items(list_id: int, db: Session = Depends(get_db)):
    """
    Item-eigene subcategory_id hat Vorrang vor Produkt-subcategory_id.
    """
    items = db.query(ShoppingListItem).filter(
        ShoppingListItem.shopping_list_id == list_id
    ).all()

    result = []
    for item in items:
        product = db.query(Product).filter(Product.id == item.product_id).first()

        effective_subcategory_id = item.subcategory_id or (
            product.subcategory_id if product else None
        )

        subcategory_name = None
        category_name = None

        if effective_subcategory_id:
            subcategory = db.query(Subcategory).filter(
                Subcategory.id == effective_subcategory_id
            ).first()
            if subcategory:
                subcategory_name = subcategory.name
                category = db.query(Category).filter(
                    Category.id == subcategory.category_id
                ).first()
                if category:
                    category_name = category.name

        result.append({
            "id": item.id,
            "product_id": item.product_id,
            "subcategory_id": effective_subcategory_id,
            "name": product.name if product else "Unbekannt",
            "kategorie": category_name or "Sonstiges",
            "unterkategorie": subcategory_name,
            "is_in_cart": item.is_in_cart,
        })
    return result

@app.post("/lists/{list_id}/items", response_model=ShoppingListItemResponse)
def add_item_to_list(
    list_id: int,
    item: ShoppingListItemCreate,
    db: Session = Depends(get_db)
):
    """Kopiert subcategory_id vom Produkt in den Listeneintrag"""
    product = db.query(Product).filter(Product.id == item.product_id).first()

    db_item = ShoppingListItem(
        shopping_list_id=list_id,
        product_id=item.product_id,
        subcategory_id=product.subcategory_id if product else None,
        is_in_cart=False
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.patch("/lists/{list_id}/items/{item_id}/subcategory")
def update_item_subcategory(
    list_id: int,
    item_id: int,
    update: ItemSubcategoryUpdate,
    db: Session = Depends(get_db)
):
    """Ändert Kategorie NUR für diesen Listeneintrag – Produkt bleibt unverändert"""
    item = db.query(ShoppingListItem).filter(
        ShoppingListItem.id == item_id,
        ShoppingListItem.shopping_list_id == list_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    subcategory = db.query(Subcategory).filter(
        Subcategory.id == update.subcategory_id
    ).first()
    if not subcategory:
        raise HTTPException(status_code=404, detail="Unterkategorie nicht gefunden")

    item.subcategory_id = update.subcategory_id
    db.commit()
    db.refresh(item)
    return {"ok": True}

@app.delete("/lists/{list_id}/items/{item_id}")
def delete_list_item(list_id: int, item_id: int, db: Session = Depends(get_db)):
    """Entfernt Eintrag aus Liste – Produkt bleibt in DB"""
    item = db.query(ShoppingListItem).filter(
        ShoppingListItem.id == item_id,
        ShoppingListItem.shopping_list_id == list_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    db.delete(item)
    db.commit()
    return {"ok": True}

@app.patch("/lists/{list_id}/items/{item_id}/cart")
def toggle_cart(list_id: int, item_id: int, db: Session = Depends(get_db)):
    """Verschiebt Eintrag in den/aus dem Einkaufswagen"""
    item = db.query(ShoppingListItem).filter(
        ShoppingListItem.id == item_id,
        ShoppingListItem.shopping_list_id == list_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    item.is_in_cart = not item.is_in_cart
    db.commit()
    db.refresh(item)
    return item