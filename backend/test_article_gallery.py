from fastapi.testclient import TestClient

from app import database
from app.main import app


def test_gallery_is_seeded_and_can_be_saved(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "gallery.db")
    database.init_database()
    client = TestClient(app)

    seeded = client.get("/api/articles/6").json()
    gallery = next(block for block in seeded["blocks"] if block.get("images"))
    assert len(gallery["images"]) == 7

    login = client.post(
        "/api/auth/login",
        json={"username": "redaktor", "password": "arena2026"},
    ).json()
    response = client.post(
        "/api/articles",
        headers={"Authorization": f"Bearer {login['token']}"},
        json={
            "category": "Tenis",
            "title": "Galeria turnieju",
            "excerpt": "Najlepsze zdjęcia z turnieju tenisowego.",
            "blocks": [
                {"type": "text", "content": "Galeria najważniejszych momentów."},
                {
                    "type": "image",
                    "images": [
                        {"src": "/images/tennis/one-crop.jpg", "original_src": "/images/tennis/one.jpg", "alt": "Pierwsze zdjęcie"},
                        {"src": "/images/tennis/two.jpg", "alt": "Drugie zdjęcie"},
                    ],
                },
            ],
        },
    )
    assert response.status_code == 201
    saved_gallery = response.json()["blocks"][1]
    assert [image["alt"] for image in saved_gallery["images"]] == [
        "Pierwsze zdjęcie",
        "Drugie zdjęcie",
    ]
    assert saved_gallery["images"][0]["src"].endswith("one-crop.jpg")
    assert saved_gallery["images"][0]["original_src"].endswith("one.jpg")
