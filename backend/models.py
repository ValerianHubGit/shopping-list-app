from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String, nullable=False, unique=True, index=True)
    email         = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    lists = relationship("ShoppingList", back_populates="owner")


class Category(Base):
    __tablename__ = "categories"

    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String, nullable=False, unique=True)
    position = Column(Integer, default=0)

    subcategories = relationship("Subcategory", back_populates="category")


class Subcategory(Base):
    __tablename__ = "subcategories"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, nullable=False, unique=True)
    position    = Column(Integer, default=0)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)

    category = relationship("Category", back_populates="subcategories")
    products = relationship("Product", back_populates="subcategory")


class Product(Base):
    __tablename__ = "products"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String, nullable=False, unique=True)
    subcategory_id = Column(Integer, ForeignKey("subcategories.id"), nullable=True)
    ai_verified    = Column(Boolean, default=False)

    subcategory = relationship("Subcategory", back_populates="products")


class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="lists")
    items = relationship("ShoppingListItem", back_populates="shopping_list", cascade="all, delete-orphan")


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"

    id               = Column(Integer, primary_key=True, index=True)
    shopping_list_id = Column(Integer, ForeignKey("shopping_lists.id"), nullable=False)
    product_id       = Column(Integer, ForeignKey("products.id"), nullable=False)
    is_in_cart       = Column(Boolean, default=False)
    position         = Column(Integer, default=0)

    subcategory_id   = Column(Integer, ForeignKey("subcategories.id"), nullable=True)

    shopping_list = relationship("ShoppingList", back_populates="items")
    product       = relationship("Product")
    subcategory   = relationship("Subcategory", foreign_keys=[subcategory_id])