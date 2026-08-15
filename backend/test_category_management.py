from fastapi.testclient import TestClient

from app import database
from app.main import app


def test_categories_subcategories_and_article_assignments(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "categories.db")
    database.init_database()
    client = TestClient(app)

    categories = client.get("/api/categories").json()
    assert len(categories) == 5
    assert all(len(category["subcategories"]) >= 2 for category in categories)
    assert client.get("/api/articles/1").json()["subcategory"] is not None

    login = client.post(
        "/api/auth/login",
        json={"username": "redaktor", "password": "arena2026"},
    )
    headers = {"Authorization": f"Bearer {login.json()['token']}"}
    category = categories[0]

    subcategory = client.post(
        f"/api/categories/{category['id']}/subcategories",
        json={"name": "Transfery"},
        headers=headers,
    )
    assert subcategory.status_code == 201

    article = client.post(
        "/api/articles",
        json={
            "category": category["name"],
            "subcategory": "Transfery",
            "title": "Test kategorii",
            "excerpt": "Opis testowego artykułu",
            "blocks": [{"type": "text", "content": "Treść testowa"}],
        },
        headers=headers,
    )
    assert article.status_code == 201

    renamed_subcategory = client.put(
        f"/api/subcategories/{subcategory.json()['id']}",
        json={"name": "Rynek transferowy"},
        headers=headers,
    )
    assert renamed_subcategory.status_code == 200

    renamed_category = client.put(
        f"/api/categories/{category['id']}",
        json={"name": "Futbol", "accent": "#123abc"},
        headers=headers,
    )
    assert renamed_category.status_code == 200

    saved = client.get(f"/api/articles/{article.json()['id']}").json()
    assert saved["category"] == "Futbol"
    assert saved["subcategory"] == "Rynek transferowy"
    assert saved["accent"] == "#123abc"

    filtered = client.get(
        "/api/articles",
        params={"category": "Futbol", "subcategory": "Rynek transferowy"},
    ).json()
    assert [item["id"] for item in filtered] == [article.json()["id"]]

    blocked_delete = client.delete(
        f"/api/categories/{category['id']}", headers=headers
    )
    assert blocked_delete.status_code == 409

    removed_subcategory = client.delete(
        f"/api/subcategories/{subcategory.json()['id']}", headers=headers
    )
    assert removed_subcategory.status_code == 204
    assert client.get(f"/api/articles/{article.json()['id']}").json()["subcategory"] is None

    with database.connect() as db:
        cursor = db.execute(
            "INSERT INTO categories (name, accent, sort_order) VALUES (?, ?, ?)",
            ("Pusta kategoria", "#abcdef", 99),
        )
        empty_category_id = cursor.lastrowid
    assert client.delete(
        f"/api/categories/{empty_category_id}", headers=headers
    ).status_code == 204
