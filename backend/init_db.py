from database import engine, Base
import models

# Erstellt alle Tabellen in Supabase die in models.py definiert sind
# Existierende Tabellen werden nicht überschrieben
Base.metadata.create_all(bind=engine)

print("Tabellen erfolgreich erstellt!")