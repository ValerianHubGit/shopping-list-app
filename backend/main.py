from fastapi import FastAPI, Depends, HTTPException, status
from ai_service import korrigiere_und_kategorisiere
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import Category, Subcategory, Product, ShoppingList, ShoppingListItem, User
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from datetime import datetime, timedelta
from jose import JWTError, jwt
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8081"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth-Konfiguration ───────────────────────────────────────────────────────
SECRET_KEY   = os.getenv("JWT_SECRET", "bitte-in-.env-setzen-sehr-geheim")
ALGORITHM    = "HS256"
TOKEN_EXPIRE = timedelta(days=30)

http_bearer = HTTPBearer()


def passwort_hash(pw: str) -> str:
    import bcrypt
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def passwort_verifizieren(pw: str, hashed: str) -> bool:
    import bcrypt
    return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))

def token_erstellen(user_id: int, username: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": datetime.utcnow() + TOKEN_EXPIRE,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def token_dekodieren(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Ungültiges Token")

def aktueller_nutzer(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = token_dekodieren(credentials.credentials)
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="Nutzer nicht gefunden")
    return user


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class RegisterSchema(BaseModel):
    username: str
    email: str
    password: str

class LoginSchema(BaseModel):
    username: str
    password: str

class ProductCreate(BaseModel):
    name: str

class ShoppingListCreate(BaseModel):
    name: str

class ShoppingListRename(BaseModel):
    name: str

class ShoppingListItemCreate(BaseModel):
    product_id: int

class SubcategoryUpdate(BaseModel):
    subcategory_id: int

class ProductResponse(BaseModel):
    id: int
    name: str
    subcategory_name: Optional[str] = None
    category_name:    Optional[str] = None
    is_new:           bool = False

    class Config:
        from_attributes = True


# ─── Auth-Endpunkte ───────────────────────────────────────────────────────────

@app.post("/auth/register", status_code=201)
def register(data: RegisterSchema, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(400, "Benutzername bereits vergeben")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "E-Mail bereits registriert")
    user = User(
        username=data.username,
        email=data.email,
        password_hash=passwort_hash(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = token_erstellen(user.id, user.username)
    return {"token": token, "user_id": user.id, "username": user.username}


@app.post("/auth/login")
def login(data: LoginSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not passwort_verifizieren(data.password, user.password_hash):
        raise HTTPException(401, "Ungültige Anmeldedaten")
    token = token_erstellen(user.id, user.username)
    return {"token": token, "user_id": user.id, "username": user.username}


# ─── Kategorien ───────────────────────────────────────────────────────────────

@app.get("/categories")
def get_categories(
    db: Session = Depends(get_db),
    _: User = Depends(aktueller_nutzer),
):
    kategorien = db.query(Category).order_by(Category.position).all()
    return [
        {
            "id": k.id,
            "name": k.name,
            "position": k.position,
            "subcategories": [
                {"id": s.id, "name": s.name, "position": s.position}
                for s in sorted(k.subcategories, key=lambda s: s.position)
            ],
        }
        for k in kategorien
    ]


# ─── Produkte ─────────────────────────────────────────────────────────────────

@app.post("/products", response_model=ProductResponse)
def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db),
    _: User = Depends(aktueller_nutzer),
):
    is_new = False

    # ── Stufe 1: Original-Name in DB suchen ──────────────────────────────────
    vorhandenes = db.query(Product).filter(Product.name.ilike(product.name)).first()

    if not vorhandenes:
        # ── Stufe 2: AI – Rechtschreibkorrektur + Kategorisierung ────────────
        try:
            ki = korrigiere_und_kategorisiere(product.name)
            corrected_name      = ki.get("corrected_name", product.name)
            kategorie_name_ai   = ki.get("kategorie")
            unterkategorie_ai   = ki.get("unterkategorie")
            print(f"AI für '{product.name}': name='{corrected_name}' kat='{kategorie_name_ai}' sub='{unterkategorie_ai}'")
        except Exception as e:
            print(f"AI-Fehler für '{product.name}': {e}")
            corrected_name    = product.name
            kategorie_name_ai = None
            unterkategorie_ai = None

        # ── Stufe 3: Korrigierten Namen nochmal in DB suchen ─────────────────
        vorhandenes = db.query(Product).filter(Product.name.ilike(corrected_name)).first()

        if not vorhandenes:
            # ── Stufe 4: Wirklich neu – Produkt mit Unterkategorie anlegen ───
            is_new = True
            subcategory_id = None
            if unterkategorie_ai:
                sub = db.query(Subcategory).filter(
                    Subcategory.name.ilike(unterkategorie_ai)
                ).first()
                if sub:
                    subcategory_id = sub.id
            vorhandenes = Product(
                name=corrected_name,
                subcategory_id=subcategory_id,
                ai_verified=True,
            )
            db.add(vorhandenes)
            db.commit()
            db.refresh(vorhandenes)

    # ── Kategorie und Unterkategorie für Response nachladen ──────────────────
    subcategory_name = None
    category_name    = None

    if vorhandenes.subcategory_id:
        sub = db.query(Subcategory).filter(Subcategory.id == vorhandenes.subcategory_id).first()
        if sub:
            subcategory_name = sub.name
            cat = db.query(Category).filter(Category.id == sub.category_id).first()
            if cat:
                category_name = cat.name

    return ProductResponse(
        id=vorhandenes.id,
        name=vorhandenes.name,
        subcategory_name=subcategory_name,
        category_name=category_name,
        is_new=is_new,
    )


# ─── Einkaufslisten ───────────────────────────────────────────────────────────

def _liste_pruefen(list_id: int, user: User, db: Session) -> ShoppingList:
    liste = db.query(ShoppingList).filter(
        ShoppingList.id == list_id, ShoppingList.user_id == user.id
    ).first()
    if not liste:
        raise HTTPException(404, "Liste nicht gefunden oder kein Zugriff")
    return liste


@app.get("/lists")
def get_lists(
    db: Session = Depends(get_db),
    user: User = Depends(aktueller_nutzer),
):
    listen = (
        db.query(ShoppingList)
        .filter(ShoppingList.user_id == user.id)
        .order_by(ShoppingList.created_at)
        .all()
    )
    return [{"id": l.id, "name": l.name, "created_at": str(l.created_at)} for l in listen]


@app.post("/lists", status_code=201)
def create_list(
    data: ShoppingListCreate,
    db: Session = Depends(get_db),
    user: User = Depends(aktueller_nutzer),
):
    neue = ShoppingList(name=data.name, user_id=user.id)
    db.add(neue)
    db.commit()
    db.refresh(neue)
    return {"id": neue.id, "name": neue.name, "created_at": str(neue.created_at)}


@app.patch("/lists/{list_id}")
def rename_list(
    list_id: int,
    data: ShoppingListRename,
    db: Session = Depends(get_db),
    user: User = Depends(aktueller_nutzer),
):
    liste = _liste_pruefen(list_id, user, db)
    liste.name = data.name
    db.commit()
    return {"id": liste.id, "name": liste.name}


@app.delete("/lists/{list_id}", status_code=204)
def delete_list(
    list_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(aktueller_nutzer),
):
    liste = _liste_pruefen(list_id, user, db)
    db.delete(liste)
    db.commit()


# ─── Listen-Items ─────────────────────────────────────────────────────────────

@app.get("/lists/{list_id}/items")
def get_items(
    list_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(aktueller_nutzer),
):
    _liste_pruefen(list_id, user, db)
    items = db.query(ShoppingListItem).filter(
        ShoppingListItem.shopping_list_id == list_id
    ).all()
    result = []
    for item in items:
        prod = item.product
        # Unterkategorie: erst item-spezifisch, dann Produkt-Default
        if item.subcategory_id:
            sub = db.query(Subcategory).filter(Subcategory.id == item.subcategory_id).first()
        else:
            sub = prod.subcategory if prod else None
        cat = sub.category if sub else None
        result.append({
            "id":             item.id,
            "product_id":     item.product_id,
            "name":           prod.name if prod else "",
            "kategorie":      cat.name  if cat  else "Sonstiges",
            "unterkategorie": sub.name  if sub  else None,
            "is_in_cart":     item.is_in_cart,
        })
    return result


@app.post("/lists/{list_id}/items", status_code=201)
def add_item(
    list_id: int,
    item: ShoppingListItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(aktueller_nutzer),
):
    _liste_pruefen(list_id, user, db)
    db_item = ShoppingListItem(shopping_list_id=list_id, product_id=item.product_id)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return {"id": db_item.id}


@app.delete("/lists/{list_id}/items/{item_id}", status_code=204)
def delete_item(
    list_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(aktueller_nutzer),
):
    _liste_pruefen(list_id, user, db)
    item = db.query(ShoppingListItem).filter(
        ShoppingListItem.id == item_id,
        ShoppingListItem.shopping_list_id == list_id,
    ).first()
    if not item:
        raise HTTPException(404, "Eintrag nicht gefunden")
    db.delete(item)
    db.commit()


@app.patch("/lists/{list_id}/items/{item_id}/cart")
def toggle_cart(
    list_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(aktueller_nutzer),
):
    _liste_pruefen(list_id, user, db)
    item = db.query(ShoppingListItem).filter(
        ShoppingListItem.id == item_id,
        ShoppingListItem.shopping_list_id == list_id,
    ).first()
    if not item:
        raise HTTPException(404, "Eintrag nicht gefunden")
    item.is_in_cart = not item.is_in_cart
    db.commit()
    return {"id": item.id, "is_in_cart": item.is_in_cart}


@app.patch("/lists/{list_id}/items/{item_id}/subcategory")
def update_subcategory(
    list_id: int,
    item_id: int,
    data: SubcategoryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(aktueller_nutzer),
):
    _liste_pruefen(list_id, user, db)
    item = db.query(ShoppingListItem).filter(
        ShoppingListItem.id == item_id,
        ShoppingListItem.shopping_list_id == list_id,
    ).first()
    if not item:
        raise HTTPException(404, "Eintrag nicht gefunden")
    item.subcategory_id = data.subcategory_id
    db.commit()
    return {"id": item.id}