from pathlib import Path
import os
import uuid

from fastapi.testclient import TestClient

import backend.main as main


def configure_test_database() -> str:
    database_path = Path(__file__).parent / f"weather-test-{uuid.uuid4().hex}.db"
    main.DATABASE_PATH = str(database_path)
    main.WEATHER_API_TOKEN = ""
    main.RATE_LIMIT_REQUESTS = 60
    main.RATE_LIMIT_WINDOW_SECONDS = 60
    main.rate_limit_hits.clear()
    main.init_database()
    return str(database_path)


def remove_test_database(database_path: str) -> None:
    try:
        if os.path.exists(database_path):
            os.remove(database_path)
    except PermissionError:
        pass


def test_health_endpoint():
    with TestClient(main.app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_recent_searches_are_persisted():
    database_path = configure_test_database()
    place = {
        "name": "Gaya",
        "admin1": "Bihar",
        "admin2": "Gaya",
        "country": "India",
        "latitude": 24.7914,
        "longitude": 85.0002,
        "timezone": "auto",
    }

    with TestClient(main.app) as client:
        save_response = client.post("/api/recent", json=place)
        list_response = client.get("/api/recent")

    remove_test_database(database_path)

    assert save_response.status_code == 200
    assert list_response.status_code == 200
    assert list_response.json()["results"][0]["name"] == "Gaya"


def test_api_token_can_protect_private_endpoints():
    database_path = configure_test_database()
    main.WEATHER_API_TOKEN = "test-token"

    with TestClient(main.app) as client:
        missing_token = client.get("/api/recent")
        valid_token = client.get("/api/recent", headers={"X-API-Token": "test-token"})

    main.WEATHER_API_TOKEN = ""
    remove_test_database(database_path)

    assert missing_token.status_code == 401
    assert valid_token.status_code == 200


def test_rate_limiter_blocks_excess_requests():
    database_path = configure_test_database()
    main.RATE_LIMIT_REQUESTS = 1

    with TestClient(main.app) as client:
        first = client.get("/api/recent")
        second = client.get("/api/recent")

    main.RATE_LIMIT_REQUESTS = 60
    main.rate_limit_hits.clear()
    remove_test_database(database_path)

    assert first.status_code == 200
    assert second.status_code == 429
