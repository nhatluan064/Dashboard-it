"""
Configuration module for IT Dashboard backend.
Contains all configuration settings for Flask, Auth, Network, and AD integration.
"""

import os
import secrets


class Config:
    """Main configuration class."""

    # Flask settings
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "it-dashboard-flask-secret-2026")
    DEBUG = os.environ.get("FLASK_DEBUG", "True").lower() == "true"
    HOST = os.environ.get("FLASK_HOST", "0.0.0.0")
    PORT = int(os.environ.get("FLASK_PORT", 5000))

    # Static files (frontend)
    FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")

    # Session settings
    SESSION_TYPE = "filesystem"
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    PERMANENT_SESSION_LIFETIME = 3600  # 1 hour

    # JWT settings - persistent secret
    JWT_SECRET = os.environ.get("JWT_SECRET", "it-dashboard-jwt-secret-key-2026")
    JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", 8))

    # Auth settings - Admin user store (file-based for simplicity)
    USERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "users.json")

    # Network scanner settings
    SCAN_TIMEOUT = int(os.environ.get("SCAN_TIMEOUT", 1000))  # ms for ping
    SCAN_MAX_WORKERS = int(os.environ.get("SCAN_MAX_WORKERS", 50))
    DEVICE_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "devices_cache.json")
    SCAN_INTERVAL_SECONDS = int(os.environ.get("SCAN_INTERVAL_SECONDS", 300))  # 5 minutes

    # Common ports to scan
    COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1723, 3389, 5900, 8080]

    # Remote management settings
    PSEXEC_PATH = os.environ.get("PSEXEC_PATH", r"C:\PsTools\PsExec.exe")
    WMIC_TIMEOUT = int(os.environ.get("WMIC_TIMEOUT", 30))  # seconds

    # RDP settings
    RDP_DOMAIN = os.environ.get("RDP_DOMAIN", "")
    RDP_RESOLUTION = os.environ.get("RDP_RESOLUTION", "1920x1080")

    # Active Directory settings
    AD_SERVER = os.environ.get("AD_SERVER", "")
    AD_PORT = int(os.environ.get("AD_PORT", 636))
    AD_USE_SSL = os.environ.get("AD_USE_SSL", "True").lower() == "true"
    AD_BASE_DN = os.environ.get("AD_BASE_DN", "")
    AD_BIND_DN = os.environ.get("AD_BIND_DN", "")
    AD_BIND_PASSWORD = os.environ.get("AD_BIND_PASSWORD", "")
    AD_SEARCH_OU = os.environ.get("AD_SEARCH_OU", "")  # Optional OU filter
    AD_TIMEOUT = int(os.environ.get("AD_TIMEOUT", 30))

    # Logging
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
    LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard.log")


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}


def get_config():
    """Get configuration based on environment."""
    env = os.environ.get("FLASK_ENV", "development")
    return config_by_name.get(env, DevelopmentConfig)
