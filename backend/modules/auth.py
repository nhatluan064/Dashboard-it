"""
Authentication module for IT Dashboard.
Provides Windows local authentication using subprocess commands,
password hashing with bcrypt, and JWT-based session management.
"""

import json
import logging
import os
import subprocess
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import request, jsonify, session, current_app

logger = logging.getLogger(__name__)


class AuthManager:
    """Manages user authentication, authorization, and session tokens."""

    def __init__(self, app=None):
        self.app = app
        self.users_file = None
        self.users = {}
        if app:
            self.init_app(app)

    def init_app(self, app):
        """Initialize with Flask app configuration."""
        self.app = app
        self.users_file = app.config.get("USERS_FILE", "users.json")
        self.jwt_secret = app.config.get("JWT_SECRET", "default-secret-change-me")
        self.jwt_expiry_hours = app.config.get("JWT_EXPIRY_HOURS", 8)
        self._load_users()

    def _load_users(self):
        """Load users from JSON file."""
        try:
            if os.path.exists(self.users_file):
                with open(self.users_file, "r", encoding="utf-8") as f:
                    self.users = json.load(f)
                logger.info("Loaded %d users from %s", len(self.users), self.users_file)
            else:
                self.users = {}
                logger.info("No users file found, starting with empty user store")
        except (json.JSONDecodeError, IOError) as e:
            logger.error("Failed to load users file: %s", e)
            self.users = {}

    def _save_users(self):
        """Save users to JSON file."""
        try:
            os.makedirs(os.path.dirname(self.users_file) or ".", exist_ok=True)
            with open(self.users_file, "w", encoding="utf-8") as f:
                json.dump(self.users, f, indent=2)
            logger.info("Saved users to %s", self.users_file)
        except IOError as e:
            logger.error("Failed to save users file: %s", e)

    def register_user(self, username, password, is_admin=True):
        """
        Register a new user with bcrypt password hashing.

        Args:
            username: Windows username
            password: Plain text password (will be hashed)
            is_admin: Whether user has admin privileges

        Returns:
            dict with success status and message
        """
        username_lower = username.lower()
        if username_lower in self.users:
            return {"success": False, "message": "User already exists"}

        # Hash the password with bcrypt
        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        # Check if user is in local Windows Administrators group
        is_windows_admin = self._check_admin_group(username)

        self.users[username_lower] = {
            "password_hash": password_hash,
            "is_admin": is_admin and is_windows_admin,
            "is_windows_admin": is_windows_admin,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_login": None,
        }
        self._save_users()

        logger.info("User '%s' registered successfully (admin=%s)", username, is_admin)
        return {"success": True, "message": "User registered successfully"}

    def authenticate(self, username, password):
        """
        Authenticate a user by verifying password hash and Windows admin status.

        Args:
            username: Windows username
            password: Plain text password

        Returns:
            dict with success status, token, and user info
        """
        username_lower = username.lower()

        # Verify password against stored hash
        if username_lower not in self.users:
            # Auto-register: first user becomes admin
            if len(self.users) == 0:
                result = self.register_user(username, password, is_admin=True)
                if result["success"]:
                    logger.info("First user '%s' auto-registered as admin", username)
                else:
                    return {"success": False, "message": result["message"]}
            else:
                return {"success": False, "message": "Invalid credentials"}

        user = self.users[username_lower]

        # Verify bcrypt password
        if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
            logger.warning("Failed login attempt for user '%s'", username)
            return {"success": False, "message": "Invalid credentials"}

        # Re-check Windows admin group status
        is_windows_admin = self._check_admin_group(username)
        user["is_windows_admin"] = is_windows_admin
        user["is_admin"] = user.get("is_admin", False) and is_windows_admin

        # Update last login
        user["last_login"] = datetime.now(timezone.utc).isoformat()
        self._save_users()

        # Generate JWT token
        token = self._generate_token(username_lower, user["is_admin"])

        logger.info("User '%s' authenticated successfully", username)
        return {
            "success": True,
            "message": "Login successful",
            "token": token,
            "user": {
                "username": username,
                "is_admin": user["is_admin"],
                "is_windows_admin": is_windows_admin,
            },
        }

    def verify_token(self, token):
        """
        Verify a JWT token and return the payload.

        Args:
            token: JWT token string

        Returns:
            dict with valid status and payload or error
        """
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=["HS256"])
            # Check expiry
            if "exp" in payload:
                exp_dt = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
                if exp_dt < datetime.now(timezone.utc):
                    return {"valid": False, "message": "Token expired"}
            return {"valid": True, "payload": payload}
        except jwt.ExpiredSignatureError:
            return {"valid": False, "message": "Token expired"}
        except jwt.InvalidTokenError as e:
            return {"valid": False, "message": f"Invalid token: {str(e)}"}

    def _generate_token(self, username, is_admin):
        """Generate a JWT token for the user."""
        payload = {
            "username": username,
            "is_admin": is_admin,
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=self.jwt_expiry_hours),
        }
        return jwt.encode(payload, self.jwt_secret, algorithm="HS256")

    def _check_admin_group(self, username):
        """
        Check if a user is in the local Windows Administrators group.

        Args:
            username: Windows username to check

        Returns:
            bool: True if user is in Administrators group
        """
        try:
            result = subprocess.run(
                ["net", "localgroup", "Administrators"],
                capture_output=True,
                text=True,
                timeout=10,
                encoding="utf-8",
                errors="replace",
            )
            if result.returncode == 0:
                output = result.stdout.lower()
                return username.lower() in output
            return False
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
            logger.warning("Could not check admin group for '%s': %s", username, e)
            return False

    def get_user_info(self, username):
        """Get user info from the user store."""
        username_lower = username.lower()
        if username_lower in self.users:
            user = self.users[username_lower].copy()
            user.pop("password_hash", None)
            user["username"] = username
            return user
        return None

    def list_users(self):
        """List all registered users (without password hashes)."""
        result = []
        for username_lower, user_data in self.users.items():
            user = user_data.copy()
            user.pop("password_hash", None)
            result.append(user)
        return result


def token_required(f):
    """Decorator to require a valid JWT token for API routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Check Authorization header
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

        # Also check session
        if not token:
            token = session.get("token")

        if not token:
            return jsonify({"success": False, "message": "Authentication required"}), 401

        auth_manager = current_app.auth_manager
        result = auth_manager.verify_token(token)

        if not result["valid"]:
            return jsonify({"success": False, "message": result["message"]}), 401

        # Attach user info to request
        request.user = result["payload"]
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator to require admin privileges for API routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

        if not token:
            token = session.get("token")

        if not token:
            return jsonify({"success": False, "message": "Authentication required"}), 401

        auth_manager = current_app.auth_manager
        result = auth_manager.verify_token(token)

        if not result["valid"]:
            return jsonify({"success": False, "message": result["message"]}), 401

        if not result["payload"].get("is_admin"):
            return jsonify({"success": False, "message": "Admin privileges required"}), 403

        request.user = result["payload"]
        return f(*args, **kwargs)
    return decorated
