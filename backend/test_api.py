from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_home_has_portal_sections() -> None:
    response = client.get("/api/home")
    payload = response.json()
    assert response.status_code == 200
    assert len(payload["articles"]) == 15
    assert payload["matches"]
    assert payload["standings"]


def test_missing_article_returns_404() -> None:
    assert client.get("/api/articles/999").status_code == 404


def test_football_article_has_full_content_and_image() -> None:
    payload = client.get("/api/articles/1").json()
    assert len(payload["content"]) >= 3
    assert payload["image_url"].startswith("/images/football/")


def test_tennis_article_has_full_content_and_image() -> None:
    payload = client.get("/api/articles/4").json()
    assert len(payload["content"]) >= 3
    assert payload["image_url"].startswith("/images/tennis/")


def test_every_sport_has_three_articles_by_jan_kowal() -> None:
    for category in ["Piłka nożna", "Tenis", "Formuła 1", "Siatkówka", "Kolarstwo"]:
        payload = client.get("/api/articles", params={"category": category}).json()
        assert len(payload) == 3
        assert all(article["author"] == "Jan Kowal" for article in payload)
        assert all("T" in article["published_at"] for article in payload)


def test_employee_can_log_in_read_session_and_log_out() -> None:
    login_response = client.post(
        "/api/auth/login",
        json={"username": "redaktor", "password": "arena2026"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_response = client.get("/api/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "redaktor"
    assert me_response.json()["full_name"] == "Jan Kowal"

    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_employee_login_rejects_invalid_password() -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "redaktor", "password": "niepoprawne"},
    )
    assert response.status_code == 401
