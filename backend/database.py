from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv
import os



# Stellt die Verbindung zur Datenbank mit den aus der .env Datei ausgelesenen Parametern her

load_dotenv()
engine = create_engine(
    os.getenv("BASE_URL"),
    connect_args={
        "host": os.getenv("DB_HOST"),
        "port": int(os.getenv("DB_PORT", 5432)),
        "dbname": os.getenv("DB_NAME"),
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "sslmode": "require"
    }
)

# Session = eine einzelne "Unterhaltung" mit der Datenbank
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base = Elternklasse für alle unsere Tabellen-Modelle
Base = declarative_base()

# Hilfsfunktion: gibt eine DB-Session aus und schließt sie danach sauber
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()