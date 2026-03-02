from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Category, Subcategory, Product, ShoppingList, ShoppingListItem #import models? insb. wenn get_db in models steht
from pydantic import BaseModel

app = FastAPI()
#wir definieren, was bei verschiedenen API Aufrufen geschieht
# ─── Pydantic Schemas ─────────────────────────────────────────────────────────
# Pydantic definiert wie Daten aussehen wenn sie rein- und rauskommen

class ProductCreate(BaseModel):
    name: str

class ShoppingListCreate(BaseModel):
    name: str

class ShoppingListItemCreate(BaseModel):
    product_id: int

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

@app.post("/products")
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    """Legt ein neues Produkt an – subcategory_id zunächst leer, AI folgt später"""
    db_product = Product(name=product.name, ai_verified=False)
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

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

@app.post("/lists/{list_id}/items")
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