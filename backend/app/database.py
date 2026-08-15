import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DATABASE_PATH = Path(
    os.getenv("ARENA_DB_PATH", str(Path(__file__).resolve().parents[1] / "arena.db"))
)
SEED_VERSION = "1"


def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def password_hash(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000).hex()


def init_database() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                excerpt TEXT NOT NULL,
                published_at TEXT NOT NULL,
                reading_time INTEGER NOT NULL,
                featured INTEGER NOT NULL DEFAULT 0,
                category_featured INTEGER NOT NULL DEFAULT 0,
                hidden INTEGER NOT NULL DEFAULT 0,
                accent TEXT NOT NULL,
                author_id INTEGER NOT NULL REFERENCES users(id),
                image_url TEXT,
                image_alt TEXT,
                subcategory TEXT,
                thumbnail_url TEXT,
                thumbnail_alt TEXT,
                featured_image_url TEXT,
                featured_image_alt TEXT,
                content_json TEXT NOT NULL,
                quote TEXT
            );

            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                accent TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS subcategories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                name TEXT NOT NULL COLLATE NOCASE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                UNIQUE(category_id, name)
            );

            CREATE TABLE IF NOT EXISTS results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                home_name TEXT NOT NULL,
                home_short_name TEXT NOT NULL,
                home_score INTEGER,
                away_name TEXT NOT NULL,
                away_short_name TEXT NOT NULL,
                away_score INTEGER,
                is_live INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'ZAKOŃCZONY',
                event_time TEXT NOT NULL,
                visible INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS result_settings (
                category TEXT PRIMARY KEY,
                visible_limit INTEGER NOT NULL DEFAULT 3
            );
            """
        )
        ensure_article_columns(db)
        ensure_categories(db)
        ensure_result_settings(db)

        user = db.execute(
            "SELECT id FROM users WHERE username = ?", ("redaktor",)
        ).fetchone()
        if user is None:
            salt = secrets.token_bytes(16)
            cursor = db.execute(
                """
                INSERT INTO users (username, full_name, password_salt, password_hash)
                VALUES (?, ?, ?, ?)
                """,
                ("redaktor", "Jan Kowal", salt.hex(), password_hash("arena2026", salt)),
            )
            author_id = cursor.lastrowid
        else:
            author_id = user["id"]
            db.execute(
                "UPDATE users SET full_name = ? WHERE id = ?",
                ("Jan Kowal", author_id),
            )

        version = db.execute(
            "SELECT value FROM metadata WHERE key = 'seed_version'"
        ).fetchone()
        if version is None or version["value"] != SEED_VERSION:
            db.execute("DELETE FROM articles")
            seed_articles(db, int(author_id))
            db.execute(
                """
                INSERT INTO metadata (key, value) VALUES ('seed_version', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (SEED_VERSION,),
            )
        seed_subcategories_and_assign_articles(db)
        seed_results_if_empty(db)


def seed_articles(db: sqlite3.Connection, author_id: int) -> None:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    seeds = [
        article_seed(1, "Piłka nożna", "Biało-czerwoni gotowi na wieczorny test", "Ostatni trening przyniósł kilka odpowiedzi przed najważniejszym meczem zgrupowania.", 2, 5, True, "#e8ff47", "football/pexels-mateo-franciosi-283676800-36958057.jpg", "Piłkarze rywalizujący o piłkę na stadionie", "Chcemy od początku narzucić własne tempo i grać odważnie.", ["Reprezentacja zakończyła przygotowania krótkim, intensywnym treningiem. Sztab pracował przede wszystkim nad pressingiem po stracie oraz szybkim przenoszeniem gry na skrzydła.", "Selekcjoner nie zdradził wyjściowej jedenastki, ale potwierdził, że wszyscy zawodnicy są zdrowi. Najwięcej znaków zapytania dotyczy środka pola.", "Pierwszy gwizdek zabrzmi o 20:45. Trybuny mają wypełnić się do ostatniego miejsca, a kibice przygotowują specjalną oprawę."]),
        article_seed(2, "Piłka nożna", "Młody pomocnik zachwycił w ligowym debiucie", "Dziewiętnastolatek wszedł bez kompleksów i asystował przy zwycięskiej bramce.", 49, 4, False, "#e8ff47", "football/cbbb0e04e13cfbfead22a3f4c45c4d54.jpg", "Zawodnicy podczas meczu piłkarskiego", "Na boisku liczy się jakość, a nie data urodzenia.", ["Jeszcze tydzień temu trenował z zespołem rezerw, a dziś mówi o nim cała liga. Młody pomocnik pojawił się na murawie po przerwie i szybko uporządkował grę swojej drużyny.", "Kluczowa akcja przyszła w 82. minucie. Precyzyjne podanie między obrońców otworzyło napastnikowi drogę do bramki i przesądziło o komplecie punktów.", "Trener tonuje emocje i zapowiada spokojne wprowadzanie zawodnika. Kolejna szansa może nadejść już w pucharowym spotkaniu."]),
        article_seed(3, "Piłka nożna", "Kapitan przedłużył kontrakt o kolejny sezon", "Lider zespołu zostaje w klubie i zapowiada walkę o najwyższe cele.", 240, 3, False, "#e8ff47", "football/cristiano-ronaldo-getty.avif", "Piłkarz świętujący zdobycie bramki", "To miejsce wciąż daje mi ogromną motywację.", ["Klub oficjalnie potwierdził porozumienie z kapitanem. Nowa umowa będzie obowiązywać do końca przyszłego sezonu i zawiera opcję przedłużenia.", "Doświadczony zawodnik pozostaje najskuteczniejszym strzelcem zespołu. W minionych rozgrywkach zdobył 18 bramek i zanotował siedem asyst.", "Dyrektor sportowy podkreślił, że obecność lidera ma znaczenie również poza boiskiem, szczególnie dla najmłodszych graczy akademii."]),
        article_seed(4, "Tenis", "Fenomenalny powrót w trzecim secie. Polka z awansem", "Dwie godziny walki i tie-break, który trzymał kibiców w napięciu.", 23, 4, False, "#ff7a45", "tennis/athletes-iga_swiatek-palm_springs_finals-2024-16.webp", "Tenisistka podczas meczu", "Nawet przez moment nie przestałam wierzyć w zwycięstwo.", ["Po przegranym pierwszym secie Polka zmieniła ustawienie przy returnie i zaczęła regularnie przejmować inicjatywę w dłuższych wymianach.", "W decydującej partii obroniła dwie piłki meczowe. Tie-break rozpoczęła nerwowo, lecz od stanu 3:5 wygrała cztery akcje z rzędu.", "W kolejnej rundzie zmierzy się z rozstawioną rywalką, która słynie z agresywnej gry przy siatce."]),
        article_seed(5, "Tenis", "Pięciosetowy maraton zakończony tuż przed północą", "Publiczność obejrzała łącznie 56 gemów i niezwykły pokaz odporności.", 144, 6, False, "#ff7a45", "tennis/2013_Australian_Open_-_Guillaume_Rufin.jpg", "Tenisista przygotowujący się do odbicia", "W takich meczach walczy się już nie tylko z rywalem, ale też z własnym zmęczeniem.", ["Spotkanie trwało cztery godziny i czterdzieści minut. Obaj zawodnicy mieli momenty wyraźnej przewagi, lecz żaden nie potrafił odskoczyć na dłużej.", "O losach meczu zdecydowało jedno przełamanie w ostatnim secie. Zwycięzca wykorzystał dopiero piątą piłkę meczową.", "Organizatorzy przesunęli jego kolejny występ o jeden dzień, by umożliwić pełną regenerację przed następną rundą."]),
        article_seed(6, "Tenis", "Nowa nawierzchnia zmieni tempo letniego turnieju", "Zawodnicy zwracają uwagę na wyższe odbicie i wolniejszą piłkę.", 360, 4, False, "#ff7a45", "tennis/pexels-onbab-32832526.jpg", "Piłka tenisowa leżąca przy linii kortu", "Pierwsze mecze pokażą, kto najlepiej odrobił pracę domową.", ["Organizatorzy zakończyli modernizację kortów centralnych. Nowa mieszanka nawierzchni ma zwiększyć powtarzalność odbicia oraz poprawić bezpieczeństwo zawodników.", "Pierwsze treningi wskazują, że wymiany mogą być dłuższe niż w poprzednich edycjach. Najwięcej zyskają tenisiści cierpliwi i dobrze poruszający się za linią końcową.", "Turniej rozpocznie się w poniedziałek. W głównej drabince zobaczymy pięcioro reprezentantów Polski."]),
        article_seed(7, "Formuła 1", "Nowe ustawienia bolidu zdały egzamin", "Zespół odnalazł tempo, którego brakowało podczas piątkowych treningów.", 5, 5, False, "#66d9ff", "F1/6a3fac923a1502_51383327.jpg", "Bolid Formuły 1 na torze", "Po raz pierwszy w ten weekend samochód zachowywał się dokładnie tak, jak chciałem.", ["Inżynierowie pracowali do późnej nocy nad zmianą balansu aerodynamicznego. Efekt był widoczny już na pierwszym szybkim okrążeniu.", "Kierowca poprawił czas o ponad cztery dziesiąte sekundy i awansował do czołowej trójki. Szczególnie dobrze bolid spisywał się w szybkich zakrętach.", "Zespół zachowuje ostrożność przed kwalifikacjami, ponieważ wyższa temperatura asfaltu może ponownie zmienić układ sił."]),
        article_seed(8, "Formuła 1", "Ferrari przywozi duży pakiet poprawek", "Zmiany obejmują podłogę, przednie skrzydło i chłodzenie jednostki napędowej.", 72, 5, False, "#66d9ff", "F1/ferrari_auto_6_f75acc37-28b1-4328-a305-105e007d6570.webp", "Czerwony bolid wyścigowy", "To największa zmiana samochodu od początku sezonu.", ["Nowe elementy po raz pierwszy pojawią się na torze podczas piątkowego treningu. Zespół przygotował dwa programy testowe, by szybko porównać dane.", "Największe nadzieje wiążą się ze zmodyfikowaną podłogą, która ma ustabilizować bolid w wolnych zakrętach bez utraty prędkości na prostych.", "Jeśli korelacja z tunelem aerodynamicznym będzie prawidłowa, oba samochody wystartują w nowej specyfikacji już w niedzielę."]),
        article_seed(9, "Formuła 1", "Red Bull analizuje strategię po trudnym weekendzie", "Nietrafiony moment zjazdu do alei serwisowej kosztował miejsce na podium.", 288, 4, False, "#66d9ff", "F1/redbull_auto_9_2a13ec2e-59e6-413f-8d70-701b75832f4a.webp", "Bolid zespołu Red Bull", "Musimy lepiej reagować na gwałtowne zmiany pogody.", ["Deszcz pojawił się o jedno okrążenie wcześniej, niż przewidywały modele. Zespół pozostawił kierowcę na slickach, tracąc kilkanaście sekund.", "Po wyścigu przeanalizowano komunikację między pit wall a samochodem. Wnioski mają zostać wdrożone przed kolejną rundą.", "Mimo straconych punktów zespół pozostaje liderem klasyfikacji konstruktorów, lecz przewaga wyraźnie stopniała."]),
        article_seed(10, "Siatkówka", "Komplet zwycięstw i pewny awans do finałów", "Reprezentanci imponują spokojem oraz skutecznością w kluczowych akcjach.", 12, 4, False, "#b48cff", "volleyball/volleyball-1440x650.webp", "Mecz siatkówki przy pełnych trybunach", "Najważniejsze, że w trudnych momentach gramy razem.", ["Biało-czerwoni zakończyli turniej bez porażki. W ostatnim spotkaniu potrzebowali czterech setów, by przypieczętować awans.", "Różnicę zrobiła zagrywka. Reprezentanci zdobyli w tym elemencie dziewięć punktów i wielokrotnie odrzucali rywali od siatki.", "Faza finałowa rozpocznie się za dziesięć dni. Sztab zapowiedział krótki odpoczynek, a następnie zgrupowanie w pełnym składzie."]),
        article_seed(11, "Siatkówka", "Legenda wraca do kadry w nowej roli", "Były reprezentant dołączy do sztabu i będzie odpowiadał za pracę z atakującymi.", 96, 3, False, "#b48cff", "volleyball/Gilberto-Godoy-Filho-ball-Brazil-Argentina-volleyball-2007.webp", "Siatkarz z piłką podczas spotkania", "Chcę przekazać zawodnikom doświadczenie, które sam zbierałem przez lata.", ["Federacja potwierdziła długo wyczekiwany powrót byłego kapitana. Tym razem pojawi się przy boisku jako członek sztabu szkoleniowego.", "Jego głównym zadaniem będzie indywidualna praca z atakującymi oraz analiza gry blok-obrona najgroźniejszych rywali.", "Pierwsze zajęcia w nowej roli poprowadzi już podczas najbliższego zgrupowania reprezentacji."]),
        article_seed(12, "Siatkówka", "Młodzieżowy turniej odkrył nowe talenty", "Trzech zawodników otrzymało zaproszenie na trening seniorskiego zespołu.", 720, 5, False, "#b48cff", "volleyball/exvzqcvorticinejmmel.avif", "Zawodnicy grający w siatkówkę", "Najlepszą nagrodą dla młodych jest realna ścieżka do pierwszej drużyny.", ["Finał młodzieżowych mistrzostw stał na wyjątkowo wysokim poziomie. Skauci zwracali uwagę przede wszystkim na odwagę w polu zagrywki.", "Najlepszym zawodnikiem wybrano siedemnastoletniego przyjmującego, który zdobył 24 punkty i zanotował 61 procent skuteczności w ataku.", "Trzech wyróżnionych graczy rozpocznie przygotowania z seniorami. Klub podkreśla jednak, że ich rozwój będzie prowadzony bez pośpiechu."]),
        article_seed(13, "Kolarstwo", "Samotny atak dał zwycięstwo na górskim etapie", "Lider ruszył osiem kilometrów przed metą i nie pozwolił się dogonić.", 1, 6, False, "#50e3a4", "cycling/20220424_Liege_Bastogne_Liege117_edited_by_PetarM.jpg", "Kolarze podczas wyścigu szosowego", "Wiedziałem, że jeśli zaczekam do sprintu, stracę swoją szansę.", ["Tempo na finałowym podjeździe rosło z każdym kilometrem. Gdy grupa liderów zaczęła się kurczyć, zwycięzca zdecydował się na zdecydowany atak.", "Przewaga długo oscylowała wokół dziesięciu sekund. Na ostatnich serpentynach wzrosła jednak na tyle, by mógł spokojnie celebrować triumf.", "Dzięki bonifikacie przesunął się na drugie miejsce klasyfikacji generalnej i traci do lidera zaledwie sześć sekund."]),
        article_seed(14, "Kolarstwo", "Nowe rowery przed najważniejszym startem sezonu", "Lżejsza rama i zmieniona geometria mają pomóc na stromych podjazdach.", 120, 4, False, "#50e3a4", "cycling/bike-road-learn_h.avif", "Rower szosowy na trasie", "Sprzęt nie pojedzie za zawodnika, ale może dać mu pewność na zjeździe.", ["Ekipa zaprezentowała sprzęt przygotowany specjalnie na trzytygodniowy wyścig. Największą zmianą jest rama lżejsza o niemal 200 gramów.", "Mechanicy pracowali również nad ustawieniem kokpitu i doborem przełożeń. Każdy zawodnik otrzyma konfigurację dopasowaną do swojej roli.", "Pierwszy poważny test nadejdzie już na czwartym etapie, którego meta znajduje się po dwunastokilometrowym podjeździe."]),
        article_seed(15, "Kolarstwo", "Deszcz pokrzyżował plany faworytów klasyku", "Śliska nawierzchnia i boczny wiatr podzieliły peleton na kilka grup.", 1080, 5, False, "#50e3a4", "cycling/images.jfif", "Kolarze jadący w trudnych warunkach", "Tego dnia najważniejsze było bezpiecznie dotrzeć do mety.", ["Pogoda zmieniła wyścig w prawdziwą próbę charakteru. Już po trzydziestu kilometrach peleton podzielił się pod naporem bocznego wiatru.", "Dwóch faworytów straciło kontakt po kraksie na mokrym zakręcie. Obaj wrócili na rowery, ale nie zdołali już odrobić strat.", "Organizatorzy skrócili finałową rundę ze względów bezpieczeństwa. Decyzję poparła większość dyrektorów sportowych."]),
    ]

    for item in seeds:
        db.execute(
            """
            INSERT INTO articles (
                id, category, title, excerpt, published_at, reading_time,
                featured, category_featured, accent, author_id, image_url, image_alt,
                content_json, quote
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item["id"],
                item["category"],
                item["title"],
                item["excerpt"],
                (now - timedelta(hours=item["hours_ago"])).isoformat(),
                item["reading_time"],
                int(item["featured"]),
                int(item["featured"]),
                item["accent"],
                author_id,
                f"/images/{item['image']}",
                item["image_alt"],
                json.dumps(item["content"], ensure_ascii=False),
                item["quote"],
            ),
        )


def seed_subcategories_and_assign_articles(db: sqlite3.Connection) -> None:
    examples = {
        "Piłka nożna": [("Reprezentacja", 1), ("Liga", 2)],
        "Tenis": [("WTA", 4), ("ATP", 5)],
        "Formuła 1": [("Grand Prix", 7), ("Technika", 8)],
        "Siatkówka": [("Reprezentacja", 10), ("Liga", 11)],
        "Kolarstwo": [("Wyścigi etapowe", 13), ("Sprzęt", 14)],
    }
    for category_name, assignments in examples.items():
        category = db.execute(
            "SELECT id FROM categories WHERE name = ?", (category_name,)
        ).fetchone()
        if category is None:
            continue
        for order, (subcategory_name, article_id) in enumerate(assignments):
            db.execute(
                """
                INSERT INTO subcategories (category_id, name, sort_order)
                VALUES (?, ?, ?)
                ON CONFLICT(category_id, name) DO NOTHING
                """,
                (category["id"], subcategory_name, order),
            )
            db.execute(
                """
                UPDATE articles
                SET subcategory = ?
                WHERE id = ? AND category = ? AND subcategory IS NULL
                """,
                (subcategory_name, article_id, category_name),
            )


def article_seed(
    article_id: int,
    category: str,
    title: str,
    excerpt: str,
    hours_ago: int,
    reading_time: int,
    featured: bool,
    accent: str,
    image: str,
    image_alt: str,
    quote: str,
    content: list[str],
) -> dict[str, Any]:
    return {
        "id": article_id,
        "category": category,
        "title": title,
        "excerpt": excerpt,
        "hours_ago": hours_ago,
        "reading_time": reading_time,
        "featured": featured,
        "accent": accent,
        "image": image,
        "image_alt": image_alt,
        "quote": quote,
        "content": content,
    }


def article_from_row(row: sqlite3.Row) -> dict[str, Any]:
    raw_content = json.loads(row["content_json"])
    blocks: list[dict[str, str]] = []
    content: list[str] = []

    for item in raw_content:
        if isinstance(item, str):
            content.append(item)
            blocks.append({"type": "text", "content": item})
        elif isinstance(item, dict):
            block_type = item.get("type")
            if block_type == "text":
                text = str(item.get("content", ""))
                if text:
                    content.append(text)
                    blocks.append({"type": "text", "content": text})
            elif block_type == "image":
                blocks.append(
                    {
                        "type": "image",
                        "src": str(item.get("src", "")),
                        "alt": str(item.get("alt", "")),
                    }
                )
            elif block_type == "embed":
                blocks.append(
                    {
                        "type": "embed",
                        "provider": str(item.get("provider", "Post")),
                        "url": str(item.get("url", "")),
                        "content": str(item.get("content", item.get("url", ""))),
                    }
                )

    return {
        "id": row["id"],
        "category": row["category"],
        "subcategory": row["subcategory"],
        "title": row["title"],
        "excerpt": row["excerpt"],
        "published_at": row["published_at"],
        "reading_time": row["reading_time"],
        "featured": bool(row["featured"]),
        "category_featured": bool(row["category_featured"]),
        "hidden": bool(row["hidden"]),
        "accent": row["accent"],
        "author": row["author"],
        "image_url": row["image_url"],
        "image_alt": row["image_alt"],
        "thumbnail_url": row["thumbnail_url"],
        "thumbnail_alt": row["thumbnail_alt"],
        "featured_image_url": row["featured_image_url"],
        "featured_image_alt": row["featured_image_alt"],
        "content": content,
        "blocks": blocks,
        "quote": row["quote"],
    }


ARTICLE_SELECT = """
    SELECT articles.*, users.full_name AS author
    FROM articles
    JOIN users ON users.id = articles.author_id
"""


def ensure_article_columns(db: sqlite3.Connection) -> None:
    columns = {
        row["name"]
        for row in db.execute("PRAGMA table_info(articles)").fetchall()
    }
    if "category_featured" not in columns:
        db.execute(
            "ALTER TABLE articles ADD COLUMN category_featured INTEGER NOT NULL DEFAULT 0"
        )
    if "hidden" not in columns:
        db.execute(
            "ALTER TABLE articles ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0"
        )
    if "subcategory" not in columns:
        db.execute("ALTER TABLE articles ADD COLUMN subcategory TEXT")
    for column in ("thumbnail_url", "thumbnail_alt", "featured_image_url", "featured_image_alt"):
        if column not in columns:
            db.execute(f"ALTER TABLE articles ADD COLUMN {column} TEXT")
    db.execute(
        """
        UPDATE articles
        SET category_featured = 1
        WHERE featured = 1 AND category_featured = 0
        """
    )


SPORT_CATEGORIES = ["Piłka nożna", "Tenis", "Formuła 1", "Siatkówka", "Kolarstwo"]


def ensure_categories(db: sqlite3.Connection) -> None:
    count = db.execute("SELECT COUNT(*) AS count FROM categories").fetchone()["count"]
    if count:
        return
    accents = ["#e8ff47", "#ff7a45", "#66d9ff", "#b48cff", "#50e3a4"]
    for index, name in enumerate(SPORT_CATEGORIES):
        db.execute(
            "INSERT INTO categories (name, accent, sort_order) VALUES (?, ?, ?)",
            (name, accents[index], index),
        )


def list_categories() -> list[dict[str, Any]]:
    with connect() as db:
        categories = db.execute(
            "SELECT id, name, accent FROM categories ORDER BY sort_order, id"
        ).fetchall()
        subcategories = db.execute(
            "SELECT id, category_id, name FROM subcategories ORDER BY sort_order, id"
        ).fetchall()
    children: dict[int, list[dict[str, Any]]] = {}
    for row in subcategories:
        children.setdefault(row["category_id"], []).append(
            {"id": row["id"], "name": row["name"]}
        )
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "accent": row["accent"],
            "subcategories": children.get(row["id"], []),
        }
        for row in categories
    ]


def get_category_by_name(name: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            "SELECT id, name, accent FROM categories WHERE lower(name) = lower(?)",
            (name,),
        ).fetchone()
    return dict(row) if row else None


def subcategory_belongs_to(category_id: int, name: str) -> bool:
    with connect() as db:
        row = db.execute(
            "SELECT id FROM subcategories WHERE category_id = ? AND lower(name) = lower(?)",
            (category_id, name),
        ).fetchone()
    return row is not None


def rename_category(category_id: int, name: str, accent: str) -> dict[str, Any] | None:
    with connect() as db:
        current = db.execute(
            "SELECT name FROM categories WHERE id = ?", (category_id,)
        ).fetchone()
        if current is None:
            return None
        old_name = current["name"]
        db.execute(
            "UPDATE categories SET name = ?, accent = ? WHERE id = ?",
            (name, accent, category_id),
        )
        db.execute("UPDATE articles SET category = ? WHERE category = ?", (name, old_name))
        db.execute("UPDATE articles SET accent = ? WHERE category = ?", (accent, name))
        db.execute("UPDATE results SET category = ? WHERE category = ?", (name, old_name))
        db.execute("UPDATE result_settings SET category = ? WHERE category = ?", (name, old_name))
    return next((item for item in list_categories() if item["id"] == category_id), None)


def delete_category(category_id: int) -> bool | None:
    with connect() as db:
        category = db.execute(
            "SELECT name FROM categories WHERE id = ?", (category_id,)
        ).fetchone()
        if category is None:
            return None
        article_count = db.execute(
            "SELECT COUNT(*) AS count FROM articles WHERE category = ?",
            (category["name"],),
        ).fetchone()["count"]
        result_count = db.execute(
            "SELECT COUNT(*) AS count FROM results WHERE category = ?",
            (category["name"],),
        ).fetchone()["count"]
        if article_count or result_count:
            return False
        db.execute("DELETE FROM result_settings WHERE category = ?", (category["name"],))
        db.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    return True


def create_subcategory(category_id: int, name: str) -> dict[str, Any] | None:
    with connect() as db:
        category = db.execute("SELECT id FROM categories WHERE id = ?", (category_id,)).fetchone()
        if category is None:
            return None
        next_order = db.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM subcategories WHERE category_id = ?",
            (category_id,),
        ).fetchone()["value"]
        cursor = db.execute(
            "INSERT INTO subcategories (category_id, name, sort_order) VALUES (?, ?, ?)",
            (category_id, name, next_order),
        )
        return {"id": cursor.lastrowid, "name": name}


def rename_subcategory(subcategory_id: int, name: str) -> dict[str, Any] | None:
    with connect() as db:
        current = db.execute(
            """
            SELECT subcategories.name, categories.name AS category
            FROM subcategories
            JOIN categories ON categories.id = subcategories.category_id
            WHERE subcategories.id = ?
            """,
            (subcategory_id,),
        ).fetchone()
        if current is None:
            return None
        db.execute("UPDATE subcategories SET name = ? WHERE id = ?", (name, subcategory_id))
        db.execute(
            "UPDATE articles SET subcategory = ? WHERE category = ? AND subcategory = ?",
            (name, current["category"], current["name"]),
        )
    return {"id": subcategory_id, "name": name}


def delete_subcategory(subcategory_id: int) -> bool:
    with connect() as db:
        current = db.execute(
            """
            SELECT subcategories.name, categories.name AS category
            FROM subcategories
            JOIN categories ON categories.id = subcategories.category_id
            WHERE subcategories.id = ?
            """,
            (subcategory_id,),
        ).fetchone()
        if current is None:
            return False
        db.execute(
            "UPDATE articles SET subcategory = NULL WHERE category = ? AND subcategory = ?",
            (current["category"], current["name"]),
        )
        db.execute("DELETE FROM subcategories WHERE id = ?", (subcategory_id,))
    return True


def ensure_result_settings(db: sqlite3.Connection) -> None:
    db.execute(
        """
        INSERT INTO result_settings (category, visible_limit)
        VALUES ('__home__', 3)
        ON CONFLICT(category) DO NOTHING
        """
    )
    categories = db.execute("SELECT name FROM categories ORDER BY sort_order, id").fetchall()
    for row in categories:
        category = row["name"]
        db.execute(
            """
            INSERT INTO result_settings (category, visible_limit)
            VALUES (?, 3)
            ON CONFLICT(category) DO NOTHING
            """,
            (category,),
        )


def seed_results_if_empty(db: sqlite3.Connection) -> None:
    existing = db.execute("SELECT COUNT(*) AS count FROM results").fetchone()["count"]
    if existing:
        return

    now = datetime.now(timezone.utc).isoformat()
    seeds = [
        ("Piłka nożna", "Polska", "POL", 2, "Holandia", "NED", 1, 1, "LIVE", "67'"),
        ("Piłka nożna", "Lech Poznań", "LPO", 1, "Legia Warszawa", "LEG", 1, 0, "ZAKOŃCZONY", "Koniec"),
        ("Tenis", "I. Świątek", "ŚWI", None, "C. Gauff", "GAU", None, 0, "NADCHODZĄCY", "18:30"),
        ("Tenis", "H. Hurkacz", "HUR", 2, "A. de Minaur", "DEM", 1, 0, "ZAKOŃCZONY", "Koniec"),
        ("Siatkówka", "Polska", "POL", 3, "Włochy", "ITA", 1, 0, "ZAKOŃCZONY", "Koniec"),
        ("Formuła 1", "Ferrari", "FER", 1, "Red Bull", "RBR", 2, 1, "LIVE", "Okr. 42"),
        ("Kolarstwo", "Peleton", "PEL", None, "Ucieczka", "UCI", None, 1, "LIVE", "32 km"),
    ]
    for item in seeds:
        create_result(
            db=db,
            category=item[0],
            home_name=item[1],
            home_short_name=item[2],
            home_score=item[3],
            away_name=item[4],
            away_short_name=item[5],
            away_score=item[6],
            is_live=bool(item[7]),
            status=item[8],
            event_time=item[9],
            visible=True,
            created_at=now,
        )


def result_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "discipline": row["category"],
        "category": row["category"],
        "status": row["status"],
        "time": row["event_time"],
        "is_live": bool(row["is_live"]),
        "visible": bool(row["visible"]),
        "created_at": row["created_at"],
        "home": {
            "name": row["home_name"],
            "short_name": row["home_short_name"],
            "score": row["home_score"],
        },
        "away": {
            "name": row["away_name"],
            "short_name": row["away_short_name"],
            "score": row["away_score"],
        },
    }


def create_result(
    *,
    category: str,
    home_name: str,
    home_short_name: str,
    home_score: int | None,
    away_name: str,
    away_short_name: str,
    away_score: int | None,
    is_live: bool,
    status: str,
    event_time: str,
    visible: bool = True,
    created_at: str | None = None,
    db: sqlite3.Connection | None = None,
) -> dict[str, Any]:
    own_connection = db is None
    connection = db or connect()
    try:
        cursor = connection.execute(
            """
            INSERT INTO results (
                category, home_name, home_short_name, home_score,
                away_name, away_short_name, away_score, is_live,
                status, event_time, visible, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                category,
                home_name,
                home_short_name,
                home_score,
                away_name,
                away_short_name,
                away_score,
                int(is_live),
                status,
                event_time,
                int(visible),
                created_at or datetime.now(timezone.utc).isoformat(),
            ),
        )
        row = connection.execute(
            "SELECT * FROM results WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        if own_connection:
            connection.commit()
        return result_from_row(row)
    finally:
        if own_connection:
            connection.close()


def list_results(category: str | None = None, *, include_hidden: bool = False) -> list[dict[str, Any]]:
    with connect() as db:
        if include_hidden:
            query = "SELECT * FROM results"
            params: tuple[Any, ...] = ()
            if category:
                query += " WHERE lower(category) = lower(?)"
                params = (category,)
            query += " ORDER BY is_live DESC, created_at DESC, id DESC"
            rows = db.execute(query, params).fetchall()
            return [result_from_row(row) for row in rows]

        if category is None:
            setting = db.execute(
                "SELECT visible_limit FROM result_settings WHERE category = '__home__'"
            ).fetchone()
            limit = setting["visible_limit"] if setting else 3
            rows = db.execute(
                """
                SELECT * FROM results
                WHERE visible = 1
                ORDER BY is_live DESC, created_at DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [result_from_row(row) for row in rows]

        categories = [category]
        results: list[dict[str, Any]] = []
        for item in categories:
            setting = db.execute(
                "SELECT visible_limit FROM result_settings WHERE category = ?",
                (item,),
            ).fetchone()
            limit = setting["visible_limit"] if setting else 3
            rows = db.execute(
                """
                SELECT * FROM results
                WHERE visible = 1 AND lower(category) = lower(?)
                ORDER BY is_live DESC, created_at DESC, id DESC
                LIMIT ?
                """,
                (item, limit),
            ).fetchall()
            results.extend(result_from_row(row) for row in rows)
    return results


def get_result_settings() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            """
            SELECT category, visible_limit
            FROM result_settings
            ORDER BY CASE WHEN category = '__home__' THEN 0 ELSE 1 END, category
            """
        ).fetchall()
    return [dict(row) for row in rows]


def set_result_limit(category: str, visible_limit: int) -> dict[str, Any]:
    with connect() as db:
        db.execute(
            """
            INSERT INTO result_settings (category, visible_limit)
            VALUES (?, ?)
            ON CONFLICT(category) DO UPDATE SET visible_limit = excluded.visible_limit
            """,
            (category, visible_limit),
        )
        row = db.execute(
            "SELECT category, visible_limit FROM result_settings WHERE category = ?",
            (category,),
        ).fetchone()
    return dict(row)


def set_result_visibility(result_id: int, visible: bool) -> dict[str, Any] | None:
    with connect() as db:
        db.execute("UPDATE results SET visible = ? WHERE id = ?", (int(visible), result_id))
        row = db.execute("SELECT * FROM results WHERE id = ?", (result_id,)).fetchone()
    return result_from_row(row) if row else None


def get_result(result_id: int) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM results WHERE id = ?", (result_id,)).fetchone()
    return result_from_row(row) if row else None


def update_result(
    result_id: int,
    *,
    category: str,
    home_name: str,
    home_short_name: str,
    home_score: int | None,
    away_name: str,
    away_short_name: str,
    away_score: int | None,
    is_live: bool,
    status: str,
    event_time: str,
    visible: bool,
) -> dict[str, Any] | None:
    with connect() as db:
        db.execute(
            """
            UPDATE results
            SET category = ?,
                home_name = ?,
                home_short_name = ?,
                home_score = ?,
                away_name = ?,
                away_short_name = ?,
                away_score = ?,
                is_live = ?,
                status = ?,
                event_time = ?,
                visible = ?
            WHERE id = ?
            """,
            (
                category,
                home_name,
                home_short_name,
                home_score,
                away_name,
                away_short_name,
                away_score,
                int(is_live),
                status,
                event_time,
                int(visible),
                result_id,
            ),
        )
        row = db.execute("SELECT * FROM results WHERE id = ?", (result_id,)).fetchone()
    return result_from_row(row) if row else None


def toggle_result_status(result_id: int) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT is_live FROM results WHERE id = ?", (result_id,)).fetchone()
        if row is None:
            return None
        is_live = not bool(row["is_live"])
        db.execute(
            """
            UPDATE results
            SET is_live = ?,
                status = ?,
                event_time = ?
            WHERE id = ?
            """,
            (int(is_live), "LIVE" if is_live else "Koniec", "LIVE" if is_live else "Koniec", result_id),
        )
        updated = db.execute("SELECT * FROM results WHERE id = ?", (result_id,)).fetchone()
    return result_from_row(updated) if updated else None


def delete_result(result_id: int) -> bool:
    with connect() as db:
        cursor = db.execute("DELETE FROM results WHERE id = ?", (result_id,))
    return cursor.rowcount > 0


def list_articles(
    category: str | None = None,
    subcategory: str | None = None,
    *,
    include_hidden: bool = False,
) -> list[dict[str, Any]]:
    with connect() as db:
        visibility_filter = "" if include_hidden else " hidden = 0 AND "
        if category and subcategory:
            rows = db.execute(
                ARTICLE_SELECT
                + f" WHERE {visibility_filter} lower(category) = lower(?) AND lower(subcategory) = lower(?) ORDER BY published_at DESC",
                (category, subcategory),
            ).fetchall()
        elif category:
            rows = db.execute(
                ARTICLE_SELECT
                + f" WHERE {visibility_filter} lower(category) = lower(?) ORDER BY published_at DESC",
                (category,),
            ).fetchall()
        else:
            rows = db.execute(
                ARTICLE_SELECT
                + (" ORDER BY published_at DESC" if include_hidden else " WHERE hidden = 0 ORDER BY published_at DESC")
            ).fetchall()
    return [article_from_row(row) for row in rows]


def get_article(article_id: int) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            ARTICLE_SELECT + " WHERE articles.id = ?", (article_id,)
        ).fetchone()
    return article_from_row(row) if row else None


def create_article(
    *,
    category: str,
    subcategory: str | None,
    title: str,
    excerpt: str,
    published_at: str,
    reading_time: int,
    accent: str,
    author_id: int,
    image_url: str | None,
    image_alt: str | None,
    thumbnail_url: str | None,
    thumbnail_alt: str | None,
    featured_image_url: str | None,
    featured_image_alt: str | None,
    blocks: list[dict[str, str]],
) -> dict[str, Any]:
    with connect() as db:
        next_id = db.execute(
            "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM articles"
        ).fetchone()["next_id"]
        db.execute(
            """
            INSERT INTO articles (
                id, category, subcategory, title, excerpt, published_at, reading_time,
                featured, category_featured, hidden, accent, author_id, image_url, image_alt,
                thumbnail_url, thumbnail_alt, featured_image_url, featured_image_alt,
                content_json, quote
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                next_id,
                category,
                subcategory,
                title,
                excerpt,
                published_at,
                reading_time,
                accent,
                author_id,
                image_url,
                image_alt,
                thumbnail_url,
                thumbnail_alt,
                featured_image_url,
                featured_image_alt,
                json.dumps(blocks, ensure_ascii=False),
            ),
        )
        row = db.execute(
            ARTICLE_SELECT + " WHERE articles.id = ?", (next_id,)
        ).fetchone()
    return article_from_row(row)


def update_article(
    article_id: int,
    *,
    category: str,
    subcategory: str | None,
    title: str,
    excerpt: str,
    published_at: str,
    reading_time: int,
    accent: str,
    image_url: str | None,
    image_alt: str | None,
    thumbnail_url: str | None,
    thumbnail_alt: str | None,
    featured_image_url: str | None,
    featured_image_alt: str | None,
    blocks: list[dict[str, str]],
) -> dict[str, Any] | None:
    with connect() as db:
        exists = db.execute(
            "SELECT id FROM articles WHERE id = ?", (article_id,)
        ).fetchone()
        if exists is None:
            return None

        db.execute(
            """
            UPDATE articles
            SET category = ?,
                subcategory = ?,
                title = ?,
                excerpt = ?,
                published_at = ?,
                reading_time = ?,
                accent = ?,
                image_url = ?,
                image_alt = ?,
                thumbnail_url = ?,
                thumbnail_alt = ?,
                featured_image_url = ?,
                featured_image_alt = ?,
                content_json = ?,
                quote = NULL
            WHERE id = ?
            """,
            (
                category,
                subcategory,
                title,
                excerpt,
                published_at,
                reading_time,
                accent,
                image_url,
                image_alt,
                thumbnail_url,
                thumbnail_alt,
                featured_image_url,
                featured_image_alt,
                json.dumps(blocks, ensure_ascii=False),
                article_id,
            ),
        )
        row = db.execute(
            ARTICLE_SELECT + " WHERE articles.id = ?", (article_id,)
        ).fetchone()
    return article_from_row(row) if row else None


def set_article_hidden(article_id: int, hidden: bool) -> dict[str, Any] | None:
    with connect() as db:
        db.execute(
            "UPDATE articles SET hidden = ? WHERE id = ?",
            (int(hidden), article_id),
        )
        row = db.execute(
            ARTICLE_SELECT + " WHERE articles.id = ?", (article_id,)
        ).fetchone()
    return article_from_row(row) if row else None


def delete_article(article_id: int) -> bool:
    with connect() as db:
        cursor = db.execute("DELETE FROM articles WHERE id = ?", (article_id,))
    return cursor.rowcount > 0


def set_featured_article(article_id: int, scope: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            "SELECT category FROM articles WHERE id = ?", (article_id,)
        ).fetchone()
        if row is None:
            return None

        if scope == "home":
            db.execute("UPDATE articles SET featured = 0")
            db.execute("UPDATE articles SET featured = 1, hidden = 0 WHERE id = ?", (article_id,))
        elif scope == "category":
            db.execute(
                "UPDATE articles SET category_featured = 0 WHERE category = ?",
                (row["category"],),
            )
            db.execute(
                "UPDATE articles SET category_featured = 1, hidden = 0 WHERE id = ?",
                (article_id,),
            )
        else:
            raise ValueError("unsupported featured scope")

        updated = db.execute(
            ARTICLE_SELECT + " WHERE articles.id = ?", (article_id,)
        ).fetchone()
    return article_from_row(updated) if updated else None


def get_user(username: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
    return dict(row) if row else None


def verify_password(user: dict[str, Any], password: str) -> bool:
    salt = bytes.fromhex(user["password_salt"])
    supplied_hash = password_hash(password, salt)
    return secrets.compare_digest(supplied_hash, user["password_hash"])
