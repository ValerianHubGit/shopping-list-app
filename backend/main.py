from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Category, Subcategory, Product, ShoppingList, ShoppingListItem #import models? insb. wenn get_db in models steht
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from ai_service import kategorisiere_produkt

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8081"],
    allow_methods=["*"],
    allow_headers=["*"],
)
#wir definieren, was bei verschiedenen API Aufrufen geschieht
# ─── Pydantic Schemas ─────────────────────────────────────────────────────────
# Pydantic definiert wie Daten aussehen wenn sie rein- und rauskommen

class ProductCreate(BaseModel):
    name: str

class ShoppingListCreate(BaseModel):
    name: str

class ShoppingListItemCreate(BaseModel):
    product_id: int

class ProductResponse(BaseModel):
    id: int
    name: str
    subcategory_name: Optional[str] = None
    category_name: Optional[str] = None

    class Config:
        from_attributes = True    
class ShoppingListItemResponse(BaseModel):
    id: int
    shopping_list_id: int
    product_id: int
    is_in_cart: bool

    class Config:
        from_attributes = True
# ─── Kategorien ───────────────────────────────────────────────────────────────

@app.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """Gibt alle Kategorien mit ihren Unterkategorien zurück"""
    return db.query(Category).order_by(Category.position).all()

# ─── Produkte ─────────────────────────────────────────────────────────────────

@app.get("/products")
def get_products(db: Session = Depends(get_db)):
    """Gibt alle Produkte zurück"""
    return db.query(Product).all()

@app.get("/products/search/{name}")
def search_product(name: str, db: Session = Depends(get_db)):
    """Sucht ein Produkt in der DB – später Einstiegspunkt für AI-Fallback"""
    product = db.query(Product).filter(
        Product.name.ilike(f"%{name}%")
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    return product

@app.post("/products", response_model=ProductResponse)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    """Gibt vorhandenes Produkt zurück oder legt neues mit AI-Kategorisierung an"""
    
    # Schritt 1: Prüfen ob Produkt bereits existiert
    vorhandenes_produkt = db.query(Product).filter(
        Product.name.ilike(product.name)
    ).first()

    if not vorhandenes_produkt:
        # Schritt 2: AI fragen
        try:
            ki_ergebnis = kategorisiere_produkt(product.name)
            kategorie_name = ki_ergebnis.get("kategorie")
            unterkategorie_name = ki_ergebnis.get("unterkategorie")
        except Exception as e:
            print(f"AI-Fehler: {e}")
            kategorie_name = None
            unterkategorie_name = None

        # Schritt 3: Unterkategorie in DB suchen
        subcategory_id = None
        if unterkategorie_name:
            subcategory = db.query(Subcategory).filter(
                Subcategory.name.ilike(unterkategorie_name)
            ).first()
            if subcategory:
                subcategory_id = subcategory.id

        # Schritt 4: Neues Produkt anlegen
        vorhandenes_produkt = Product(
            name=product.name,
            subcategory_id=subcategory_id,
            ai_verified=True
        )
        db.add(vorhandenes_produkt)
        db.commit()
        db.refresh(vorhandenes_produkt)

    # Schritt 5: Kategorie und Unterkategorie nachladen für Response
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
        category_name=category_name
    )

# ─── Einkaufslisten ───────────────────────────────────────────────────────────

@app.post("/lists")
def create_list(shopping_list: ShoppingListCreate, db: Session = Depends(get_db)):
    """Legt eine neue Einkaufsliste an"""
    db_list = ShoppingList(name=shopping_list.name)
    db.add(db_list)
    db.commit()
    db.refresh(db_list)
    return db_list

@app.get("/lists/{list_id}")
def get_list(list_id: int, db: Session = Depends(get_db)):
    """Gibt eine Einkaufsliste mit allen Einträgen zurück"""
    db_list = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    return db_list

@app.post("/lists/{list_id}/items", response_model=ShoppingListItemResponse)
def add_item_to_list(
    list_id: int,
    item: ShoppingListItemCreate,
    db: Session = Depends(get_db)
):
    """Fügt ein Produkt zu einer Einkaufsliste hinzu"""
    db_item = ShoppingListItem(
        shopping_list_id=list_id,
        product_id=item.product_id,
        is_in_cart=False
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.patch("/lists/{list_id}/items/{item_id}/cart")
def toggle_cart(list_id: int, item_id: int, db: Session = Depends(get_db)):
    """Verschiebt einen Eintrag in den/aus dem Einkaufswagen"""
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